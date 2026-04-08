-- Migration 00027: Profile personalization fields
-- Adds bio, job_title, fun_fact, and avatar approval flag to profiles

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio                    text,
  ADD COLUMN IF NOT EXISTS job_title              text,
  ADD COLUMN IF NOT EXISTS fun_fact               text,
  ADD COLUMN IF NOT EXISTS avatar_require_approval boolean NOT NULL DEFAULT false;

-- The avatar_url column already exists from migration 00001.
-- Ensure index exists for fast lookup (idempotent)
CREATE INDEX IF NOT EXISTS profiles_avatar_url_idx
  ON public.profiles (id)
  WHERE avatar_url IS NOT NULL;

COMMENT ON COLUMN public.profiles.bio IS 'Short professional bio shown on profile and directory';
COMMENT ON COLUMN public.profiles.job_title IS 'Display title (separate from role system)';
COMMENT ON COLUMN public.profiles.fun_fact IS 'Optional fun personal fact shown on profile';
COMMENT ON COLUMN public.profiles.avatar_require_approval IS
  'When true, employee cannot change their own profile picture — only managers/OPS can';
