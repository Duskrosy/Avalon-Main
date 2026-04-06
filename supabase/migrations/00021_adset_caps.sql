-- Migration 00021: Spend caps for individual adsets
-- Mirrors the campaign-level spend cap but stored per Meta adset_id

CREATE TABLE IF NOT EXISTS public.meta_adset_caps (
  adset_id          text PRIMARY KEY,
  meta_account_id   uuid REFERENCES public.ad_meta_accounts(id) ON DELETE CASCADE,
  campaign_id       text,
  adset_name        text,
  spend_cap         numeric(12,2) NOT NULL,
  spend_cap_period  text NOT NULL DEFAULT 'lifetime'
    CHECK (spend_cap_period IN ('lifetime','monthly','daily')),
  auto_paused_at    timestamptz,
  auto_paused_reason text,
  created_at        timestamptz DEFAULT now()
);

-- Allow ops + ad-ops managers to read/write
ALTER TABLE public.meta_adset_caps ENABLE ROW LEVEL SECURITY;
CREATE POLICY adset_caps_all ON public.meta_adset_caps
  USING (public.is_ad_ops_access())
  WITH CHECK (public.is_ad_ops_access());
