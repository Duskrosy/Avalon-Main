-- ============================================================
-- 00084_meta_ad_stats_window_rpc.sql
-- Avalon — Windowed aggregation RPC for Live Campaigns page.
--
-- Previously /ad-ops/campaigns SSR'd 30 days of raw meta_ad_stats
-- rows into the browser, which (a) silently truncated at Supabase's
-- 1000-row default and (b) made the page render extremely slow.
--
-- This function collapses the date dimension server-side, returning
-- one row per (meta_account_id, campaign_id, ad_id) for a window.
-- roas is summed pre-weighted by spend so the client can compute a
-- correct spend-weighted ROAS after aggregation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.meta_ad_stats_window(
  p_start date,
  p_end   date
)
RETURNS TABLE (
  meta_account_id          uuid,
  campaign_id              text,
  ad_id                    text,
  ad_name                  text,
  adset_name               text,
  spend                    numeric,
  impressions              bigint,
  clicks                   bigint,
  reach                    bigint,
  conversions              bigint,
  conversion_value         numeric,
  messaging_conversations  bigint,
  video_plays              bigint,
  video_plays_25pct        bigint,
  roas_weighted_sum        numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    meta_account_id,
    campaign_id,
    ad_id,
    MAX(ad_name)          AS ad_name,
    MAX(adset_name)       AS adset_name,
    COALESCE(SUM(spend), 0)                         AS spend,
    COALESCE(SUM(impressions), 0)::bigint           AS impressions,
    COALESCE(SUM(clicks), 0)::bigint                AS clicks,
    COALESCE(SUM(reach), 0)::bigint                 AS reach,
    COALESCE(SUM(conversions), 0)::bigint           AS conversions,
    COALESCE(SUM(conversion_value), 0)              AS conversion_value,
    COALESCE(SUM(messaging_conversations), 0)::bigint AS messaging_conversations,
    COALESCE(SUM(video_plays), 0)::bigint           AS video_plays,
    COALESCE(SUM(video_plays_25pct), 0)::bigint     AS video_plays_25pct,
    COALESCE(SUM(roas * spend), 0)                  AS roas_weighted_sum
  FROM public.meta_ad_stats
  WHERE metric_date >= p_start
    AND metric_date <= p_end
  GROUP BY meta_account_id, campaign_id, ad_id;
$$;

GRANT EXECUTE ON FUNCTION public.meta_ad_stats_window(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meta_ad_stats_window(date, date) TO service_role;

-- Boolean per-campaign activity probe for the Historical tab.
-- Returns one row per campaign that HAS activity in the window.
CREATE OR REPLACE FUNCTION public.meta_campaigns_with_activity(
  p_start date,
  p_end   date
)
RETURNS TABLE (
  meta_account_id uuid,
  campaign_id     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT meta_account_id, campaign_id
  FROM public.meta_ad_stats
  WHERE metric_date >= p_start
    AND metric_date <= p_end
    AND (
      spend > 0 OR impressions > 0 OR clicks > 0
      OR conversions > 0 OR messaging_conversations > 0
    );
$$;

GRANT EXECUTE ON FUNCTION public.meta_campaigns_with_activity(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meta_campaigns_with_activity(date, date) TO service_role;
