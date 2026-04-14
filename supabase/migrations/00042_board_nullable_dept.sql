-- ============================================================
-- 00042_board_nullable_dept.sql
-- Avalon — Allow boards without department (global + personal)
-- ============================================================

-- Make department_id nullable so global and personal boards
-- can exist without being tied to a department.
ALTER TABLE public.kanban_boards
  ALTER COLUMN department_id DROP NOT NULL;
