-- ============================================================
-- Migration 00072 — Gather Tracking + Assignee Attribution
--
-- Sprint G Phase 4 — enables the tracker "Gather post" flow.
--
-- Note: `content_item_assignees` was already created in 00054
-- with columns (id, item_id, user_id, created_at) and RLS via
-- is_ad_ops_access(). We DO NOT recreate it here — we only add
-- `assigned_by` for attribution of who made the assignment.
--
-- `creative_content_items.linked_post_id` already exists (00048);
-- we add `linked_post_gathered_at` to mark when the link was set
-- (powers the "just linked" pulse in the tracker UI).
-- ============================================================

-- ── 1. Gathered-at timestamp on creative_content_items ───────────────────────

ALTER TABLE public.creative_content_items
  ADD COLUMN IF NOT EXISTS linked_post_gathered_at timestamptz;


-- ── 2. Attribution column on existing content_item_assignees junction ────────

ALTER TABLE public.content_item_assignees
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
