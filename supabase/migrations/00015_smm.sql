-- =============================================================
-- Migration 00015 — Social Media Management (SMM)
-- Tables: smm_groups, smm_group_platforms, smm_posts,
--         smm_analytics, smm_top_posts
-- RLS: is_ad_ops_access() covers creatives + marketing + ad-ops + OPS
-- =============================================================

-- ─── SMM Groups ───────────────────────────────────────────────
-- Named page groups, e.g. "Local", "International"
CREATE TABLE public.smm_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  weekly_target integer NOT NULL DEFAULT 25,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER smm_groups_updated_at
  BEFORE UPDATE ON public.smm_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── SMM Group Platforms ──────────────────────────────────────
-- Which platforms are active per group, with credentials
CREATE TABLE public.smm_group_platforms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES public.smm_groups(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  page_id      text,           -- Meta page_id / TikTok user_id / YouTube channel_id
  page_name    text,
  handle       text,           -- @handle / channel URL slug
  access_token text,           -- per-platform override (falls back to env var)
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, platform)
);

-- ─── SMM Posts ────────────────────────────────────────────────
-- Content pieces — can link to a kanban card
CREATE TABLE public.smm_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES public.smm_groups(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  post_type       text NOT NULL CHECK (post_type IN ('organic','ad','trad_marketing','offline_event')),
  status          text NOT NULL DEFAULT 'idea'
                    CHECK (status IN ('idea','draft','scheduled','published','backlog')),
  caption         text,
  scheduled_at    timestamptz,
  published_at    timestamptz,
  linked_task_id  uuid REFERENCES public.kanban_cards(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER smm_posts_updated_at
  BEFORE UPDATE ON public.smm_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for calendar queries (scheduled posts by date)
CREATE INDEX smm_posts_scheduled_at_idx ON public.smm_posts (scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status IN ('scheduled','published');

-- ─── SMM Analytics ────────────────────────────────────────────
-- Daily metrics per platform (manual + API sync)
CREATE TABLE public.smm_analytics (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id          uuid NOT NULL REFERENCES public.smm_group_platforms(id) ON DELETE CASCADE,
  metric_date          date NOT NULL,
  impressions          integer NOT NULL DEFAULT 0,
  reach                integer NOT NULL DEFAULT 0,
  engagements          integer NOT NULL DEFAULT 0,
  follower_count       integer,
  follower_growth      integer,           -- delta from previous day
  video_plays          integer NOT NULL DEFAULT 0,
  video_plays_3s       integer NOT NULL DEFAULT 0,
  avg_play_time_secs   numeric(8,2) NOT NULL DEFAULT 0,
  -- Generated KPIs (avoid div/0)
  engagement_rate      numeric(8,6) GENERATED ALWAYS AS (
                         CASE WHEN reach > 0 THEN engagements::numeric / reach ELSE 0 END
                       ) STORED,
  hook_rate            numeric(8,6) GENERATED ALWAYS AS (
                         CASE WHEN impressions > 0 THEN video_plays_3s::numeric / impressions ELSE 0 END
                       ) STORED,
  data_source          text NOT NULL DEFAULT 'manual'
                         CHECK (data_source IN ('manual','api')),
  last_synced_at       timestamptz,
  UNIQUE (platform_id, metric_date)
);

-- ─── SMM Top Posts ────────────────────────────────────────────
-- Snapshot of best performing posts (API-pulled)
CREATE TABLE public.smm_top_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id         uuid NOT NULL REFERENCES public.smm_group_platforms(id) ON DELETE CASCADE,
  post_external_id    text NOT NULL,
  post_url            text,
  thumbnail_url       text,
  caption_preview     text,
  post_type           text CHECK (post_type IN ('video','image','carousel','reel','story')),
  published_at        timestamptz,
  impressions         integer,
  reach               integer,
  engagements         integer,
  video_plays         integer,
  avg_play_time_secs  numeric(8,2),
  metric_date         date NOT NULL,    -- date this snapshot was taken
  UNIQUE (platform_id, post_external_id)
);

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE public.smm_groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smm_group_platforms   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smm_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smm_analytics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smm_top_posts         ENABLE ROW LEVEL SECURITY;

-- smm_groups
CREATE POLICY smm_g_select  ON public.smm_groups FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY smm_g_insert  ON public.smm_groups FOR INSERT  WITH CHECK (public.is_ops());
CREATE POLICY smm_g_update  ON public.smm_groups FOR UPDATE  USING (public.is_ops());
CREATE POLICY smm_g_delete  ON public.smm_groups FOR DELETE  USING (public.is_ops());

-- smm_group_platforms
CREATE POLICY smm_gp_select ON public.smm_group_platforms FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY smm_gp_insert ON public.smm_group_platforms FOR INSERT  WITH CHECK (public.is_ops());
CREATE POLICY smm_gp_update ON public.smm_group_platforms FOR UPDATE  USING (public.is_ops());
CREATE POLICY smm_gp_delete ON public.smm_group_platforms FOR DELETE  USING (public.is_ops());

-- smm_posts — creatives/marketing can create & edit their own; OPS can do anything
CREATE POLICY smm_p_select  ON public.smm_posts FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY smm_p_insert  ON public.smm_posts FOR INSERT  WITH CHECK (public.is_ad_ops_access());
CREATE POLICY smm_p_update  ON public.smm_posts FOR UPDATE  USING (public.is_ad_ops_access());
CREATE POLICY smm_p_delete  ON public.smm_posts FOR DELETE  USING (
  public.is_ops() OR created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);

-- smm_analytics
CREATE POLICY smm_a_select  ON public.smm_analytics FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY smm_a_insert  ON public.smm_analytics FOR INSERT  WITH CHECK (public.is_ad_ops_access());
CREATE POLICY smm_a_update  ON public.smm_analytics FOR UPDATE  USING (public.is_ad_ops_access());
CREATE POLICY smm_a_delete  ON public.smm_analytics FOR DELETE  USING (public.is_ops());

-- smm_top_posts
CREATE POLICY smm_tp_select ON public.smm_top_posts FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY smm_tp_insert ON public.smm_top_posts FOR INSERT  WITH CHECK (public.is_ops());
CREATE POLICY smm_tp_update ON public.smm_top_posts FOR UPDATE  USING (public.is_ops());
CREATE POLICY smm_tp_delete ON public.smm_top_posts FOR DELETE  USING (public.is_ops());

-- =============================================================
-- Audit triggers on business tables
-- =============================================================

CREATE TRIGGER smm_groups_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.smm_groups
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER smm_posts_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.smm_posts
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER smm_analytics_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.smm_analytics
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
