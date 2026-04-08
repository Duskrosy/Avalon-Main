-- ============================================================
-- 00026_leaves_v2.sql
-- Leaves v2: emergency leave type, two-tier approval workflow,
-- per-user leave credits, and supporting documents.
-- ============================================================

-- ── 1. Extend leave_type enum ────────────────────────────────
-- Add 'emergency' leave type (existing: vacation, sick, personal, other)
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'emergency';


-- ── 2. Extend leave_status enum ─────────────────────────────
-- Add 'pre_approved' stage between pending and final approval
-- Manager pre-approves → OPS admin final-approves
ALTER TYPE public.leave_status ADD VALUE IF NOT EXISTS 'pre_approved' BEFORE 'approved';


-- ── 3. Add pre-approval columns to leaves ───────────────────
ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS pre_approved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pre_approved_at  timestamptz;


-- ── 4. Leave Credits table ───────────────────────────────────
-- Stores per-user total credits for each leave type.
-- Defaults to 5. "Used" is always computed from the leaves table.
-- Only OPS Admin (tier <= 1) can update these totals.
CREATE TABLE IF NOT EXISTS public.leave_credits (
  user_id           uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  sick_total        int         NOT NULL DEFAULT 5 CHECK (sick_total >= 0),
  vacation_total    int         NOT NULL DEFAULT 5 CHECK (vacation_total >= 0),
  emergency_total   int         NOT NULL DEFAULT 5 CHECK (emergency_total >= 0),
  updated_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_credits ENABLE ROW LEVEL SECURITY;

-- Users read their own; OPS reads all
CREATE POLICY leave_credits_select ON public.leave_credits
  FOR SELECT USING (user_id = auth.uid() OR public.is_ops());

-- Only OPS can write (API enforces this too)
CREATE POLICY leave_credits_insert ON public.leave_credits
  FOR INSERT WITH CHECK (public.is_ops());

CREATE POLICY leave_credits_update ON public.leave_credits
  FOR UPDATE USING (public.is_ops());


-- ── 5. Leave Documents table ─────────────────────────────────
-- One record per leave. Tracks both the manager's doc request
-- and the employee's subsequent file upload.
CREATE TABLE IF NOT EXISTS public.leave_documents (
  leave_id        uuid        PRIMARY KEY REFERENCES public.leaves(id) ON DELETE CASCADE,
  -- Request phase (manager)
  requested_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at    timestamptz,
  request_note    text,
  -- Upload phase (employee)
  file_url        text,
  file_name       text,
  file_size       bigint,
  uploaded_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at     timestamptz,
  -- Timestamps
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_documents_leave ON public.leave_documents (leave_id);

CREATE TRIGGER trg_leave_documents_updated_at
  BEFORE UPDATE ON public.leave_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.leave_documents ENABLE ROW LEVEL SECURITY;

-- Employee sees their own leave's doc record; managers/OPS see their scope
CREATE POLICY leave_documents_select ON public.leave_documents
  FOR SELECT USING (
    public.is_ops()
    OR (
      public.is_manager_or_above()
      AND leave_id IN (
        SELECT id FROM public.leaves
        WHERE user_id IN (
          SELECT id FROM public.profiles
          WHERE department_id = public.get_my_department_id() AND deleted_at IS NULL
        )
      )
    )
    OR leave_id IN (
      SELECT id FROM public.leaves WHERE user_id = auth.uid()
    )
  );

-- Managers and OPS can insert (request phase)
CREATE POLICY leave_documents_insert ON public.leave_documents
  FOR INSERT WITH CHECK (public.is_manager_or_above() OR public.is_ops());

-- Employee can update (upload phase); managers/OPS can update (request phase)
CREATE POLICY leave_documents_update ON public.leave_documents
  FOR UPDATE USING (
    public.is_ops()
    OR public.is_manager_or_above()
    OR leave_id IN (SELECT id FROM public.leaves WHERE user_id = auth.uid())
  );

CREATE POLICY leave_documents_delete ON public.leave_documents
  FOR DELETE USING (public.is_ops());


-- ── 6. Seed default credits for existing active users ────────
-- Creates a leave_credits row (all defaults = 5) for every
-- currently active profile that doesn't already have one.
INSERT INTO public.leave_credits (user_id)
  SELECT id FROM public.profiles
  WHERE status = 'active' AND deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;


-- ── NOTE: Supabase Storage Bucket ────────────────────────────
-- Create a private bucket named 'leave-documents' in your
-- Supabase dashboard → Storage → New bucket.
-- Set it to PRIVATE. The API uses the service role to upload
-- and generates signed URLs for viewing.
