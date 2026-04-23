-- Migration 00079: Feedback attachments (up to 3 images per ticket)
-- ===========================================================================

-- 1. Create private bucket for feedback images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-attachments',
  'feedback-attachments',
  false,
  10485760,  -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage policies — service role uploads, authenticated reads
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'feedback_attachments_service_all'
  ) THEN
    CREATE POLICY feedback_attachments_service_all ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'feedback-attachments');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'feedback_attachments_authenticated_read'
  ) THEN
    CREATE POLICY feedback_attachments_authenticated_read ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'feedback-attachments');
  END IF;
END $$;

-- 3. Attachments table — one row per uploaded image
CREATE TABLE IF NOT EXISTS public.feedback_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  path        text NOT NULL,
  mime_type   text,
  size_bytes  integer,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_attachments_feedback_id_idx
  ON public.feedback_attachments(feedback_id);

ALTER TABLE public.feedback_attachments ENABLE ROW LEVEL SECURITY;

-- Reporter can read own ticket attachments; OPS can read all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'feedback_attachments'
      AND policyname = 'feedback_attachments_select'
  ) THEN
    CREATE POLICY feedback_attachments_select ON public.feedback_attachments
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.feedback f
          WHERE f.id = feedback_attachments.feedback_id
            AND (
              f.user_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                JOIN public.roles r ON r.id = p.role_id
                WHERE p.id = auth.uid() AND r.name IN ('OPS', 'Admin')
              )
            )
        )
      );
  END IF;
END $$;

-- Writes are handled by server routes with the service role only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'feedback_attachments'
      AND policyname = 'feedback_attachments_service_all'
  ) THEN
    CREATE POLICY feedback_attachments_service_all ON public.feedback_attachments
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 4. Enforce 3-attachment cap per ticket via trigger
CREATE OR REPLACE FUNCTION public.enforce_feedback_attachment_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.feedback_attachments
    WHERE feedback_id = NEW.feedback_id
  ) >= 3 THEN
    RAISE EXCEPTION 'feedback tickets are limited to 3 attachments';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_attachments_cap ON public.feedback_attachments;
CREATE TRIGGER feedback_attachments_cap
  BEFORE INSERT ON public.feedback_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_feedback_attachment_cap();
