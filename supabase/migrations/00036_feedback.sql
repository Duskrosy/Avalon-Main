-- Feedback table: in-app user feedback for ops triage
-- Part of the Usage Intelligence Sprint

CREATE TABLE public.feedback (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id),
  category      text NOT NULL CHECK (category IN ('bug', 'missing_feature', 'confusing', 'slow', 'other')),
  body          text NOT NULL CHECK (char_length(body) > 0),
  page_url      text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'wontfix')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX idx_feedback_department_id ON public.feedback(department_id);
CREATE INDEX idx_feedback_status ON public.feedback(status);
CREATE INDEX idx_feedback_created_at ON public.feedback(created_at DESC);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback FORCE ROW LEVEL SECURITY;

-- Anyone authenticated can create feedback
CREATE POLICY feedback_insert ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can read their own feedback
CREATE POLICY feedback_select_own ON public.feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- OPS can read all feedback
CREATE POLICY feedback_select_ops ON public.feedback
  FOR SELECT TO authenticated
  USING (public.is_ops());

-- OPS can update feedback status
CREATE POLICY feedback_update_ops ON public.feedback
  FOR UPDATE TO authenticated
  USING (public.is_ops())
  WITH CHECK (public.is_ops());

-- Grant permissions
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT UPDATE (status) ON public.feedback TO authenticated;
