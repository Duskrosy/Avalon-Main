-- Migration: 00025_nav_overrides
-- Per-user nav page visibility overrides.
-- Allows OPS to grant or deny specific sidebar pages to individual users,
-- bypassing (or restricting) the default tier/department gates in nav.ts.

CREATE TABLE public.nav_page_overrides (
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nav_slug   text        NOT NULL,  -- matches NavItem.slug in src/lib/permissions/nav.ts
  visible    boolean     NOT NULL,  -- true = force show | false = force hide
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, nav_slug)
);

CREATE INDEX nav_page_overrides_user_idx ON public.nav_page_overrides (user_id);

-- RLS
ALTER TABLE public.nav_page_overrides ENABLE ROW LEVEL SECURITY;

-- Users can read their own overrides (the layout queries this on every load)
CREATE POLICY "users read own nav overrides"
  ON public.nav_page_overrides
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_ops());

-- Only OPS can insert/update/delete
CREATE POLICY "ops manage nav overrides"
  ON public.nav_page_overrides
  FOR ALL
  USING (public.is_ops())
  WITH CHECK (public.is_ops());
