-- Migration 00020: Move Live Ads spend cap tracking to meta_campaigns
-- (00019 incorrectly targeted ad_deployments which is a separate manual-deployment table)

ALTER TABLE public.meta_campaigns
  ADD COLUMN IF NOT EXISTS spend_cap          numeric(12,2),
  ADD COLUMN IF NOT EXISTS spend_cap_period   text NOT NULL DEFAULT 'lifetime'
    CHECK (spend_cap_period IN ('lifetime','monthly','daily')),
  ADD COLUMN IF NOT EXISTS auto_paused_at     timestamptz,
  ADD COLUMN IF NOT EXISTS auto_paused_reason text;

CREATE INDEX IF NOT EXISTS idx_mcampaigns_spend_cap
  ON public.meta_campaigns (spend_cap)
  WHERE spend_cap IS NOT NULL;
