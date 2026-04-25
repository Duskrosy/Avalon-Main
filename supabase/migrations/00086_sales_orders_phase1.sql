-- ============================================================
-- 00086_sales_orders_phase1.sql
-- Avalon Sales Tracker — Phase 1 Foundation
--
-- New customer-facing sales tracker built on top of:
--   • Inventory v1 (00076-00078): product_variants + inventory_balances
--   • Existing Shopify client + shopify_orders cache (00024)
--   • profiles + audit_log_trigger + set_updated_at (00001-00002)
--
-- This migration adds the ORDER LIFECYCLE layer:
--   • customers (local mirror with shopify_customer_id back-pointer)
--   • orders (draft-first; Avalon owns lifecycle, syncs to Shopify on Confirm)
--   • order_items (FK to product_variants for Inventory v1 truth)
--   • order_shopify_syncs (per-attempt audit trail for idempotent retries)
--
-- Design doc:
--   ~/.gstack/projects/Duskrosy-Avalon-Main/
--     fc-international-1-main-design-20260424-221238.md
--
-- Phase 2 will add: order_completion_meta dialog UI, /tnvs-orders route,
--                   sales_confirmed_sales legacy archive cutover.
-- Phase 3 will add: order_adjustments, handoff_options, PSGC address tables.
-- ============================================================


-- ==========================
-- 0. EXTENSIONS
-- ==========================
-- Trigram search for customer name lookup. Supabase usually has this
-- enabled but it isn't guaranteed per project.
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ==========================
-- 1. ENUMS
-- ==========================
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'draft', 'confirmed', 'cancelled', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- sync_status semantics:
--   not_synced  = draft, never attempted
--   syncing     = crash-recovery state. Row is mid-sync. If this state persists
--                 > 5 min for a `confirmed` order with shopify_order_id IS NULL,
--                 the reconciler cron retries with the idempotency guard.
--   synced      = Shopify POST succeeded, shopify_order_id populated.
--   failed      = Shopify POST returned an error; sync_error captured.
DO $$ BEGIN
  CREATE TYPE public.order_sync_status AS ENUM (
    'not_synced', 'syncing', 'synced', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- PIC types match the handoff spec. Add via ALTER TYPE if a 4th appears.
DO $$ BEGIN
  CREATE TYPE public.order_pic_type AS ENUM (
    'user', 'custom', 'lalamove'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_route_type AS ENUM (
    'normal', 'tnvs'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_completion_status AS ENUM (
    'incomplete', 'complete'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- order_shopify_syncs lifecycle:
--   pending     = attempt registered, POST not started
--   in_flight   = POST started, response not received
--   succeeded   = Shopify returned 201, shopify_order_id captured
--   failed      = Shopify error, message captured
--   cancelled   = revert-to-draft superseded this attempt
DO $$ BEGIN
  CREATE TYPE public.order_sync_attempt_status AS ENUM (
    'pending', 'in_flight', 'succeeded', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ==========================
-- 2. PHONE CANONICALIZATION
-- ==========================
-- Single source of truth for phone canonical form. Used by:
--   1. customers.canonical_phone GENERATED column
--   2. server-side dedup queries (POST /api/sales/customers)
-- TS canonicalPhone() in src/lib/sales/customer-dedup.ts is UI-only.
CREATE OR REPLACE FUNCTION public.canonicalize_phone(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT CASE
    WHEN raw IS NULL OR length(trim(raw)) = 0 THEN NULL
    ELSE regexp_replace(
      CASE
        WHEN raw ~ '^\+'  THEN raw
        WHEN raw ~ '^63'  THEN '+' || raw
        WHEN raw ~ '^0'   THEN '+63' || substring(raw from 2)
        ELSE '+' || raw
      END,
      '[^0-9+]', '', 'g'
    )
  END;
$$;


-- ==========================
-- 3. CUSTOMERS
-- ==========================
CREATE TABLE IF NOT EXISTS public.customers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id   text UNIQUE,                  -- null until synced or imported
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  full_name             text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email                 text,
  phone                 text,

  -- Phase 1: free-text PH address. Phase 3 adds region_code/city_code/barangay_code FKs.
  address_line_1        text,
  address_line_2        text,
  city_text             text,
  region_text           text,
  postal_code           text,
  full_address          text,                         -- denormalized for display

  -- Single-source-of-truth canonical phone (calls public.canonicalize_phone).
  canonical_phone       text GENERATED ALWAYS AS (public.canonicalize_phone(phone)) STORED,

  -- Phase 2's completion flow updates this.
  total_orders_cached   integer NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_shopify_id
  ON public.customers (shopify_customer_id) WHERE shopify_customer_id IS NOT NULL;

-- Trigram index supports the customer search typeahead (gin + lower normalization
-- via the application; trgm itself is case-insensitive on the byte comparison).
CREATE INDEX IF NOT EXISTS idx_customers_full_name_trgm
  ON public.customers USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON public.customers (phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_email
  ON public.customers (lower(email)) WHERE email IS NOT NULL;

-- Prevent two concurrent /api/sales/customers POSTs from creating duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_canonical_phone
  ON public.customers (canonical_phone) WHERE canonical_phone IS NOT NULL;


-- ==========================
-- 4. ORDERS
-- ==========================
-- avalon_order_number is allocated at confirm-time (NOT at draft-create) to
-- avoid gaps from abandoned drafts. Column is nullable; sequence runs only
-- inside the Confirm RPC after inventory_allocate succeeds.
CREATE SEQUENCE IF NOT EXISTS public.avalon_order_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.next_avalon_order_number()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'AV-' || nextval('public.avalon_order_number_seq')::text;
$$;

CREATE TABLE IF NOT EXISTS public.orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avalon_order_number       text UNIQUE,             -- NULL while draft; set at confirm
  shopify_order_id          text UNIQUE,             -- NULL until sync succeeds
  customer_id               uuid NOT NULL REFERENCES public.customers(id),
  created_by_user_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name           text,                    -- snapshot for audit if profile deleted

  status                    public.order_status NOT NULL DEFAULT 'draft',
  sync_status               public.order_sync_status NOT NULL DEFAULT 'not_synced',
  sync_error                text,                    -- last error from Shopify

  subtotal_amount           numeric(12,2) NOT NULL DEFAULT 0,
  voucher_code              text,
  voucher_discount_amount   numeric(12,2) NOT NULL DEFAULT 0,
  manual_discount_amount    numeric(12,2) NOT NULL DEFAULT 0,
  shipping_fee_amount       numeric(12,2) NOT NULL DEFAULT 0,
  final_total_amount        numeric(12,2) NOT NULL DEFAULT 0,
  currency_code             text NOT NULL DEFAULT 'PHP',
  mode_of_payment           text,                    -- "COD", "GCash", etc. — informational

  person_in_charge_type     public.order_pic_type,
  person_in_charge_user_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  person_in_charge_label    text,                    -- "Lalamove", "CS-Joan", etc.

  route_type                public.order_route_type NOT NULL DEFAULT 'normal',
  completion_status         public.order_completion_status NOT NULL DEFAULT 'incomplete',

  notes                     text,

  -- Completion fields land DIRECTLY on orders in Phase 1 (per rev 2). The Phase 2
  -- "Complete this order" dialog UI reads/writes these columns; no separate
  -- order_completion_meta table is needed.
  net_value_amount          numeric(12,2),           -- what ops actually collected
  is_abandoned_cart         boolean,
  ad_campaign_source        text,                    -- FK-lite to ad-ops/live-ads
  alex_ai_assist            boolean,
  delivery_status           text,
  completed_by_user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at              timestamptz,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  confirmed_at              timestamptz,             -- set when Confirm RPC commits T1
  deleted_at                timestamptz,             -- soft-delete, paired with status='cancelled'

  CONSTRAINT chk_orders_amounts_nonneg CHECK (
    subtotal_amount         >= 0 AND
    voucher_discount_amount >= 0 AND
    manual_discount_amount  >= 0 AND
    shipping_fee_amount     >= 0 AND
    final_total_amount      >= 0
  ),
  CONSTRAINT chk_orders_completion_amount CHECK (
    net_value_amount IS NULL OR net_value_amount >= 0
  ),
  -- Invariant: deleted_at is set IFF status = 'cancelled'.
  CONSTRAINT chk_orders_cancel_invariant CHECK (
    (deleted_at IS NULL     AND status <> 'cancelled') OR
    (deleted_at IS NOT NULL AND status =  'cancelled')
  ),
  -- PIC type discriminator must agree with the populated id/label fields.
  CONSTRAINT chk_orders_pic_shape CHECK (
    person_in_charge_type IS NULL OR
    (person_in_charge_type = 'user'     AND person_in_charge_user_id IS NOT NULL) OR
    (person_in_charge_type = 'custom'   AND person_in_charge_label   IS NOT NULL) OR
    (person_in_charge_type = 'lalamove')
  )
);

CREATE INDEX IF NOT EXISTS idx_orders_customer
  ON public.orders (customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_by
  ON public.orders (created_by_user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_route
  ON public.orders (route_type, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_avalon_number
  ON public.orders (avalon_order_number) WHERE avalon_order_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shopify_id
  ON public.orders (shopify_order_id) WHERE shopify_order_id IS NOT NULL;

-- The reconciler cron sweeps stuck syncing rows. >99% of rows are not 'syncing',
-- so a partial index keeps the cron query cheap regardless of table size.
CREATE INDEX IF NOT EXISTS idx_orders_syncing
  ON public.orders (updated_at) WHERE sync_status = 'syncing';

-- scope=all orders list, recency-ordered.
CREATE INDEX IF NOT EXISTS idx_orders_active_created_at
  ON public.orders (created_at DESC) WHERE deleted_at IS NULL;


-- ==========================
-- 5. ORDER ITEMS
-- ==========================
-- inventory_source is plain text (not enum). Single value today; adding values
-- later does not need an ALTER TYPE dance.
CREATE TABLE IF NOT EXISTS public.order_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- FKs for identity. product_variant_id FKs into Inventory v1.
  product_variant_id          uuid REFERENCES public.product_variants(id),
  shopify_product_id          text,
  shopify_variant_id          text,

  -- Snapshots for audit (prices change, variants get archived).
  product_name                text NOT NULL,
  variant_name                text,
  image_url                   text,
  size                        text,
  color                       text,

  quantity                    integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_amount           numeric(12,2) NOT NULL,
  -- adjusted_unit_price_amount: column lands in Phase 1 so Phase 3's bundle-split
  -- helper doesn't need a schema migration. Phase 1's bundle-split utility
  -- writes directly to this column. Receipt + Shopify POST use COALESCE.
  adjusted_unit_price_amount  numeric(12,2),
  line_total_amount           numeric(12,2) NOT NULL,

  inventory_source            text NOT NULL DEFAULT 'avalon',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_order_items_price_nonneg CHECK (
    unit_price_amount >= 0 AND
    (adjusted_unit_price_amount IS NULL OR adjusted_unit_price_amount >= 0) AND
    line_total_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_variant
  ON public.order_items (product_variant_id) WHERE product_variant_id IS NOT NULL;


-- ==========================
-- 6. ORDER SHOPIFY SYNCS — durable per-attempt audit trail
-- ==========================
-- Replaces the note_attributes-only idempotency strategy. Every confirm + retry
-- inserts a row here BEFORE calling Shopify. The retry path uses
-- `SELECT FOR UPDATE SKIP LOCKED` on this table to prevent concurrent
-- create-on-retry duplication (codex outside-voice finding #2, applied per rev 2).
CREATE TABLE IF NOT EXISTS public.order_shopify_syncs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  attempt_number         integer NOT NULL,                      -- monotonic per order
  avalon_order_number    text NOT NULL,                          -- snapshot at confirm time
  shopify_order_id       text,                                   -- populated on success
  status                 public.order_sync_attempt_status NOT NULL DEFAULT 'pending',
  sync_started_at        timestamptz NOT NULL DEFAULT now(),
  sync_finished_at       timestamptz,
  cancelled_at           timestamptz,                            -- set if revert-to-draft superseded
  error_message          text,
  shopify_response_body  jsonb,                                  -- captured for debugging
  UNIQUE (order_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_oss_order
  ON public.order_shopify_syncs (order_id);

-- Reconciler queries on (status IN ('pending','in_flight'), age) — partial index.
CREATE INDEX IF NOT EXISTS idx_oss_in_flight
  ON public.order_shopify_syncs (sync_started_at)
  WHERE status IN ('pending', 'in_flight');

-- Fast lookup by avalon_order_number for the secondary idempotency guard
-- (note_attributes search recovery path).
CREATE INDEX IF NOT EXISTS idx_oss_avalon_number
  ON public.order_shopify_syncs (avalon_order_number);


-- ==========================
-- 7. TRIGGERS — updated_at + audit
-- ==========================
-- Reuse the existing public.set_updated_at + public.audit_log_trigger from 00001.
DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_order_items_updated_at ON public.order_items;
CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- order_shopify_syncs has no updated_at (immutable per-attempt log; only specific
-- columns mutate via UPDATEs to status/finished_at/error_message). Audit trigger
-- still wired below for full lifecycle visibility.

DROP TRIGGER IF EXISTS trg_audit_customers ON public.customers;
CREATE TRIGGER trg_audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_orders ON public.orders;
CREATE TRIGGER trg_audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_order_items ON public.order_items;
CREATE TRIGGER trg_audit_order_items
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_order_shopify_syncs ON public.order_shopify_syncs;
CREATE TRIGGER trg_audit_order_shopify_syncs
  AFTER INSERT OR UPDATE OR DELETE ON public.order_shopify_syncs
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- 8. RLS — disabled (server-enforced permissions, matches existing Avalon pattern)
-- ==========================
-- Per design: src/lib/permissions + getCurrentUser handles auth. No RLS in v1.
-- ALTER TABLE statements left out intentionally; rely on Supabase service-role
-- key in src/lib/supabase/admin.ts for server-side writes, and authenticated
-- clients only via the Next.js API routes (never directly from the browser).