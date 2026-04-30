-- supabase/migrations/00097_ops_orders_sales_bridge.sql
-- Bridge public.orders ↔ public.ops_orders so the lifecycle view in 00096
-- can project courier events back to the sales-side order. Also un-stubs
-- the latest_event CTE in v_order_lifecycle.
--
-- The bridge is a UNIQUE FK on ops_orders.sales_order_id. Population is
-- handled in application code (the CS triage endpoint, when CS routes a
-- confirmed order to Dispatch, inserts the ops_orders + dispatch_queue
-- rows with sales_order_id pre-populated).

BEGIN;

-- 1. Bridge column on ops_orders.
ALTER TABLE public.ops_orders
  ADD COLUMN IF NOT EXISTS sales_order_id uuid
    UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_orders_sales_order_id
  ON public.ops_orders (sales_order_id)
  WHERE sales_order_id IS NOT NULL;

-- 2. Replace v_order_lifecycle: latest_event now joins through the bridge.
--    Path: orders.id ← ops_orders.sales_order_id → dispatch_queue.order_id
--          → courier_events.dispatch_id, ranked by event_time DESC.
--    replenish_event remains stubbed (inventory_movements has no order_id;
--    polymorphic reference_type/reference_id need a future schema change).
CREATE OR REPLACE VIEW public.v_order_lifecycle AS
WITH latest_event AS (
  SELECT DISTINCT ON (oo.sales_order_id)
    oo.sales_order_id        AS order_id,
    ce.event_type::text      AS event_type,
    ce.event_time            AS event_at
  FROM public.ops_orders oo
  JOIN public.dispatch_queue dq ON dq.order_id    = oo.id
  JOIN public.courier_events  ce ON ce.dispatch_id = dq.id
  WHERE oo.sales_order_id IS NOT NULL
  ORDER BY oo.sales_order_id, ce.event_time DESC
),
replenish_event AS (
  -- TODO: link inventory_movements receive events back to the source sales
  -- order. Today inventory_movements uses polymorphic reference_type /
  -- reference_id; a future migration must either (a) add a direct order_id
  -- column or (b) rely on reference_type='order' AND reference_id::uuid =
  -- orders.id. Until then this stub returns no rows.
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

COMMIT;
