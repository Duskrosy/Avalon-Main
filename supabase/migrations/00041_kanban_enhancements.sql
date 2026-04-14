-- ============================================================
-- 00041_kanban_enhancements.sql
-- Avalon — Kanban Board Enhancements
-- Multi-assignee, board hierarchy, colors, start date
-- ============================================================


-- ==========================
-- BOARD TYPE ENUM
-- ==========================
CREATE TYPE public.board_scope AS ENUM ('global', 'team', 'personal');


-- ==========================
-- ADD COLUMNS TO EXISTING TABLES
-- ==========================

-- Cards: start_date, color
ALTER TABLE public.kanban_cards
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS color text;

-- Columns: color
ALTER TABLE public.kanban_columns
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#6b7280';

-- Boards: scope, owner_id (for personal boards)
ALTER TABLE public.kanban_boards
  ADD COLUMN IF NOT EXISTS scope public.board_scope NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add constraint: personal boards must have owner_id
ALTER TABLE public.kanban_boards
  ADD CONSTRAINT chk_personal_board_owner
  CHECK (scope != 'personal' OR owner_id IS NOT NULL);


-- ==========================
-- CARD ASSIGNEES (JUNCTION TABLE)
-- ==========================
CREATE TABLE public.kanban_card_assignees (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id    uuid NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_card_assignee UNIQUE (card_id, user_id)
);

CREATE INDEX idx_card_assignees_card ON public.kanban_card_assignees (card_id);
CREATE INDEX idx_card_assignees_user ON public.kanban_card_assignees (user_id);

-- Migrate existing assigned_to data to junction table
INSERT INTO public.kanban_card_assignees (card_id, user_id)
SELECT id, assigned_to FROM public.kanban_cards WHERE assigned_to IS NOT NULL
ON CONFLICT DO NOTHING;


-- ==========================
-- RLS FOR CARD ASSIGNEES
-- ==========================
ALTER TABLE public.kanban_card_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_assignees FORCE ROW LEVEL SECURITY;

-- Select: same visibility as cards (own dept OR I'm an assignee OR OPS)
CREATE POLICY card_assignees_select ON public.kanban_card_assignees FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.kanban_cards c
    JOIN public.kanban_columns col ON col.id = c.column_id
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE c.id = card_id
    AND (
      public.is_ops()
      OR b.department_id = public.get_my_department_id()
      OR EXISTS (SELECT 1 FROM public.kanban_card_assignees ca WHERE ca.card_id = c.id AND ca.user_id = auth.uid())
    )
  )
);

-- Insert: if you can see the card, you can add assignees
CREATE POLICY card_assignees_insert ON public.kanban_card_assignees FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kanban_cards c
    JOIN public.kanban_columns col ON col.id = c.column_id
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE c.id = card_id
    AND (
      public.is_ops()
      OR b.department_id = public.get_my_department_id()
      OR EXISTS (SELECT 1 FROM public.kanban_card_assignees ca WHERE ca.card_id = c.id AND ca.user_id = auth.uid())
    )
  )
);

-- Delete: same as insert
CREATE POLICY card_assignees_delete ON public.kanban_card_assignees FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.kanban_cards c
    JOIN public.kanban_columns col ON col.id = c.column_id
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE c.id = card_id
    AND (
      public.is_ops()
      OR b.department_id = public.get_my_department_id()
      OR EXISTS (SELECT 1 FROM public.kanban_card_assignees ca WHERE ca.card_id = c.id AND ca.user_id = auth.uid())
    )
  )
);


-- ==========================
-- UPDATE CARD RLS FOR MULTI-ASSIGNEE
-- ==========================
DROP POLICY IF EXISTS kanban_cards_select ON public.kanban_cards;

CREATE POLICY kanban_cards_select ON public.kanban_cards FOR SELECT USING (
  public.is_ops()
  OR EXISTS (
    SELECT 1 FROM public.kanban_columns col
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE col.id = column_id
    AND b.department_id = public.get_my_department_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.kanban_card_assignees ca
    WHERE ca.card_id = id AND ca.user_id = auth.uid()
  )
);


-- ==========================
-- UPDATE BOARD RLS FOR SCOPE
-- ==========================
DROP POLICY IF EXISTS kanban_boards_select ON public.kanban_boards;
DROP POLICY IF EXISTS kanban_boards_insert ON public.kanban_boards;

-- Select: see global, team (own dept), personal (own)
CREATE POLICY kanban_boards_select ON public.kanban_boards FOR SELECT USING (
  scope = 'global'
  OR public.is_ops()
  OR (scope = 'team' AND department_id = public.get_my_department_id())
  OR (scope = 'personal' AND owner_id = auth.uid())
);

-- Insert: OPS creates global, managers create team, anyone creates personal
CREATE POLICY kanban_boards_insert ON public.kanban_boards FOR INSERT WITH CHECK (
  (scope = 'global' AND public.is_ops())
  OR (scope = 'team' AND public.is_manager_or_above() AND (public.is_ops() OR department_id = public.get_my_department_id()))
  OR (scope = 'personal' AND owner_id = auth.uid())
);


-- ==========================
-- UPDATE COLUMN RLS FOR BOARD SCOPE
-- ==========================
DROP POLICY IF EXISTS kanban_columns_insert ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_delete ON public.kanban_columns;

-- Insert: based on board scope
CREATE POLICY kanban_columns_insert ON public.kanban_columns FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (
      (b.scope = 'global' AND public.is_ops())
      OR (b.scope = 'team' AND public.is_manager_or_above() AND (public.is_ops() OR b.department_id = public.get_my_department_id()))
      OR (b.scope = 'personal' AND b.owner_id = auth.uid())
    )
  )
);

-- Delete: same as insert
CREATE POLICY kanban_columns_delete ON public.kanban_columns FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (
      (b.scope = 'global' AND public.is_ops())
      OR (b.scope = 'team' AND public.is_manager_or_above() AND (public.is_ops() OR b.department_id = public.get_my_department_id()))
      OR (b.scope = 'personal' AND b.owner_id = auth.uid())
    )
  )
);

-- Update columns (for color, name, sort_order)
DROP POLICY IF EXISTS kanban_columns_update ON public.kanban_columns;

CREATE POLICY kanban_columns_update ON public.kanban_columns FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (
      (b.scope = 'global' AND public.is_ops())
      OR (b.scope = 'team' AND public.is_manager_or_above() AND (public.is_ops() OR b.department_id = public.get_my_department_id()))
      OR (b.scope = 'personal' AND b.owner_id = auth.uid())
    )
  )
);


-- ==========================
-- DEFAULT COLUMNS FOR NEW BOARDS
-- ==========================
-- This is handled in application code when creating boards


-- ==========================
-- ENABLE REALTIME FOR NEW TABLE
-- ==========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_card_assignees;
