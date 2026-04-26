-- ============================================================
-- 00093_sales_confirmed_sales_legacy.sql
-- Phase 2 cutover — sales_confirmed_sales becomes a read-only archive.
--
-- Background: Phase 1 (00086) shipped the new orders + order_items tables.
-- The legacy `sales_confirmed_sales` table (00006) was kept writable so
-- existing executive/sales-ops dashboards continued to work during the
-- transition. With the new tracker now the daily-driver, this migration
-- archives the legacy table without breaking those readers:
--
--   • The actual table is renamed to `sales_confirmed_sales_legacy`.
--   • A read-only view named `sales_confirmed_sales` is created over it,
--     so existing SELECTs in the executive + sales-ops pages keep working
--     unchanged.
--   • Writes to `sales_confirmed_sales` (the view) fail at the SQL layer —
--     the legacy POST/PATCH/DELETE API also returns 410 Gone.
--
-- Reversibility: this is a non-destructive cutover. Drop the view + rename
-- back to undo. Audit log triggers + RLS settings travel with the renamed
-- table.
-- ============================================================

-- 1. Rename the table.
ALTER TABLE IF EXISTS public.sales_confirmed_sales
  RENAME TO sales_confirmed_sales_legacy;

-- 2. Create a read-only view at the old name so existing readers keep working.
--    Views are not auto-updatable for non-trivial shapes; we also revoke
--    INSERT/UPDATE/DELETE explicitly to fail loudly on accidental writes.
DROP VIEW IF EXISTS public.sales_confirmed_sales;
CREATE VIEW public.sales_confirmed_sales AS
  SELECT * FROM public.sales_confirmed_sales_legacy;

-- 3. Lock down writes on the view. The PostgREST role names match Supabase
--    defaults; if your project uses different role names, adjust here.
REVOKE INSERT, UPDATE, DELETE ON public.sales_confirmed_sales FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.sales_confirmed_sales FROM authenticated, anon';
EXCEPTION WHEN undefined_object THEN
  -- One of the roles doesn't exist; ignore.
  NULL;
END $$;

-- Grant SELECT explicitly so the existing readers continue.
GRANT SELECT ON public.sales_confirmed_sales TO PUBLIC;
DO $$ BEGIN
  EXECUTE 'GRANT SELECT ON public.sales_confirmed_sales TO authenticated, anon, service_role';
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- 4. Notes
-- • New writes belong on `public.orders` + `public.order_items` (00086).
-- • The `/api/sales/confirmed-sales` route returns 410 Gone for POST/PATCH/DELETE
--   in this same release; GET continues to read through the view.
-- • An admin-only history page can be added later under /admin/legacy-confirmed-sales
--   without further schema changes — the table is queryable directly by name.
