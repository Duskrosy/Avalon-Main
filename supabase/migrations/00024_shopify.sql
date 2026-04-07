-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00024: Shopify Integration
-- Stores a normalised snapshot of Shopify orders for auto-fill and reconciliation.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: normalise an order ID string to digits only ──────────────────────
-- Used in reconciliation queries so "#1234", "1234", "SHOP-1234" all match.
CREATE OR REPLACE FUNCTION public.normalise_order_id(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(v, '[^0-9]', '', 'g');
$$;

-- ── shopify_orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shopify_orders (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Shopify identifiers
  shopify_order_id        text        NOT NULL UNIQUE,         -- Shopify's large numeric ID (as text)
  order_number            integer     NOT NULL,                -- e.g. 1234
  order_number_display    text        GENERATED ALWAYS AS ('#' || order_number::text) STORED,

  -- Order metadata
  created_at_shopify      timestamptz NOT NULL,
  financial_status        text,                                -- paid | pending | refunded | voided
  fulfillment_status      text,                                -- fulfilled | null | partial | restocked

  -- Financials
  total_price             numeric(12, 2) NOT NULL DEFAULT 0,   -- in store currency (PHP)

  -- Products
  line_items              jsonb       NOT NULL DEFAULT '[]',   -- raw Shopify line_items array
  first_line_item_name    text,                                -- denormalised for fast display
  total_quantity          integer     NOT NULL DEFAULT 0,      -- sum of all line item quantities

  -- Payment
  payment_gateway         text,                                -- cod | gcash | stripe | manual | etc.

  -- Customer
  customer_name           text,
  customer_email          text,

  -- Attribution (extracted at sync time)
  tags                    text,                                -- raw Shopify tags string
  note_attributes         jsonb       NOT NULL DEFAULT '[]',   -- raw Shopify note_attributes array
  attributed_agent_handle text,                                -- extracted from tags/note_attributes
  attributed_agent_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Raw data + audit
  raw_payload             jsonb,
  last_synced_at          timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_number
  ON public.shopify_orders (order_number);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at_shopify
  ON public.shopify_orders (created_at_shopify DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_attributed_agent
  ON public.shopify_orders (attributed_agent_id)
  WHERE attributed_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopify_orders_financial_status
  ON public.shopify_orders (financial_status);

-- Updated-at trigger
CREATE TRIGGER shopify_orders_updated_at
  BEFORE UPDATE ON public.shopify_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── shopify_sync_runs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shopify_sync_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  status          text        NOT NULL DEFAULT 'running'
                                CHECK (status IN ('running', 'success', 'failed')),
  triggered_by    text        NOT NULL CHECK (triggered_by IN ('cron', 'manual')),
  sync_date       date        NOT NULL,
  orders_synced   integer     DEFAULT 0,
  orders_new      integer     DEFAULT 0,
  orders_updated  integer     DEFAULT 0,
  error_log       text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.shopify_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_sync_runs ENABLE ROW LEVEL SECURITY;

-- All authenticated users may read (sales agents need this for the order lookup)
CREATE POLICY "shopify_orders_read"
  ON public.shopify_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "shopify_sync_runs_read"
  ON public.shopify_sync_runs FOR SELECT TO authenticated USING (true);

-- Writes are via createAdminClient() (service role) — no INSERT/UPDATE policies needed.
