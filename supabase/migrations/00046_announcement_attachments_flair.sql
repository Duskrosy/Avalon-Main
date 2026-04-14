-- Migration 00046: Announcement attachments + flair (replaces priority in UI)
-- ===========================================================================

-- 1. Add flair columns (custom tag text + color)
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS flair_text  text,
  ADD COLUMN IF NOT EXISTS flair_color text;

-- 2. Add attachment columns
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS attachment_url  text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

-- 3. Create storage bucket for announcement attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcements',
  'announcements',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4. Storage policies — service role uploads, authenticated reads
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'announcements_service_all'
  ) THEN
    CREATE POLICY announcements_service_all ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'announcements');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'announcements_authenticated_read'
  ) THEN
    CREATE POLICY announcements_authenticated_read ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'announcements');
  END IF;
END $$;
