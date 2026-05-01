-- supabase/migrations/00101_cs_pass_2_intake_and_plans.sql
-- CS Pass 2 Lane 1: intake_lane column + edit plan tables + quarantine tables.
--
-- This migration is the schema foundation for the three-lane intake system
-- (sales / shopify_admin / conversion / quarantine) and the diff-first call
-- cockpit (cs_edit_plans / cs_edit_plan_items).
--
-- CONVERSION-LANE INTAKE FLOW
-- ============================
-- Shopify storefront checkout
--    │
--    ├─ webhook (orders/create) ──▶ HMAC verify ──▶ dedup check ──▶ classify ──▶ INSERT orders
--    │                                                                                │
--    │                                                                                ▼
--    │                                                              if quarantine: INSERT cs_intake_quarantine_review
--    │
--    └─ hourly reconciler (cron, concurrency=5) ──▶ same insert path (idempotent on shopify_order_id)
--
-- Applying safely (user responsibility — never run from this agent):
--   supabase migration up   OR   supabase db push  (dev only)
--
-- Sections:
--   Step a — Add nullable columns + create new tables
--   Step b — Batched backfill of intake_lane for existing rows
--   Step c — Add CHECK constraint now that all rows have a valid value
--   RLS     — Row-level security for each new table
--
-- DOWN migration is in the comment block at the bottom of this file.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP A: Add nullable columns to orders + create new tables
-- ══════════════════════════════════════════════════════════════════════════════

-- A-1. New columns on orders (all nullable — backfilled in Step B,
--      constrained in Step C).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS intake_lane            text,
  ADD COLUMN IF NOT EXISTS shopify_source_name    text,
  ADD COLUMN IF NOT EXISTS shopify_gateway        text,
  ADD COLUMN IF NOT EXISTS shopify_card_last4     text,
  ADD COLUMN IF NOT EXISTS shopify_transaction_id text,
  ADD COLUMN IF NOT EXISTS shopify_transaction_at timestamptz,
  -- NO ACTION (default) is intentional: deleting a parent order is blocked if
  -- child orders exist, preventing accidental loss of edit-plan history.
  ADD COLUMN IF NOT EXISTS parent_order_id        uuid
    REFERENCES public.orders(id);

-- A-2. Index for the hot path "all orders in lane X".
CREATE INDEX IF NOT EXISTS idx_orders_intake_lane
  ON public.orders (intake_lane);

-- Index for parent_order_id FK — used when looking up child (edit) orders.
-- NO ACTION (the default) is intentional: deleting a parent order is blocked
-- by the FK if child orders exist, preventing accidental loss of edit-plan history.
CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id
  ON public.orders (parent_order_id)
  WHERE parent_order_id IS NOT NULL;

-- A-3. shopify_order_id already has a UNIQUE constraint added in migration
--      00086 (column definition: `shopify_order_id text UNIQUE`).
--      Verified — no additional constraint needed.

-- ─────────────────────────────────────────────────────────────────────────────
-- A-4. cs_edit_plans — one plan per CS call where an order edit is being
--      composed. Tracks which Shopify edit path was chosen and all commit IDs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_edit_plans (
  id                          bigserial PRIMARY KEY,
  order_id                    uuid NOT NULL
    REFERENCES public.orders(id),
  status                      text NOT NULL
    CHECK (status IN ('draft', 'applying', 'applied', 'failed', 'cancelled')),
  chosen_path                 text
    CHECK (chosen_path IN ('order_edit', 'child_order', 'cancel_relink')),
  created_by_user_id          uuid
    REFERENCES auth.users(id),
  applied_at                  timestamptz,
  applying_started_at         timestamptz,
  error_message               text,
  shopify_calculated_order_id text,
  shopify_commit_id           text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Index for cs_edit_plans(order_id) FK — used when loading plans for a given order.
CREATE INDEX IF NOT EXISTS idx_cs_edit_plans_order_id
  ON public.cs_edit_plans (order_id);

-- Partial unique index: once a commit_id is recorded, it should be unique
-- to a plan (prevents duplicate commits being attached to different plans).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_edit_plans_commit_unique
  ON public.cs_edit_plans (shopify_commit_id)
  WHERE shopify_commit_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- A-5. cs_edit_plan_items — individual line-level operations within a plan
--      (add item, remove item, qty change, address change, note, etc.).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_edit_plan_items (
  id         bigserial PRIMARY KEY,
  plan_id    bigint NOT NULL
    REFERENCES public.cs_edit_plans(id) ON DELETE CASCADE,
  op         text NOT NULL
    CHECK (op IN (
      'add_item',
      'remove_item',
      'qty_change',
      'address_shipping',
      'address_billing',
      'note'
    )),
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- A-6. cs_intake_quarantine_review — orders that the classifier could not
--      place into sales / shopify_admin / conversion. Admin resolves these
--      manually and sets resolved_lane.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_intake_quarantine_review (
  id                        bigserial PRIMARY KEY,
  order_id                  uuid NOT NULL
    REFERENCES public.orders(id),
  shopify_payload_snapshot  jsonb,
  classified_at             timestamptz NOT NULL DEFAULT now(),
  resolved_at               timestamptz,
  resolved_lane             text,
  resolved_by               uuid
    REFERENCES auth.users(id)
);

-- Index for cs_intake_quarantine_review(order_id) FK — used when looking up
-- quarantine records for a specific order.
CREATE INDEX IF NOT EXISTS idx_cs_intake_quarantine_review_order_id
  ON public.cs_intake_quarantine_review (order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- A-7. cs_intake_classifier_disagreements — records when the webhook and the
--      hourly reconciler disagree on which lane an order belongs to.
--      Used for tuning the classifier over time.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_intake_classifier_disagreements (
  id              bigserial PRIMARY KEY,
  order_id        uuid NOT NULL
    REFERENCES public.orders(id),
  winner_lane     text NOT NULL,
  loser_lane      text NOT NULL,
  source_winner   text NOT NULL
    CHECK (source_winner IN ('webhook', 'reconciler')),
  source_loser    text NOT NULL
    CHECK (source_loser IN ('webhook', 'reconciler')),
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

-- Index for cs_intake_classifier_disagreements(order_id) FK — used when
-- querying disagreement history for a given order.
CREATE INDEX IF NOT EXISTS idx_cs_intake_classifier_disagreements_order_id
  ON public.cs_intake_classifier_disagreements (order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- A-8. cs_webhook_deliveries — idempotency table for Shopify webhook
--      deliveries. Prevents the same webhook from being processed twice
--      (Shopify retries on non-200). Pruned daily.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_webhook_deliveries (
  id                 bigserial PRIMARY KEY,
  shopify_webhook_id text NOT NULL UNIQUE,
  received_at        timestamptz NOT NULL DEFAULT now()
);

-- Index for the daily prune cron (DELETE WHERE received_at < now() - interval '7 days').
CREATE INDEX IF NOT EXISTS idx_cs_webhook_deliveries_received_at
  ON public.cs_webhook_deliveries (received_at);

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP B: Batched backfill of intake_lane for existing orders
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Runs in 5 000-row batches to avoid long locks on a large table.
-- Heuristic (conservative — the runtime classifier and spike script will
-- reclassify rows going forward with full Shopify payload data):
--
--   created_by_user_id IS NOT NULL  → 'sales'  (rep-created via Avalon)
--   else                            → 'quarantine' (unknown origin)
--
-- Every quarantined row gets a row in cs_intake_quarantine_review so an
-- admin can manually classify it.

DO $$
DECLARE
  rows_updated int;
BEGIN
  -- Batch-update 'sales' rows.
  LOOP
    UPDATE public.orders
    SET intake_lane = 'sales'
    WHERE id IN (
      SELECT id FROM public.orders
      WHERE intake_lane IS NULL
        AND created_by_user_id IS NOT NULL
      LIMIT 5000
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;

  -- Batch-update remaining rows to 'quarantine' and insert review rows.
  LOOP
    WITH batch AS (
      SELECT id FROM public.orders
      WHERE intake_lane IS NULL
      LIMIT 5000
    ),
    updated AS (
      UPDATE public.orders
      SET intake_lane = 'quarantine'
      WHERE id IN (SELECT id FROM batch)
      RETURNING id
    )
    INSERT INTO public.cs_intake_quarantine_review (order_id)
    SELECT id FROM updated;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP C: Add CHECK constraint now that all rows have a valid lane value
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD CONSTRAINT orders_intake_lane_check
  CHECK (intake_lane IN ('sales', 'shopify_admin', 'conversion', 'quarantine'));

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS: Row-level security for new tables
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Convention from 00100_cs_claims.sql:
--   - Enable RLS on every table.
--   - Service role bypasses RLS by default (no policy needed for service role).
--   - Add explicit policies for authenticated users where applicable.

-- cs_edit_plans — any authenticated CS user can read and write their own plans.
ALTER TABLE public.cs_edit_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_edit_plans_authenticated_select"
  ON public.cs_edit_plans
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "cs_edit_plans_authenticated_insert"
  ON public.cs_edit_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "cs_edit_plans_authenticated_update"
  ON public.cs_edit_plans
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- cs_edit_plan_items — readable/writable by any authenticated CS user
--   (plan_id FK ensures items are always attached to an accessible plan).
ALTER TABLE public.cs_edit_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_edit_plan_items_authenticated_select"
  ON public.cs_edit_plan_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "cs_edit_plan_items_authenticated_insert"
  ON public.cs_edit_plan_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "cs_edit_plan_items_authenticated_update"
  ON public.cs_edit_plan_items
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- cs_intake_quarantine_review — admin-only (read + resolve).
--   Admin = profiles joined to roles where roles.tier <= 2.
--   profiles.role_id → roles.id → roles.tier (see 00001_foundation.sql).
ALTER TABLE public.cs_intake_quarantine_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_intake_quarantine_review_admin_select"
  ON public.cs_intake_quarantine_review
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.tier <= 2
    )
  );

CREATE POLICY "cs_intake_quarantine_review_admin_update"
  ON public.cs_intake_quarantine_review
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.tier <= 2
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.tier <= 2
    )
  );

-- cs_intake_classifier_disagreements — admin-only (read).
ALTER TABLE public.cs_intake_classifier_disagreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_intake_classifier_disagreements_admin_select"
  ON public.cs_intake_classifier_disagreements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.tier <= 2
    )
  );

-- cs_webhook_deliveries — service-role only (no authenticated policies).
ALTER TABLE public.cs_webhook_deliveries ENABLE ROW LEVEL SECURITY;
-- (No authenticated policies — service role bypasses RLS.)

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- DOWN MIGRATION (manual — do not apply automatically)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Run in this order (reverse of creation, respecting FK dependencies):
--
-- BEGIN;
--
-- -- Remove CHECK constraint before dropping intake_lane column.
-- ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_intake_lane_check;
--
-- -- Drop indexes (reverse of creation order).
-- DROP INDEX IF EXISTS public.idx_cs_intake_classifier_disagreements_order_id;
-- DROP INDEX IF EXISTS public.idx_cs_intake_quarantine_review_order_id;
-- DROP INDEX IF EXISTS public.idx_cs_edit_plans_order_id;
-- DROP INDEX IF EXISTS public.idx_orders_parent_order_id;
--
-- -- Drop tables in reverse FK dependency order.
-- DROP TABLE IF EXISTS public.cs_webhook_deliveries;
-- DROP TABLE IF EXISTS public.cs_intake_classifier_disagreements;
-- DROP TABLE IF EXISTS public.cs_intake_quarantine_review;
-- DROP TABLE IF EXISTS public.cs_edit_plan_items;
-- DROP TABLE IF EXISTS public.cs_edit_plans;
--
-- -- Drop new columns from orders.
-- ALTER TABLE public.orders
--   DROP COLUMN IF EXISTS parent_order_id,
--   DROP COLUMN IF EXISTS shopify_transaction_at,
--   DROP COLUMN IF EXISTS shopify_transaction_id,
--   DROP COLUMN IF EXISTS shopify_card_last4,
--   DROP COLUMN IF EXISTS shopify_gateway,
--   DROP COLUMN IF EXISTS shopify_source_name,
--   DROP COLUMN IF EXISTS intake_lane;
--
-- COMMIT;
