-- ============================================================================
-- Migration 00054: Creatives Department Overhaul
-- ============================================================================
-- Changes:
-- 1. Add multi-assignee junction table for content items
-- 2. Broaden ad_requests RLS to allow all authenticated users
-- 3. Add linked_card_id column for kanban sync
-- ============================================================================

-- 1. Multi-assignee junction table for creative content items
CREATE TABLE public.content_item_assignees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES public.creative_content_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);

CREATE INDEX idx_cia_item ON public.content_item_assignees(item_id);
CREATE INDEX idx_cia_user ON public.content_item_assignees(user_id);

ALTER TABLE public.content_item_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_item_assignees FORCE ROW LEVEL SECURITY;

CREATE POLICY cia_select ON public.content_item_assignees FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY cia_insert ON public.content_item_assignees FOR INSERT WITH CHECK (public.is_ad_ops_access());
CREATE POLICY cia_delete ON public.content_item_assignees FOR DELETE USING (public.is_ad_ops_access());

-- 2. Broaden ad_requests RLS — all authenticated users can view and submit
DROP POLICY IF EXISTS ar_select ON public.ad_requests;
DROP POLICY IF EXISTS ar_insert ON public.ad_requests;

CREATE POLICY ar_select ON public.ad_requests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY ar_insert ON public.ad_requests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Add linked_card_id column for kanban sync
ALTER TABLE public.ad_requests ADD COLUMN IF NOT EXISTS linked_card_id uuid REFERENCES public.kanban_cards(id) ON DELETE SET NULL;
