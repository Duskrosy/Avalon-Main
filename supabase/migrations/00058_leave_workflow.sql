-- ============================================================
-- 00058_leave_workflow.sql
-- Leave workflow: leave_requests (multi-stage) + leave_attachments
-- (supporting docs). The existing 'leaves' table is not modified.
-- ============================================================

-- ── 1. Enums ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.leave_request_type AS ENUM (
    'vacation', 'sick', 'emergency', 'personal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_request_status AS ENUM (
    'pending',
    'approved',
    'awaiting_form',
    'finalized',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 2. leave_requests ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id                    uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id          uuid                        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type            public.leave_request_type   NOT NULL,
  start_date            date                        NOT NULL,
  end_date              date                        NOT NULL,
  reason                text,
  status                public.leave_request_status NOT NULL DEFAULT 'pending',

  -- Approval
  approved_by           uuid                        REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at           timestamptz,
  rejection_reason      text,

  -- Form filing
  form_filed            boolean                     NOT NULL DEFAULT false,
  form_filed_by         uuid                        REFERENCES public.profiles(id) ON DELETE SET NULL,
  form_filed_at         timestamptz,
  form_signed_digitally boolean                     NOT NULL DEFAULT false,

  -- Finalization
  finalized_by          uuid                        REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_at          timestamptz,

  created_at            timestamptz                 NOT NULL DEFAULT now(),
  updated_at            timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_requester   ON public.leave_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status      ON public.leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates       ON public.leave_requests (start_date, end_date);

CREATE OR REPLACE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lr_select_own ON public.leave_requests;
CREATE POLICY lr_select_own ON public.leave_requests
  FOR SELECT USING (requester_id = auth.uid());

DROP POLICY IF EXISTS lr_select_ops ON public.leave_requests;
CREATE POLICY lr_select_ops ON public.leave_requests
  FOR SELECT USING (public.is_ops() OR public.is_manager_or_above());

DROP POLICY IF EXISTS lr_insert ON public.leave_requests;
CREATE POLICY lr_insert ON public.leave_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS lr_update_ops ON public.leave_requests;
CREATE POLICY lr_update_ops ON public.leave_requests
  FOR UPDATE USING (public.is_ops());

DROP POLICY IF EXISTS lr_update_own ON public.leave_requests;
CREATE POLICY lr_update_own ON public.leave_requests
  FOR UPDATE USING (requester_id = auth.uid());


-- ── 3. leave_attachments ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_attachments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id  uuid        NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  file_url          text        NOT NULL,
  file_name         text        NOT NULL,
  uploaded_by       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_attachments_request ON public.leave_attachments (leave_request_id);

ALTER TABLE public.leave_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS la_select ON public.leave_attachments;
CREATE POLICY la_select ON public.leave_attachments
  FOR SELECT USING (
    uploaded_by = auth.uid()
    OR public.is_ops()
    OR public.is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.id = leave_request_id AND lr.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS la_insert ON public.leave_attachments;
CREATE POLICY la_insert ON public.leave_attachments
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.is_ops()
      OR EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.id = leave_request_id AND lr.requester_id = auth.uid()
      )
    )
  );
