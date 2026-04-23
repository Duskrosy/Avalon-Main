-- Migration 00080: Ad-request attachments (images + docs, up to 5 per request)
-- ===========================================================================

-- 1. Private bucket for ad-request attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ad-request-attachments',
  'ad-request-attachments',
  false,
  10485760,  -- 10 MB per file
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage policies — service role writes, authenticated reads
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ad_request_attachments_service_all'
  ) THEN
    CREATE POLICY ad_request_attachments_service_all ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'ad-request-attachments');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ad_request_attachments_authenticated_read'
  ) THEN
    CREATE POLICY ad_request_attachments_authenticated_read ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'ad-request-attachments');
  END IF;
END $$;

-- 3. Attachments table
CREATE TABLE IF NOT EXISTS public.ad_request_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_request_id  uuid NOT NULL REFERENCES public.ad_requests(id) ON DELETE CASCADE,
  path           text NOT NULL,
  file_name      text,
  mime_type      text,
  size_bytes     integer,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_request_attachments_request_idx
  ON public.ad_request_attachments(ad_request_id);

ALTER TABLE public.ad_request_attachments ENABLE ROW LEVEL SECURITY;

-- Read: requester, any assignee, or OPS/Admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ad_request_attachments'
      AND policyname = 'ad_request_attachments_select'
  ) THEN
    CREATE POLICY ad_request_attachments_select ON public.ad_request_attachments
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.ad_requests r
          WHERE r.id = ad_request_attachments.ad_request_id
            AND (
              r.requester_id = auth.uid()
              OR r.assignee_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.ad_request_assignees a
                WHERE a.ad_request_id = r.id AND a.assignee_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                JOIN public.roles ro ON ro.id = p.role_id
                WHERE p.id = auth.uid() AND ro.name IN ('OPS', 'Admin')
              )
            )
        )
      );
  END IF;
END $$;

-- Writes: service role only (API enforces permission)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ad_request_attachments'
      AND policyname = 'ad_request_attachments_service_all'
  ) THEN
    CREATE POLICY ad_request_attachments_service_all ON public.ad_request_attachments
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 4. Enforce 5-attachment cap per request via trigger
CREATE OR REPLACE FUNCTION public.enforce_ad_request_attachment_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.ad_request_attachments
    WHERE ad_request_id = NEW.ad_request_id
  ) >= 5 THEN
    RAISE EXCEPTION 'ad requests are limited to 5 attachments';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ad_request_attachments_cap ON public.ad_request_attachments;
CREATE TRIGGER ad_request_attachments_cap
  BEFORE INSERT ON public.ad_request_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ad_request_attachment_cap();
