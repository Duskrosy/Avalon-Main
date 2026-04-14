-- ============================================================
-- 00049_operations_system.sql
-- Avalon Rebuild — Operations System Tables
--
-- Replaces the masterlist spreadsheet ecosystem with 8
-- operational domain tables: catalog, inventory, orders,
-- dispatch, issues, distressed parcels, courier tracking,
-- and remittance reconciliation.
-- ============================================================


-- ==========================
-- ENUMS
-- ==========================
DO $$ BEGIN
  CREATE TYPE public.inventory_adjustment_type AS ENUM (
    'received', 'dispatched', 'returned', 'damaged', 'correction', 'reserved', 'released'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.dispatch_status AS ENUM (
    'pending', 'picking', 'packing', 'ready', 'handed_off', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.issue_type AS ENUM (
    'wrong_size', 'wrong_item', 'defective', 'long_delivery', 'unresponsive_customer',
    'changed_mind', 'no_budget', 'redelivery', 'courier_issue', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.issue_status AS ENUM (
    'open', 'in_progress', 'resolved', 'cancelled', 'escalated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.parcel_condition AS ENUM (
    'stuck', 'returned', 'damaged', 'lost', 'rts', 'pending_redelivery', 'resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.courier_event_type AS ENUM (
    'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_attempt',
    'returned_to_sender', 'rts_received', 'redelivery_scheduled', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.remittance_status AS ENUM (
    'draft', 'pending', 'reconciled', 'disputed', 'settled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ==========================
-- 1. CATALOG ITEMS (SKU reference)
-- ==========================
CREATE TABLE IF NOT EXISTS public.catalog_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku               text        NOT NULL UNIQUE,
  product_name      text,
  color             text,
  size              text,
  product_family    text,
  collection        text,
  supplier_ref      text,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_sku
  ON public.catalog_items (sku);

CREATE INDEX IF NOT EXISTS idx_catalog_items_product_family
  ON public.catalog_items (product_family)
  WHERE product_family IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_items_active
  ON public.catalog_items (is_active)
  WHERE is_active = true;

CREATE TRIGGER trg_catalog_items_updated_at
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_catalog_items
  AFTER INSERT OR UPDATE OR DELETE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- 2. INVENTORY RECORDS (stock truth)
-- ==========================
CREATE TABLE IF NOT EXISTS public.inventory_records (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id   uuid        NOT NULL UNIQUE
                                REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  available_qty     integer     NOT NULL DEFAULT 0,
  reserved_qty      integer     NOT NULL DEFAULT 0,
  damaged_qty       integer     NOT NULL DEFAULT 0,
  location          text,
  notes             text,
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_available_qty_non_negative CHECK (available_qty >= 0),
  CONSTRAINT chk_reserved_qty_non_negative  CHECK (reserved_qty  >= 0),
  CONSTRAINT chk_damaged_qty_non_negative   CHECK (damaged_qty   >= 0)
);

CREATE TRIGGER trg_inventory_records_updated_at
  BEFORE UPDATE ON public.inventory_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- 3. INVENTORY MOVEMENTS (append-only history)
-- ==========================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id   uuid        NOT NULL
                                REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  adjustment_type   public.inventory_adjustment_type NOT NULL,
  quantity          integer     NOT NULL,
  reference_id      uuid,
  notes             text,
  created_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_movements_catalog_item
  ON public.inventory_movements (catalog_item_id);

CREATE INDEX IF NOT EXISTS idx_inv_movements_created_at
  ON public.inventory_movements (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_movements_adjustment_type
  ON public.inventory_movements (adjustment_type);


-- ==========================
-- 4. OPS ORDERS (clean orders)
-- ==========================
CREATE TABLE IF NOT EXISTS public.ops_orders (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id    uuid          REFERENCES public.shopify_orders(id) ON DELETE SET NULL,
  order_number        text          NOT NULL UNIQUE,
  customer_name       text,
  customer_email      text,
  customer_phone      text,
  financial_status    text          NOT NULL DEFAULT 'pending',
  fulfillment_status  text          NOT NULL DEFAULT 'unfulfilled',
  total_price         numeric(12,2) NOT NULL DEFAULT 0,
  payment_method      text,
  channel             text,
  notes               text,
  assigned_to         uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_orders_order_number
  ON public.ops_orders (order_number);

CREATE INDEX IF NOT EXISTS idx_ops_orders_fulfillment_status
  ON public.ops_orders (fulfillment_status);

CREATE INDEX IF NOT EXISTS idx_ops_orders_financial_status
  ON public.ops_orders (financial_status);

CREATE INDEX IF NOT EXISTS idx_ops_orders_created_at
  ON public.ops_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_orders_shopify_order_id
  ON public.ops_orders (shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;

CREATE TRIGGER trg_ops_orders_updated_at
  BEFORE UPDATE ON public.ops_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_ops_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.ops_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- 5. OPS ORDER ITEMS (line items)
-- ==========================
CREATE TABLE IF NOT EXISTS public.ops_order_items (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid          NOT NULL
                                  REFERENCES public.ops_orders(id) ON DELETE CASCADE,
  catalog_item_id   uuid          REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  product_name      text          NOT NULL,
  sku               text,
  quantity          integer       NOT NULL DEFAULT 1,
  unit_price        numeric(10,2) NOT NULL DEFAULT 0,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_order_items_order
  ON public.ops_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_ops_order_items_catalog_item
  ON public.ops_order_items (catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;


-- ==========================
-- 6. DISPATCH QUEUE (fulfillment)
-- ==========================
CREATE TABLE IF NOT EXISTS public.dispatch_queue (
  id                uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid            NOT NULL UNIQUE
                                    REFERENCES public.ops_orders(id) ON DELETE CASCADE,
  status            public.dispatch_status NOT NULL DEFAULT 'pending',
  is_preorder       boolean         NOT NULL DEFAULT false,
  assigned_to       uuid            REFERENCES public.profiles(id) ON DELETE SET NULL,
  dispatch_date     date,
  courier_name      text,
  tracking_number   text,
  handoff_at        timestamptz,
  remarks           text,
  created_at        timestamptz     NOT NULL DEFAULT now(),
  updated_at        timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_status
  ON public.dispatch_queue (status);

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_assigned_to
  ON public.dispatch_queue (assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_dispatch_date
  ON public.dispatch_queue (dispatch_date)
  WHERE dispatch_date IS NOT NULL;

CREATE TRIGGER trg_dispatch_queue_updated_at
  BEFORE UPDATE ON public.dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_dispatch_queue
  AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- 7. ORDER ISSUES (recovery)
-- ==========================
CREATE TABLE IF NOT EXISTS public.order_issues (
  id                uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid            NOT NULL
                                    REFERENCES public.ops_orders(id) ON DELETE CASCADE,
  issue_type        public.issue_type    NOT NULL,
  status            public.issue_status  NOT NULL DEFAULT 'open',
  description       text,
  notes_after_call  text,
  agent_remarks     text,
  summary           text,
  resolution        text,
  follow_up_owner   uuid            REFERENCES public.profiles(id) ON DELETE SET NULL,
  follow_up_date    date,
  created_by        uuid            NOT NULL
                                    REFERENCES public.profiles(id),
  created_at        timestamptz     NOT NULL DEFAULT now(),
  updated_at        timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_issues_order
  ON public.order_issues (order_id);

CREATE INDEX IF NOT EXISTS idx_order_issues_status
  ON public.order_issues (status);

CREATE INDEX IF NOT EXISTS idx_order_issues_type
  ON public.order_issues (issue_type);

CREATE INDEX IF NOT EXISTS idx_order_issues_follow_up
  ON public.order_issues (follow_up_date)
  WHERE follow_up_date IS NOT NULL AND status != 'resolved';

CREATE TRIGGER trg_order_issues_updated_at
  BEFORE UPDATE ON public.order_issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_order_issues
  AFTER INSERT OR UPDATE OR DELETE ON public.order_issues
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- 8. DISTRESSED PARCELS (exceptions)
-- ==========================
CREATE TABLE IF NOT EXISTS public.distressed_parcels (
  id                uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid            REFERENCES public.ops_orders(id) ON DELETE SET NULL,
  dispatch_id       uuid            REFERENCES public.dispatch_queue(id) ON DELETE SET NULL,
  tracking_number   text,
  condition         public.parcel_condition NOT NULL DEFAULT 'stuck',
  issue_reason      text,
  courier_notes     text,
  action_needed     text,
  resolved_at       timestamptz,
  created_by        uuid            NOT NULL
                                    REFERENCES public.profiles(id),
  created_at        timestamptz     NOT NULL DEFAULT now(),
  updated_at        timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distressed_parcels_condition
  ON public.distressed_parcels (condition);

CREATE INDEX IF NOT EXISTS idx_distressed_parcels_order
  ON public.distressed_parcels (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_distressed_parcels_unresolved
  ON public.distressed_parcels (condition)
  WHERE resolved_at IS NULL;

CREATE TRIGGER trg_distressed_parcels_updated_at
  BEFORE UPDATE ON public.distressed_parcels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_distressed_parcels
  AFTER INSERT OR UPDATE OR DELETE ON public.distressed_parcels
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- 9. COURIER EVENTS (tracking)
-- ==========================
CREATE TABLE IF NOT EXISTS public.courier_events (
  id                uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id       uuid            NOT NULL
                                    REFERENCES public.dispatch_queue(id) ON DELETE CASCADE,
  event_type        public.courier_event_type NOT NULL,
  event_time        timestamptz     NOT NULL DEFAULT now(),
  location          text,
  courier_name      text,
  external_ref      text,
  notes             text,
  created_at        timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_events_dispatch
  ON public.courier_events (dispatch_id);

CREATE INDEX IF NOT EXISTS idx_courier_events_time
  ON public.courier_events (event_time DESC);

CREATE INDEX IF NOT EXISTS idx_courier_events_type
  ON public.courier_events (event_type);


-- ==========================
-- 10. REMITTANCE BATCHES (reconciliation)
-- ==========================
CREATE TABLE IF NOT EXISTS public.remittance_batches (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name        text          NOT NULL,
  courier_name      text          NOT NULL,
  status            public.remittance_status NOT NULL DEFAULT 'draft',
  total_expected    numeric(12,2) NOT NULL DEFAULT 0,
  total_received    numeric(12,2) NOT NULL DEFAULT 0,
  mismatch_amount   numeric(12,2) GENERATED ALWAYS AS (total_received - total_expected) STORED,
  settlement_date   date,
  notes             text,
  created_by        uuid          NOT NULL
                                  REFERENCES public.profiles(id),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remittance_batches_status
  ON public.remittance_batches (status);

CREATE INDEX IF NOT EXISTS idx_remittance_batches_courier
  ON public.remittance_batches (courier_name);

CREATE TRIGGER trg_remittance_batches_updated_at
  BEFORE UPDATE ON public.remittance_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- 11. REMITTANCE ITEMS (batch line items)
-- ==========================
CREATE TABLE IF NOT EXISTS public.remittance_items (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          uuid          NOT NULL
                                  REFERENCES public.remittance_batches(id) ON DELETE CASCADE,
  order_id          uuid          REFERENCES public.ops_orders(id) ON DELETE SET NULL,
  dispatch_id       uuid          REFERENCES public.dispatch_queue(id) ON DELETE SET NULL,
  expected_amount   numeric(10,2) NOT NULL DEFAULT 0,
  received_amount   numeric(10,2),
  is_matched        boolean       NOT NULL DEFAULT false,
  notes             text,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remittance_items_batch
  ON public.remittance_items (batch_id);

CREATE INDEX IF NOT EXISTS idx_remittance_items_unmatched
  ON public.remittance_items (is_matched)
  WHERE is_matched = false;


-- ==========================
-- RLS — ENABLE ON ALL TABLES
-- ==========================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_items',
    'inventory_records',
    'inventory_movements',
    'ops_orders',
    'ops_order_items',
    'dispatch_queue',
    'order_issues',
    'distressed_parcels',
    'courier_events',
    'remittance_batches',
    'remittance_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;


-- ==========================
-- RLS — POLICIES
-- ==========================
-- Helper expression: user is in an ops-related department
-- public.is_ops()
-- OR (SELECT slug FROM public.departments WHERE id = (
--   SELECT department_id FROM public.profiles WHERE id = auth.uid()
-- )) IN ('fulfillment', 'inventory', 'customer-service', 'sales')

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_items',
    'inventory_records',
    'inventory_movements',
    'ops_orders',
    'ops_order_items',
    'dispatch_queue',
    'order_issues',
    'distressed_parcels',
    'courier_events',
    'remittance_batches',
    'remittance_items'
  ]
  LOOP
    -- SELECT: ops or ops-related departments
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (
        public.is_ops()
        OR (SELECT slug FROM public.departments WHERE id = (
          SELECT department_id FROM public.profiles WHERE id = auth.uid()
        )) IN (''fulfillment'', ''inventory'', ''customer-service'', ''sales'')
      )',
      t || '_select', t
    );

    -- INSERT: same access
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (
        public.is_ops()
        OR (SELECT slug FROM public.departments WHERE id = (
          SELECT department_id FROM public.profiles WHERE id = auth.uid()
        )) IN (''fulfillment'', ''inventory'', ''customer-service'', ''sales'')
      )',
      t || '_insert', t
    );

    -- UPDATE: same access
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (
        public.is_ops()
        OR (SELECT slug FROM public.departments WHERE id = (
          SELECT department_id FROM public.profiles WHERE id = auth.uid()
        )) IN (''fulfillment'', ''inventory'', ''customer-service'', ''sales'')
      )',
      t || '_update', t
    );

    -- DELETE: ops only
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (
        public.is_ops()
      )',
      t || '_delete', t
    );
  END LOOP;
END $$;
