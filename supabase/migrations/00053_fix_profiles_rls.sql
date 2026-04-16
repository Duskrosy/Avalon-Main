-- ============================================================
-- 00053_fix_profiles_rls.sql
-- Broaden profiles SELECT RLS policy to all authenticated users.
--
-- REASON: This is an internal company app where all employees
-- should see the full directory (for contact info, birthdays, etc).
-- Previous policy was too restrictive:
--   - Contributors could only see their own profile
--   - Managers could only see their department
-- New policy allows any authenticated user to view any profile.
-- UPDATE and DELETE policies remain unchanged (ops-only).
-- ============================================================

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
