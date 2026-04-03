-- ============================================================
-- 00007_ad_ops.sql
-- Avalon Rebuild — Phase 7: Ad Operations
--
-- Ad Ops is a SHARED workspace between Creatives and Marketing.
-- Both departments + OPS can read/write. Marketing deploys,
-- Creatives produces. Ad Ops dept members coordinate both.
-- ============================================================


-- ==========================
-- ADD MISSING DEPARTMENTS
-- Creatives and Marketing need to exist for cross-dept RLS.
-- ==========================
INSERT INTO public.departments (name, slug, description) VALUES
  ('Creatives',  'creatives', 'Video and creative content production'),
  ('Marketing',  'marketing', 'Marketing and ad campaign management')
ON CONFLICT (slug) DO NOTHING;


-- ==========================
-- ENUMS
-- ==========================
CREATE TYPE public.ad_request_status  AS ENUM ('draft', 'submitted', 'in_progress', 'review', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.ad_asset_status    AS ENUM ('draft', 'pending_review', 'approved', 'needs_revision', 'archived');
CREATE TYPE public.ad_deploy_status   AS ENUM ('planned', 'active', 'paused', 'completed', 'cancelled');


-- ==========================
-- TAXONOMY VALUES
-- Global controlled vocabulary for products, content types, hook types, etc.
-- ==========================
CREATE TABLE public.ad_taxonomy_values (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category   text NOT NULL,   -- 'product' | 'content_type' | 'hook_type' | 'funnel_stage' | 'tag'
  value      text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (category, value)
);

CREATE INDEX idx_atv_category ON public.ad_taxonomy_values (category);

-- Seed starter taxonomy
INSERT INTO public.ad_taxonomy_values (category, value, sort_order) VALUES
  ('content_type', 'UGC',           10),
  ('content_type', 'Testimonial',   20),
  ('content_type', 'Product Demo',  30),
  ('content_type', 'Lifestyle',     40),
  ('content_type', 'Comparison',    50),
  ('hook_type',    'Problem-Agitate', 10),
  ('hook_type',    'Before-After',  20),
  ('hook_type',    'Question',      30),
  ('hook_type',    'Bold Statement',40),
  ('hook_type',    'Story',         50),
  ('funnel_stage', 'TOF',           10),
  ('funnel_stage', 'MOF',           20),
  ('funnel_stage', 'BOF',           30);


-- ==========================
-- AD REQUESTS
-- Marketing briefs a creative request. Creatives fulfills it.
-- ==========================
CREATE TABLE public.ad_requests (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         text NOT NULL,
  brief         text,
  requester_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignee_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status        public.ad_request_status NOT NULL DEFAULT 'draft',
  target_date   date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ar_status      ON public.ad_requests (status);
CREATE INDEX idx_ar_requester   ON public.ad_requests (requester_id);
CREATE INDEX idx_ar_assignee    ON public.ad_requests (assignee_id);
CREATE INDEX idx_ar_target_date ON public.ad_requests (target_date DESC);

CREATE TRIGGER trg_ar_updated_at
  BEFORE UPDATE ON public.ad_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_ar
  AFTER INSERT OR UPDATE OR DELETE ON public.ad_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- AD ASSETS
-- The creative output tied to a request.
-- ==========================
CREATE TABLE public.ad_assets (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id     uuid REFERENCES public.ad_requests(id) ON DELETE SET NULL,
  asset_code     text UNIQUE NOT NULL,
  title          text NOT NULL,
  product        text,
  content_type   text,
  hook_type      text,
  funnel_stage   text,
  creator_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  thumbnail_url  text,
  tags           text[] DEFAULT '{}',
  status         public.ad_asset_status NOT NULL DEFAULT 'draft',
  current_version integer NOT NULL DEFAULT 0,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aa_status       ON public.ad_assets (status);
CREATE INDEX idx_aa_creator      ON public.ad_assets (creator_id);
CREATE INDEX idx_aa_content_type ON public.ad_assets (content_type);
CREATE INDEX idx_aa_funnel_stage ON public.ad_assets (funnel_stage);

CREATE TRIGGER trg_aa_updated_at
  BEFORE UPDATE ON public.ad_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_aa
  AFTER INSERT OR UPDATE OR DELETE ON public.ad_assets
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- AD ASSET VERSIONS
-- Each submission of a creative file.
-- ==========================
CREATE TABLE public.ad_asset_versions (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id       uuid NOT NULL REFERENCES public.ad_assets(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  file_url       text NOT NULL,
  change_notes   text,
  submitted_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (asset_id, version_number)
);

CREATE INDEX idx_aav_asset_id ON public.ad_asset_versions (asset_id, version_number DESC);

CREATE TRIGGER trg_audit_aav
  AFTER INSERT OR UPDATE OR DELETE ON public.ad_asset_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- META AD ACCOUNTS
-- The Meta Business Manager accounts used for deployment.
-- ==========================
CREATE TABLE public.ad_meta_accounts (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id text UNIQUE NOT NULL,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ama_updated_at
  BEFORE UPDATE ON public.ad_meta_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- AD DEPLOYMENTS
-- An asset deployed to a Meta ad campaign.
-- ==========================
CREATE TABLE public.ad_deployments (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id         uuid NOT NULL REFERENCES public.ad_assets(id) ON DELETE RESTRICT,
  meta_account_id  uuid REFERENCES public.ad_meta_accounts(id) ON DELETE SET NULL,
  campaign_name    text,
  meta_campaign_id text,
  meta_adset_id    text,
  meta_ad_id       text,
  status           public.ad_deploy_status NOT NULL DEFAULT 'planned',
  launched_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  launched_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_adep_asset_id ON public.ad_deployments (asset_id);
CREATE INDEX idx_adep_status   ON public.ad_deployments (status);
CREATE INDEX idx_adep_account  ON public.ad_deployments (meta_account_id);

CREATE TRIGGER trg_adep_updated_at
  BEFORE UPDATE ON public.ad_deployments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_adep
  AFTER INSERT OR UPDATE OR DELETE ON public.ad_deployments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- PERFORMANCE SNAPSHOTS
-- Daily metric snapshots from Meta (manual or synced).
-- ==========================
CREATE TABLE public.ad_performance_snapshots (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  deployment_id        uuid NOT NULL REFERENCES public.ad_deployments(id) ON DELETE CASCADE,
  metric_date          date NOT NULL,
  spend                numeric(10,2) NOT NULL DEFAULT 0,
  impressions          integer NOT NULL DEFAULT 0,
  clicks               integer NOT NULL DEFAULT 0,
  outbound_clicks      integer NOT NULL DEFAULT 0,
  video_plays          integer NOT NULL DEFAULT 0,
  video_plays_25pct    integer NOT NULL DEFAULT 0,
  video_plays_50pct    integer NOT NULL DEFAULT 0,
  video_plays_75pct    integer NOT NULL DEFAULT 0,
  video_plays_100pct   integer NOT NULL DEFAULT 0,
  avg_play_time_secs   numeric(10,2) NOT NULL DEFAULT 0,
  conversions          integer NOT NULL DEFAULT 0,
  conversion_value     numeric(10,2) NOT NULL DEFAULT 0,
  -- Derived KPIs (stored for chart performance)
  hook_rate            numeric(6,4) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN ROUND((video_plays_25pct::numeric / impressions), 4) ELSE 0 END
  ) STORED,
  thruplay_rate        numeric(6,4) GENERATED ALWAYS AS (
    CASE WHEN video_plays > 0 THEN ROUND((video_plays_100pct::numeric / video_plays), 4) ELSE 0 END
  ) STORED,
  ctr                  numeric(6,4) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN ROUND((outbound_clicks::numeric / impressions), 4) ELSE 0 END
  ) STORED,
  roas                 numeric(10,4) GENERATED ALWAYS AS (
    CASE WHEN spend > 0 THEN ROUND((conversion_value / spend), 4) ELSE 0 END
  ) STORED,
  created_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (deployment_id, metric_date)
);

CREATE INDEX idx_aps_deployment_date ON public.ad_performance_snapshots (deployment_id, metric_date DESC);
CREATE INDEX idx_aps_metric_date     ON public.ad_performance_snapshots (metric_date DESC);


-- ==========================
-- META SYNC RUNS
-- Log of each Meta API data pull.
-- ==========================
CREATE TABLE public.ad_meta_sync_runs (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  status            text NOT NULL DEFAULT 'running',  -- running | success | failed
  records_processed integer NOT NULL DEFAULT 0,
  error_log         text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_amsr_status     ON public.ad_meta_sync_runs (status);
CREATE INDEX idx_amsr_started_at ON public.ad_meta_sync_runs (started_at DESC);


-- ==========================
-- RLS HELPER
-- Ad Ops access = OPS or any of: ad-ops, creatives, marketing departments
-- ==========================
CREATE OR REPLACE FUNCTION public.is_ad_ops_access() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.is_ops() OR (
    SELECT slug FROM public.departments WHERE id = public.get_my_department_id() LIMIT 1
  ) IN ('ad-ops', 'creatives', 'marketing')
$$;


-- ==========================
-- ENABLE RLS
-- ==========================
ALTER TABLE public.ad_taxonomy_values        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_taxonomy_values        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_requests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_requests               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_assets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_assets                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_asset_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_asset_versions         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_meta_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_meta_accounts          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_deployments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_deployments            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_performance_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_performance_snapshots  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_meta_sync_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_meta_sync_runs         FORCE ROW LEVEL SECURITY;


-- ==========================
-- RLS POLICIES
-- All tables: Creatives + Marketing + Ad-Ops dept + OPS can read.
-- Write/manage depends on role (manager+) or ownership.
-- ==========================

-- Taxonomy (OPS/manager manages, all ad-ops-access can read)
CREATE POLICY atv_select ON public.ad_taxonomy_values FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY atv_insert ON public.ad_taxonomy_values FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY atv_update ON public.ad_taxonomy_values FOR UPDATE USING (public.is_manager_or_above());
CREATE POLICY atv_delete ON public.ad_taxonomy_values FOR DELETE USING (public.is_ops());

-- Requests
CREATE POLICY ar_select ON public.ad_requests FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY ar_insert ON public.ad_requests FOR INSERT WITH CHECK (public.is_ad_ops_access());
CREATE POLICY ar_update ON public.ad_requests FOR UPDATE USING (public.is_ad_ops_access());
CREATE POLICY ar_delete ON public.ad_requests FOR DELETE USING (public.is_manager_or_above());

-- Assets
CREATE POLICY aa_select ON public.ad_assets FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY aa_insert ON public.ad_assets FOR INSERT WITH CHECK (public.is_ad_ops_access());
CREATE POLICY aa_update ON public.ad_assets FOR UPDATE USING (public.is_ad_ops_access());
CREATE POLICY aa_delete ON public.ad_assets FOR DELETE USING (public.is_manager_or_above());

-- Asset versions
CREATE POLICY aav_select ON public.ad_asset_versions FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY aav_insert ON public.ad_asset_versions FOR INSERT WITH CHECK (public.is_ad_ops_access());
CREATE POLICY aav_update ON public.ad_asset_versions FOR UPDATE USING (public.is_manager_or_above());
CREATE POLICY aav_delete ON public.ad_asset_versions FOR DELETE USING (public.is_manager_or_above());

-- Meta accounts (OPS manages; all can read)
CREATE POLICY ama_select ON public.ad_meta_accounts FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY ama_insert ON public.ad_meta_accounts FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY ama_update ON public.ad_meta_accounts FOR UPDATE USING (public.is_ops());
CREATE POLICY ama_delete ON public.ad_meta_accounts FOR DELETE USING (public.is_ops());

-- Deployments (marketing launches; all can read)
CREATE POLICY adep_select ON public.ad_deployments FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY adep_insert ON public.ad_deployments FOR INSERT WITH CHECK (public.is_ad_ops_access());
CREATE POLICY adep_update ON public.ad_deployments FOR UPDATE USING (public.is_ad_ops_access());
CREATE POLICY adep_delete ON public.ad_deployments FOR DELETE USING (public.is_manager_or_above());

-- Performance snapshots
CREATE POLICY aps_select ON public.ad_performance_snapshots FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY aps_insert ON public.ad_performance_snapshots FOR INSERT WITH CHECK (public.is_ad_ops_access());
CREATE POLICY aps_update ON public.ad_performance_snapshots FOR UPDATE USING (public.is_ad_ops_access());
CREATE POLICY aps_delete ON public.ad_performance_snapshots FOR DELETE USING (public.is_manager_or_above());

-- Meta sync runs (OPS only)
CREATE POLICY amsr_select ON public.ad_meta_sync_runs FOR SELECT USING (public.is_ops());
CREATE POLICY amsr_insert ON public.ad_meta_sync_runs FOR INSERT WITH CHECK (public.is_ops());
