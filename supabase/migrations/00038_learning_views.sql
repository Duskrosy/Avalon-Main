-- Track learning material views for completion verification
-- Users must view a material before they can mark it complete

CREATE TABLE public.learning_views (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.learning_materials(id) ON DELETE CASCADE,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  duration_s  integer DEFAULT 0,
  UNIQUE (user_id, material_id)
);

CREATE INDEX idx_learning_views_user ON public.learning_views(user_id);
CREATE INDEX idx_learning_views_material ON public.learning_views(material_id);

-- RLS
ALTER TABLE public.learning_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_views FORCE ROW LEVEL SECURITY;

-- Users can see and create their own views
CREATE POLICY learning_views_select ON public.learning_views
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY learning_views_insert ON public.learning_views
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- OPS can see all views (for reporting)
CREATE POLICY learning_views_select_ops ON public.learning_views
  FOR SELECT TO authenticated
  USING (public.is_ops());

-- Users can update their own view duration
CREATE POLICY learning_views_update ON public.learning_views
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.learning_views TO authenticated;
