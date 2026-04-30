-- supabase/migrations/00098_drawer_polish.sql
-- Drawer polish: manual discount reason, transaction metadata,
-- automatic-discount snapshot. Additive nullable columns + one boolean.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manual_discount_reason       text,
  ADD COLUMN IF NOT EXISTS payment_transaction_at       timestamptz,
  ADD COLUMN IF NOT EXISTS payment_reference_number     text,
  ADD COLUMN IF NOT EXISTS apply_automatic_discounts    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automatic_discount_snapshot  jsonb;

COMMIT;
