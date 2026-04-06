-- ============================================================
-- 00013_meta_live_data.sql
-- Meta-first campaign + ad stats storage.
-- These tables are populated automatically by the sync job —
-- no manual linking to ad_deployments required.
-- ============================================================


-- ── meta_campaigns ────────────────────────────────────────────────────────────
-- One row per Meta campaign, upserted on every sync.
CREATE TABLE IF NOT EXISTS public.meta_campaigns (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  meta_account_id  uuid NOT NULL REFERENCES public.ad_meta_accounts(id) ON DELETE CASCADE,
  campaign_id      text NOT NULL,
  campaign_name    text NOT NULL,
  status           text,
  effective_status text,
  objective        text,
  daily_budget     numeric(12,2),
  lifetime_budget  numeric(12,2),
  last_synced_at   timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (meta_account_id, campaign_id)
);

CREATE INDEX idx_mc_account    ON public.meta_campaigns (meta_account_id);
CREATE INDEX idx_mc_status     ON public.meta_campaigns (effective_status);
CREATE INDEX idx_mc_synced     ON public.meta_campaigns (last_synced_at DESC);

CREATE TRIGGER trg_mc_updated_at
  BEFORE UPDATE ON public.meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── meta_ad_stats ─────────────────────────────────────────────────────────────
-- One row per ad per day. Upserted on every sync.
-- Generated columns compute KPIs so charts are fast.
CREATE TABLE IF NOT EXISTS public.meta_ad_stats (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  meta_account_id   uuid NOT NULL REFERENCES public.ad_meta_accounts(id) ON DELETE CASCADE,
  campaign_id       text NOT NULL,
  campaign_name     text,
  adset_id          text,
  adset_name        text,
  ad_id             text NOT NULL,
  ad_name           text,
  metric_date       date NOT NULL,
  impressions       integer NOT NULL DEFAULT 0,
  clicks            integer NOT NULL DEFAULT 0,
  spend             numeric(12,2) NOT NULL DEFAULT 0,
  reach             integer NOT NULL DEFAULT 0,
  video_plays       integer NOT NULL DEFAULT 0,
  video_plays_25pct integer NOT NULL DEFAULT 0,
  conversions       integer NOT NULL DEFAULT 0,
  conversion_value  numeric(12,2) NOT NULL DEFAULT 0,

  -- Derived KPIs stored for performance
  hook_rate       numeric(8,4) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0
      THEN ROUND((video_plays_25pct::numeric / impressions), 4) ELSE 0 END
  ) STORED,
  ctr             numeric(8,4) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0
      THEN ROUND((clicks::numeric / impressions), 4) ELSE 0 END
  ) STORED,
  roas            numeric(10,4) GENERATED ALWAYS AS (
    CASE WHEN spend > 0
      THEN ROUND((conversion_value / spend), 4) ELSE 0 END
  ) STORED,

  last_synced_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (meta_account_id, ad_id, metric_date)
);

CREATE INDEX idx_mas_account      ON public.meta_ad_stats (meta_account_id);
CREATE INDEX idx_mas_campaign     ON public.meta_ad_stats (campaign_id);
CREATE INDEX idx_mas_date         ON public.meta_ad_stats (metric_date DESC);
CREATE INDEX idx_mas_ad_date      ON public.meta_ad_stats (ad_id, metric_date DESC);


-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.meta_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_campaigns  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_stats   FORCE ROW LEVEL SECURITY;

CREATE POLICY mc_select  ON public.meta_campaigns FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY mc_insert  ON public.meta_campaigns FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY mc_update  ON public.meta_campaigns FOR UPDATE USING (public.is_ops());
CREATE POLICY mc_delete  ON public.meta_campaigns FOR DELETE USING (public.is_ops());

CREATE POLICY mas_select ON public.meta_ad_stats  FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY mas_insert ON public.meta_ad_stats  FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY mas_update ON public.meta_ad_stats  FOR UPDATE USING (public.is_ops());
CREATE POLICY mas_delete ON public.meta_ad_stats  FOR DELETE USING (public.is_ops());
