-- ============================================================
-- 00056_feature_goals.sql
-- 1. feature_goals table
-- 2. feature_goal_tickets junction table
-- 3. RLS policies
-- ============================================================

-- 1. Feature goals
CREATE TABLE public.feature_goals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text,
  status      text        NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned', 'in_progress', 'done')),
  progress    integer     NOT NULL DEFAULT 0
              CHECK (progress >= 0 AND progress <= 100),
  milestone   text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_goals_status    ON public.feature_goals(status);
CREATE INDEX idx_feature_goals_milestone ON public.feature_goals(milestone);
CREATE INDEX idx_feature_goals_sort      ON public.feature_goals(sort_order);

ALTER TABLE public.feature_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_goals FORCE ROW LEVEL SECURITY;

-- All authenticated users may read
CREATE POLICY fg_select ON public.feature_goals
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- OPS only for writes
CREATE POLICY fg_insert ON public.feature_goals
  FOR INSERT WITH CHECK (public.is_ops());

CREATE POLICY fg_update ON public.feature_goals
  FOR UPDATE USING (public.is_ops());

CREATE POLICY fg_delete ON public.feature_goals
  FOR DELETE USING (public.is_ops());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_feature_goals_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feature_goals_updated_at
  BEFORE UPDATE ON public.feature_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_feature_goals_updated_at();

-- 2. Junction: feature_goal_tickets
CREATE TABLE public.feature_goal_tickets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_goal_id uuid        NOT NULL REFERENCES public.feature_goals(id) ON DELETE CASCADE,
  feedback_id     uuid        NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_goal_id, feedback_id)
);

CREATE INDEX idx_fgt_goal     ON public.feature_goal_tickets(feature_goal_id);
CREATE INDEX idx_fgt_feedback ON public.feature_goal_tickets(feedback_id);

ALTER TABLE public.feature_goal_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_goal_tickets FORCE ROW LEVEL SECURITY;

CREATE POLICY fgt_select ON public.feature_goal_tickets
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY fgt_insert ON public.feature_goal_tickets
  FOR INSERT WITH CHECK (public.is_ops());

CREATE POLICY fgt_delete ON public.feature_goal_tickets
  FOR DELETE USING (public.is_ops());
