-- ============================================================
-- 00043_fix_rls_recursion.sql
-- Avalon — Fix infinite recursion in kanban RLS policies
-- The card_assignees policies referenced themselves via
-- kanban_cards -> kanban_card_assignees -> kanban_cards loop.
-- Fix: SECURITY DEFINER function bypasses RLS for the check.
-- ============================================================

-- Helper: check if current user is an assignee of a card (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_card_assignee(p_card_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kanban_card_assignees
    WHERE card_id = p_card_id AND user_id = auth.uid()
  );
$$;

-- Helper: check if a card belongs to a board the user can see (bypasses RLS)
CREATE OR REPLACE FUNCTION public.can_see_card_board(p_card_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kanban_cards c
    JOIN public.kanban_columns col ON col.id = c.column_id
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE c.id = p_card_id
    AND (
      public.is_ops()
      OR b.department_id = public.get_my_department_id()
      OR b.owner_id = auth.uid()
      OR b.scope = 'global'
    )
  );
$$;


-- ==========================
-- FIX CARD ASSIGNEES POLICIES (drop self-referencing ones)
-- ==========================
DROP POLICY IF EXISTS card_assignees_select ON public.kanban_card_assignees;
DROP POLICY IF EXISTS card_assignees_insert ON public.kanban_card_assignees;
DROP POLICY IF EXISTS card_assignees_delete ON public.kanban_card_assignees;

-- Select: can see the board OR is an assignee on that card
CREATE POLICY card_assignees_select ON public.kanban_card_assignees FOR SELECT USING (
  public.can_see_card_board(card_id)
  OR user_id = auth.uid()
);

-- Insert: can see the board
CREATE POLICY card_assignees_insert ON public.kanban_card_assignees FOR INSERT WITH CHECK (
  public.can_see_card_board(card_id)
);

-- Delete: can see the board
CREATE POLICY card_assignees_delete ON public.kanban_card_assignees FOR DELETE USING (
  public.can_see_card_board(card_id)
);


-- ==========================
-- FIX CARD SELECT POLICY (use SECURITY DEFINER function)
-- ==========================
DROP POLICY IF EXISTS kanban_cards_select ON public.kanban_cards;

CREATE POLICY kanban_cards_select ON public.kanban_cards FOR SELECT USING (
  public.is_ops()
  OR EXISTS (
    SELECT 1 FROM public.kanban_columns col
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE col.id = column_id
    AND (
      b.department_id = public.get_my_department_id()
      OR b.owner_id = auth.uid()
      OR b.scope = 'global'
    )
  )
  OR public.is_card_assignee(id)
);
