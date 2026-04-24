-- Live Ads: allow managers/ops to hide stale campaigns from the dashboard.
-- Hidden campaigns are excluded from /api/ad-ops/live-ads GET but data is
-- preserved (nothing is deleted). Unhiding is possible via DB update.

ALTER TABLE meta_campaigns
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_hidden_at
  ON meta_campaigns(hidden_at)
  WHERE hidden_at IS NOT NULL;
