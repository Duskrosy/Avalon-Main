-- ─── Birthday card photo attachments bucket ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'birthday-photos',
  'birthday-photos',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = true,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated users can upload (their own folder)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'birthday_photos_upload'
  ) THEN
    CREATE POLICY birthday_photos_upload ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'birthday-photos');
  END IF;
END $$;

-- Service role can do everything
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'birthday_photos_service_all'
  ) THEN
    CREATE POLICY birthday_photos_service_all ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'birthday-photos');
  END IF;
END $$;

-- Public read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'birthday_photos_public_read'
  ) THEN
    CREATE POLICY birthday_photos_public_read ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'birthday-photos');
  END IF;
END $$;
