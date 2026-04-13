-- Knowledgebase upgrades: memo attachments, KOP assignments, learning progress support

-- ─── Memo Attachments ─────────────────────────────────────────────────────────
-- Allow memos to have an optional file attachment (PDF, DOCX, etc.)
ALTER TABLE public.memos
  ADD COLUMN attachment_url  text,
  ADD COLUMN attachment_name text;

-- ─── KOP User Assignments ─────────────────────────────────────────────────────
-- Managers/OPS can assign specific KOPs to individual users
CREATE TABLE public.kop_assignments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kop_id      uuid NOT NULL REFERENCES public.kops(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  notes       text,
  UNIQUE (kop_id, user_id)
);

CREATE INDEX idx_kop_assignments_user ON public.kop_assignments(user_id);
CREATE INDEX idx_kop_assignments_kop ON public.kop_assignments(kop_id);

ALTER TABLE public.kop_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kop_assignments FORCE ROW LEVEL SECURITY;

-- Users can see their own assignments
CREATE POLICY kop_assignments_select_own ON public.kop_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- OPS and managers can see all assignments
CREATE POLICY kop_assignments_select_ops ON public.kop_assignments
  FOR SELECT TO authenticated
  USING (public.is_manager_or_above());

-- OPS and managers can create/delete assignments
CREATE POLICY kop_assignments_insert ON public.kop_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY kop_assignments_delete ON public.kop_assignments
  FOR DELETE TO authenticated
  USING (public.is_manager_or_above());

GRANT SELECT, INSERT, DELETE ON public.kop_assignments TO authenticated;
