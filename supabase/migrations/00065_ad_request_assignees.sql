-- 00065_ad_request_assignees.sql
-- Multi-assignee support for ad_requests via junction table.
-- Existing ad_requests.assignee_id is kept as a "lead assignee" hint for now;
-- a follow-up migration can drop it after the UI fully migrates.

CREATE TABLE IF NOT EXISTS public.ad_request_assignees (
  ad_request_id uuid NOT NULL REFERENCES public.ad_requests(id) ON DELETE CASCADE,
  assignee_id   uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_request_id, assignee_id)
);

CREATE INDEX IF NOT EXISTS idx_ara_request  ON public.ad_request_assignees (ad_request_id);
CREATE INDEX IF NOT EXISTS idx_ara_assignee ON public.ad_request_assignees (assignee_id);

-- Backfill from existing single assignee_id
INSERT INTO public.ad_request_assignees (ad_request_id, assignee_id)
SELECT id, assignee_id
FROM public.ad_requests
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.ad_request_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_request_assignees FORCE ROW LEVEL SECURITY;

-- Mirror ad_requests' own RLS: is_ad_ops_access() for read/write,
-- is_manager_or_above() for delete.
DROP POLICY IF EXISTS ara_select ON public.ad_request_assignees;
CREATE POLICY ara_select ON public.ad_request_assignees
  FOR SELECT USING (public.is_ad_ops_access());

DROP POLICY IF EXISTS ara_insert ON public.ad_request_assignees;
CREATE POLICY ara_insert ON public.ad_request_assignees
  FOR INSERT WITH CHECK (public.is_ad_ops_access());

DROP POLICY IF EXISTS ara_update ON public.ad_request_assignees;
CREATE POLICY ara_update ON public.ad_request_assignees
  FOR UPDATE USING (public.is_ad_ops_access());

DROP POLICY IF EXISTS ara_delete ON public.ad_request_assignees;
CREATE POLICY ara_delete ON public.ad_request_assignees
  FOR DELETE USING (public.is_ad_ops_access());
