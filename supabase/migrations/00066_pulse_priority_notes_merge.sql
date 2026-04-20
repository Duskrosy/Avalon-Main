-- Pulse transparency: priority, internal notes, merge duplicates, comment thread, public view.
-- Tickets #2, #8.

-- ─── Feedback columns ─────────────────────────────────────────────────────────
ALTER TABLE public.feedback
  ADD COLUMN priority       text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN notes          text,
  ADD COLUMN merged_into_id uuid REFERENCES public.feedback(id) ON DELETE SET NULL,
  ADD COLUMN updated_at     timestamptz NOT NULL DEFAULT now();

CREATE INDEX feedback_priority_idx       ON public.feedback(priority);
CREATE INDEX feedback_merged_into_id_idx ON public.feedback(merged_into_id);

-- Allow OPS to UPDATE the new triage columns (previous migration only granted UPDATE (status)).
GRANT UPDATE (status, priority, notes, merged_into_id, updated_at) ON public.feedback TO authenticated;

-- ─── Comment thread (OPS replies visible to reporter) ────────────────────────
CREATE TABLE public.feedback_comments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_comments_feedback_id_idx ON public.feedback_comments(feedback_id);

ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_comments FORCE ROW LEVEL SECURITY;

-- Read: the reporter OR OPS
CREATE POLICY feedback_comments_select ON public.feedback_comments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = feedback_comments.feedback_id
        AND (f.user_id = auth.uid() OR public.is_ops())
    )
  );

-- Write: OPS only
CREATE POLICY feedback_comments_insert ON public.feedback_comments
  FOR INSERT TO authenticated WITH CHECK (public.is_ops());

GRANT SELECT, INSERT ON public.feedback_comments TO authenticated;

-- ─── Public (transparency) view for all authenticated users ─────────────────
-- RLS can't column-gate, so expose a view that redacts reporter identity unless
-- the caller is OPS or the reporter themselves. Merged tickets are hidden.
CREATE OR REPLACE VIEW public.feedback_public
WITH (security_invoker = true) AS
SELECT
  f.id,
  f.category,
  f.status,
  f.priority,
  f.created_at,
  f.updated_at,
  f.department_id,
  f.body,
  f.merged_into_id,
  CASE WHEN public.is_ops() OR f.user_id = auth.uid()
       THEN f.user_id
       ELSE NULL END AS user_id,
  (SELECT count(*) FROM public.feedback_comments c WHERE c.feedback_id = f.id) AS comment_count
FROM public.feedback f
WHERE f.merged_into_id IS NULL;

GRANT SELECT ON public.feedback_public TO authenticated;
