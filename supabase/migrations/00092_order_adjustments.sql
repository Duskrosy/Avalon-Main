-- ============================================================
-- 00092_order_adjustments.sql
-- Avalon Sales Tracker — Adjustments backbone (Phase 2.5)
--
-- Pulled forward from Phase 3 to power:
--   • Bundle-split audit trail (rev 2 elevated to Phase 1)
--   • Customer Service Order Adjustments Queue
--   • Sales → CS / Inventory / Fulfillment ticketing
--
-- Routing model: Inventory + Fulfillment queues are filtered ORDER LIST views
-- driven by orders.person_in_charge_label. Adjustments are the CS workflow
-- only — they audit what was done (bundle splits) or capture explicit
-- requests Sales routes to CS.
--
-- Depends on:
--   • orders, order_items (00086)
--   • profiles, audit_log_trigger, set_updated_at (00001-00002)
-- ============================================================


-- ==========================
-- 1. ENUMS
-- ==========================

DO $$ BEGIN
  CREATE TYPE public.order_adjustment_type AS ENUM (
    'bundle_split_pricing',     -- B1T1 ₱7,000 → ₱3,500 / ₱3,500 for COD waybill clarity
    'item_replacement',         -- swap variant
    'quantity_correction',      -- fix wrong qty after confirm
    'fulfillment_request',      -- Sales asks Fulfillment to do something specific
    'inventory_issue',          -- Sales asks Inventory to verify / pull / restock
    'customer_service_request', -- generic CS ticket
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_adjustment_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ==========================
-- 2. TABLE — order_adjustments
-- ==========================

CREATE TABLE IF NOT EXISTS public.order_adjustments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  adjustment_type          public.order_adjustment_type NOT NULL,
  status                   public.order_adjustment_status NOT NULL DEFAULT 'open',

  -- assignee shape mirrors orders.person_in_charge_*: either a real user FK,
  -- or a free-text department/team label ("Inventory", "Fulfillment", "CS").
  assigned_to_user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to_label        text,

  -- request_text is human prose — what the requester wants done.
  -- structured_payload is type-specific:
  --   bundle_split_pricing → {"split":[3500,3500],"total":7000,"line_count":2}
  --   item_replacement     → {"from_variant_id":"...","to_variant_id":"..."}
  --   quantity_correction  → {"line_id":"...","from_qty":2,"to_qty":1}
  --   others               → free-form
  request_text             text NOT NULL,
  structured_payload       jsonb,

  -- audit trail: who created, who resolved
  created_by_user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name          text,
  resolved_by_user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_notes         text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz,

  -- Sanity: resolved_at and resolved_by together; cancelled status keeps
  -- resolved_* null (cancelled means "abandoned", not "resolved").
  CONSTRAINT chk_adjustments_resolution_pair CHECK (
    (status <> 'resolved' AND resolved_at IS NULL) OR
    (status = 'resolved' AND resolved_at IS NOT NULL)
  )
);

-- All open / in_progress adjustments per order — drives the row-level "has open ticket" badge.
CREATE INDEX IF NOT EXISTS idx_adjustments_order_open
  ON public.order_adjustments (order_id)
  WHERE status IN ('open', 'in_progress');

-- CS queue scan: open + in_progress, newest first.
CREATE INDEX IF NOT EXISTS idx_adjustments_queue
  ON public.order_adjustments (status, created_at DESC)
  WHERE status IN ('open', 'in_progress');

-- Per-assignee queue.
CREATE INDEX IF NOT EXISTS idx_adjustments_assignee_user
  ON public.order_adjustments (assigned_to_user_id)
  WHERE status IN ('open', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_adjustments_assignee_label
  ON public.order_adjustments (assigned_to_label)
  WHERE status IN ('open', 'in_progress') AND assigned_to_label IS NOT NULL;

-- Filter by adjustment type (e.g. "show me all bundle splits this week").
CREATE INDEX IF NOT EXISTS idx_adjustments_type_created
  ON public.order_adjustments (adjustment_type, created_at DESC);


-- ==========================
-- 3. TRIGGERS — updated_at + audit
-- ==========================

DROP TRIGGER IF EXISTS trg_order_adjustments_updated_at ON public.order_adjustments;
CREATE TRIGGER trg_order_adjustments_updated_at
  BEFORE UPDATE ON public.order_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_order_adjustments ON public.order_adjustments;
CREATE TRIGGER trg_audit_order_adjustments
  AFTER INSERT OR UPDATE OR DELETE ON public.order_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- 4. NOTES
-- ==========================
-- • bundle_split_pricing rows are written automatically by the bundle-split
--   server endpoint (alongside the order_items unit-price rewrite). Status
--   starts and stays 'resolved' since the action is one-shot, not a request.
-- • All other types start 'open' and progress through 'in_progress' →
--   'resolved' (or 'cancelled') via the CS queue UI.
-- • Permissions are server-enforced in API routes; no RLS in this phase
--   (matches prevailing Avalon pattern).
