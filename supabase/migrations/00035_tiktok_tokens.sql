-- ============================================================
-- 00035_tiktok_tokens.sql
-- Adds OAuth token fields to smm_group_platforms so TikTok
-- access tokens (24h lifetime) and refresh tokens (365 days)
-- can be stored and auto-refreshed during nightly sync.
-- ============================================================

ALTER TABLE public.smm_group_platforms
  ADD COLUMN IF NOT EXISTS refresh_token    text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

COMMENT ON COLUMN public.smm_group_platforms.refresh_token    IS 'TikTok OAuth refresh token (valid 365 days)';
COMMENT ON COLUMN public.smm_group_platforms.token_expires_at IS 'Expiry of the current access_token (for auto-refresh logic)';
