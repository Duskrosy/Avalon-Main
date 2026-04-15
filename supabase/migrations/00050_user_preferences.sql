-- 00050_user_preferences.sql
-- Add user_preferences JSONB column to profiles for theme/accent/density storage

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{}';

COMMENT ON COLUMN profiles.user_preferences IS 'User UI preferences: {theme, accent, density}';
