-- ============================================================
-- 00009_rls_hardening.sql
-- Avalon Rebuild — Phase 9: RLS Audit Fixes
--
-- Gaps identified in audit pass:
--   1. kanban_boards   — missing UPDATE policy
--   2. kanban_columns  — missing UPDATE policy
--   3. announcements   — missing UPDATE policy
--   4. memo_signatures — SELECT USING (true) exposes signature data to all
--   5. room_bookings   — SELECT USING (true) allows unauthenticated reads
--   6. obs_app_events  — INSERT WITH CHECK (true) allows anonymous writes
--   7. obs_error_logs  — INSERT WITH CHECK (true) allows anonymous writes
--
-- Reference/config tables (departments, roles, permissions, role_permissions,
-- validation_rules, feature_flags) keep USING (true) — intentional; all
-- authenticated users legitimately read these for app function.
--
-- kop_versions has no UPDATE by design (versions are immutable records).
-- permissions / role_permissions have no UPDATE by design (replace-not-update).
-- ============================================================


-- ============================================================
-- 1. kanban_boards — add UPDATE policy
-- ============================================================
CREATE POLICY kanban_boards_update ON public.kanban_boards
  FOR UPDATE
  USING (
    public.is_ops()
    OR (
      public.is_manager_or_above()
      AND department_id = public.get_my_department_id()
    )
  );


-- ============================================================
-- 2. kanban_columns — add UPDATE policy
-- ============================================================
CREATE POLICY kanban_columns_update ON public.kanban_columns
  FOR UPDATE
  USING (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1 FROM public.kanban_boards b
      WHERE b.id = board_id
        AND (public.is_ops() OR b.department_id = public.get_my_department_id())
    )
  );


-- ============================================================
-- 3. announcements — add UPDATE policy
-- ============================================================
CREATE POLICY announcements_update ON public.announcements
  FOR UPDATE
  USING (
    public.is_ops()
    OR (
      public.is_manager_or_above()
      AND (
        department_id IS NULL
        OR department_id = public.get_my_department_id()
      )
    )
  );


-- ============================================================
-- 4. memo_signatures — tighten SELECT from USING (true)
--    Drop the open policy and replace with scoped one.
-- ============================================================
DROP POLICY IF EXISTS memo_signatures_select ON public.memo_signatures;

CREATE POLICY memo_signatures_select ON public.memo_signatures
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_manager_or_above()
  );


-- ============================================================
-- 5. room_bookings — tighten SELECT from USING (true)
--    All bookings visible to any authenticated user (needed for
--    calendar / conflict display), but not unauthenticated.
-- ============================================================
DROP POLICY IF EXISTS room_bookings_select ON public.room_bookings;

CREATE POLICY room_bookings_select ON public.room_bookings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ============================================================
-- 6. obs_app_events — require authentication for INSERT
--    trackEvent() only fires from authenticated sessions.
-- ============================================================
DROP POLICY IF EXISTS oae_insert ON public.obs_app_events;

CREATE POLICY oae_insert ON public.obs_app_events
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================================
-- 7. obs_error_logs — require authentication for INSERT
--    logError() only fires from authenticated API routes.
-- ============================================================
DROP POLICY IF EXISTS oel_insert ON public.obs_error_logs;

CREATE POLICY oel_insert ON public.obs_error_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
