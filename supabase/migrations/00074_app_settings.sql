-- 00074_app_settings.sql
-- Generic key-value store for global (non-per-user) app settings.
-- First use: storing which user's personal kanban is featured
-- on the executive/planning page.
--
-- RLS:
--   SELECT  — any authenticated user
--   INSERT/UPDATE/DELETE — ops only (tier <= 1)

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY app_settings_insert ON public.app_settings
  FOR INSERT WITH CHECK (public.is_ops());

CREATE POLICY app_settings_update ON public.app_settings
  FOR UPDATE USING (public.is_ops()) WITH CHECK (public.is_ops());

CREATE POLICY app_settings_delete ON public.app_settings
  FOR DELETE USING (public.is_ops());
