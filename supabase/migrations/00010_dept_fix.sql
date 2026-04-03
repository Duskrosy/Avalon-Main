-- ============================================================
-- 00010_dept_fix.sql
-- Avalon Rebuild — D1 Department Structure Fix
--
-- Final department list:
--   ops          Operations
--   sales        Sales
--   ad-ops       Ad Operations
--   hr           Human Resources
--   finance      Finance (new)
--
-- Fixes:
--   1. Add Finance department
--   2. Update is_ad_ops_access() — old function checked for 'creatives'
--      and 'marketing' slugs which do not exist; correct to 'ad-ops' only
-- ============================================================


-- 1. Add Finance department
INSERT INTO public.departments (name, slug, description)
VALUES ('Finance', 'finance', 'Finance department')
ON CONFLICT (slug) DO NOTHING;


-- 2. Fix is_ad_ops_access() — remove stale 'creatives'/'marketing' slugs
CREATE OR REPLACE FUNCTION public.is_ad_ops_access() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.is_ops() OR (
    SELECT slug FROM public.departments WHERE id = public.get_my_department_id() LIMIT 1
  ) = 'ad-ops'
$$;
