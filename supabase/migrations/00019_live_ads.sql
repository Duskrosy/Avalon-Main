-- Migration 00019: Live Ads — spend cap + auto-pause tracking
-- Run this in Supabase SQL Editor before deploying the Live Ads page.

-- Spend cap per deployment (null = no cap set)
ALTER TABLE public.ad_deployments
  ADD COLUMN IF NOT EXISTS spend_cap        numeric(12,2),
  ADD COLUMN IF NOT EXISTS spend_cap_period text NOT NULL DEFAULT 'lifetime'
    CHECK (spend_cap_period IN ('lifetime','monthly','daily')),
  ADD COLUMN IF NOT EXISTS auto_paused_at   timestamptz,
  ADD COLUMN IF NOT EXISTS auto_paused_reason text;

-- Index so we can quickly find deployments with caps that are active
CREATE INDEX IF NOT EXISTS idx_adep_spend_cap
  ON public.ad_deployments (spend_cap)
  WHERE spend_cap IS NOT NULL;
