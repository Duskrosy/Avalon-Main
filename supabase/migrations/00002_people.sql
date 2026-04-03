-- ============================================================
-- 00002_people.sql
-- Avalon Rebuild — Phase 2: People Management
-- Updates department seed, adds leaves + notifications tables
-- ============================================================


-- ==========================
-- UPDATE DEPARTMENTS SEED
-- Replace the 4 placeholder departments from 00001 with the
-- real 10-department structure.
-- ==========================
DELETE FROM public.departments;

INSERT INTO public.departments (name, slug, description) VALUES
  ('Operations',        'ops',              'Operations and administration'),
  ('Sales',             'sales',            'Sales department'),
  ('Creatives',         'creatives',        'Creative team'),
  ('Ad Operations',     'ad-ops',           'Advertising operations'),
  ('HR',                'hr',               'Human resources'),
  ('Marketing',         'marketing',        'Marketing department'),
  ('Fulfillment',       'fulfillment',      'Order fulfillment'),
  ('Inventory',         'inventory',        'Inventory management'),
  ('Marketplaces',      'marketplaces',     'Marketplace operations'),
  ('Customer Service',  'customer-service', 'Customer support');


-- ==========================
-- ENUM TYPES
-- ==========================
CREATE TYPE public.leave_type   AS ENUM ('vacation', 'sick', 'personal', 'other');
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');


-- ==========================
-- LEAVES TABLE
-- ==========================
CREATE TABLE public.leaves (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type    public.leave_type NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  reason        text,
  status        public.leave_status NOT NULL DEFAULT 'pending',
  reviewed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT leaves_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX idx_leaves_user_id    ON public.leaves (user_id);
CREATE INDEX idx_leaves_status     ON public.leaves (status);
CREATE INDEX idx_leaves_start_date ON public.leaves (start_date);
CREATE INDEX idx_leaves_dept       ON public.leaves (user_id, start_date);

CREATE TRIGGER trg_leaves_updated_at
  BEFORE UPDATE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_leaves
  AFTER INSERT OR UPDATE OR DELETE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- NOTIFICATIONS TABLE
-- ==========================
CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  link_url   text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id    ON public.notifications (user_id);
CREATE INDEX idx_notifications_is_read    ON public.notifications (user_id, is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications (created_at DESC);


-- ==========================
-- ENABLE RLS
-- ==========================
ALTER TABLE public.leaves        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves        FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;


-- ==========================
-- RLS POLICIES — LEAVES
-- Select: own row, same-dept managers, or OPS
-- Insert: any authenticated user (API enforces own-row only)
-- Update: managers of same dept or OPS
-- Delete: OPS only
-- ==========================
CREATE POLICY leaves_select ON public.leaves FOR SELECT USING (
  user_id = auth.uid()
  OR public.is_ops()
  OR (
    public.is_manager_or_above()
    AND user_id IN (
      SELECT id FROM public.profiles
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  )
);

CREATE POLICY leaves_insert ON public.leaves FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY leaves_update ON public.leaves FOR UPDATE USING (
  public.is_ops()
  OR (
    public.is_manager_or_above()
    AND user_id IN (
      SELECT id FROM public.profiles
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  )
  OR (user_id = auth.uid() AND status = 'pending')
);

CREATE POLICY leaves_delete ON public.leaves FOR DELETE USING (public.is_ops());


-- ==========================
-- RLS POLICIES — NOTIFICATIONS
-- Service role (admin client) bypasses RLS entirely — used for inserts.
-- Regular users can only see/update their own rows.
-- ==========================
CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (
  user_id = auth.uid()
);

CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (
  false -- inserts only via service role (admin client)
);

CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (
  user_id = auth.uid()
);

CREATE POLICY notifications_delete ON public.notifications FOR DELETE USING (
  user_id = auth.uid()
);
