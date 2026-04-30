-- supabase/migrations/00096_cs_confirmed_orders.sql
-- CS Confirmed Orders + order flow redesign.
-- Additive: new columns on orders, new enums, lifecycle view, receipts bucket.
--
-- Schema-link notes (see commit body / plan Task 1):
--   * The plan's lifecycle view references `shipments` / `shipment_events`,
--     but those tables don't exist in this schema. The actual ops tracking
--     lives in `dispatch_queue` + `courier_events`, and `dispatch_queue.order_id`
--     references `ops_orders.id`, NOT `public.orders.id`. Until a bridge
--     migration links courier events back to `public.orders`, the
--     `latest_event` CTE is stubbed to return zero rows.
--   * `inventory_movements` (post-00076) has no `order_id` column either —
--     replenishments are linked via `reference_type` / `reference_id` and not
--     yet pinned to orders. The `replenish_event` CTE is also stubbed.
--   Both stubs preserve the view's row shape so downstream consumers can be
--   built against it now and start producing real data once the bridges land.

BEGIN;

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.delivery_method AS ENUM ('lwe','tnvs','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_alex_assist AS ENUM ('none','partial','full');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. New columns on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_method        public.delivery_method,
  ADD COLUMN IF NOT EXISTS delivery_method_notes  text,
  ADD COLUMN IF NOT EXISTS payment_receipt_path   text,
  ADD COLUMN IF NOT EXISTS payment_other_label    text,
  ADD COLUMN IF NOT EXISTS alex_ai_assist_level   public.order_alex_assist NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS ad_creative_id         text,
  ADD COLUMN IF NOT EXISTS ad_creative_name       text,
  ADD COLUMN IF NOT EXISTS shopify_financial_status   text,
  ADD COLUMN IF NOT EXISTS shopify_fulfillment_status text,
  ADD COLUMN IF NOT EXISTS cs_hold_reason         text;

-- 3. Backfill alex_ai_assist_level from the legacy boolean if it still exists, then drop it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='alex_ai_assist'
  ) THEN
    UPDATE public.orders
       SET alex_ai_assist_level = CASE WHEN alex_ai_assist THEN 'full'::public.order_alex_assist
                                       ELSE 'none'::public.order_alex_assist END
     WHERE alex_ai_assist IS NOT NULL;
    ALTER TABLE public.orders DROP COLUMN alex_ai_assist;
  END IF;
END $$;

-- 4. Index for CS Inbox query
CREATE INDEX IF NOT EXISTS idx_orders_cs_inbox
  ON public.orders (completion_status, person_in_charge_label)
  WHERE status = 'confirmed';

-- 5. Lifecycle view
CREATE OR REPLACE VIEW public.v_order_lifecycle AS
WITH latest_event AS (
  -- TODO(bridge-migration): link courier_events to public.orders. Today,
  -- dispatch_queue.order_id references ops_orders, not public.orders, so we
  -- cannot project event_type per public.orders.id. Stubbed until a future
  -- migration adds the bridge. Once linked, replace with:
  --   SELECT DISTINCT ON (dq.order_id) dq.order_id, ce.event_type::text, ce.event_time AS event_at
  --   FROM public.dispatch_queue dq
  --   JOIN public.courier_events ce ON ce.dispatch_id = dq.id
  --   ORDER BY dq.order_id, ce.event_time DESC
  SELECT NULL::uuid       AS order_id,
         NULL::text       AS event_type,
         NULL::timestamptz AS event_at
  WHERE FALSE
),
replenish_event AS (
  -- TODO(bridge-migration): inventory_movements has no order_id column today
  -- (uses reference_type / reference_id). Replenishment-to-order link is a
  -- follow-up. Stubbed until that link exists.
  SELECT NULL::uuid AS order_id WHERE FALSE
)
SELECT
  o.id AS order_id,
  CASE
    WHEN o.status = 'cancelled'                                               THEN 'cancelled'
    WHEN o.status = 'draft'                                                   THEN 'draft'
    WHEN o.completion_status = 'incomplete'                                   THEN 'incomplete'
    WHEN re.order_id IS NOT NULL                                              THEN 'replenished'
    WHEN le.event_type = 'rts_received'                                       THEN 'rts'
    WHEN le.event_type = 'returned_to_sender'                                 THEN 'en_route_back'
    WHEN le.event_type = 'failed_attempt'                                     THEN 'declined'
    WHEN le.event_type = 'delivered'                                          THEN 'delivered'
    WHEN le.event_type IN ('in_transit','out_for_delivery')                   THEN 'en_route'
    WHEN le.event_type = 'picked_up'                                          THEN 'picked_up'
    WHEN o.person_in_charge_label IS NULL                                     THEN 'cs_inbox'
    WHEN o.person_in_charge_label ILIKE '%inventory%'                         THEN 'inventory'
    WHEN o.person_in_charge_label ILIKE '%fulfillment%'                       THEN 'fulfillment'
    ELSE 'in_progress'
  END AS lifecycle_stage,
  CASE
    WHEN o.delivery_method IN ('lwe','tnvs') THEN o.delivery_method::text
    ELSE NULL
  END AS lifecycle_method
FROM public.orders o
LEFT JOIN latest_event   le ON le.order_id = o.id
LEFT JOIN replenish_event re ON re.order_id = o.id;

GRANT SELECT ON public.v_order_lifecycle TO authenticated, service_role;

-- 6. Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('order-receipts', 'order-receipts', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- RLS: any authenticated user can read; only authenticated can insert.
DROP POLICY IF EXISTS order_receipts_read ON storage.objects;
CREATE POLICY order_receipts_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'order-receipts'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS order_receipts_insert ON storage.objects;
CREATE POLICY order_receipts_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'order-receipts'
    AND auth.role() = 'authenticated'
  );

COMMIT;
