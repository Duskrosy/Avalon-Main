-- ============================================================
-- Migration 00072 — Content Item Assignees + Gather Tracking
--
-- Sprint G Phase 4 — enables the tracker "Gather post" flow and
-- multi-assignee support for creative_content_items.
--
-- Notes:
--   - Table in the plan was called `content_items` — actual table
--     is `creative_content_items` (migration 00048).
--   - `is_manager_or_above()` takes no args (see 00018, 00026, 00039).
--   - `creative_content_items.linked_post_id` already exists (00048);
--     we only add `linked_post_gathered_at` to mark when the link
--     was set (powers the "just linked" pulse in the tracker UI).
-- ============================================================

-- ── 1. Gathered-at timestamp on creative_content_items ───────────────────────

ALTER TABLE public.creative_content_items
  ADD COLUMN IF NOT EXISTS linked_post_gathered_at timestamptz;


-- ── 2. Multi-assignee junction ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_item_assignees (
  content_item_id uuid NOT NULL REFERENCES public.creative_content_items(id) ON DELETE CASCADE,
  assignee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_item_id, assignee_id)
);

CREATE INDEX IF NOT EXISTS content_item_assignees_assignee_idx
  ON public.content_item_assignees(assignee_id);

CREATE INDEX IF NOT EXISTS content_item_assignees_content_item_idx
  ON public.content_item_assignees(content_item_id);


-- ── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.content_item_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_item_assignees FORCE ROW LEVEL SECURITY;

-- Read: any authenticated user (matches creative_content_items SELECT policy).
CREATE POLICY cia_select ON public.content_item_assignees
  FOR SELECT TO authenticated USING (true);

-- Insert/Delete: OPS or manager-or-above.
CREATE POLICY cia_insert ON public.content_item_assignees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops() OR public.is_manager_or_above());

CREATE POLICY cia_delete ON public.content_item_assignees
  FOR DELETE TO authenticated
  USING (public.is_ops() OR public.is_manager_or_above());


-- ── 4. Realtime ──────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.content_item_assignees;
