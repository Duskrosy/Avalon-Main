-- =============================================================
-- Migration 00016 — Competitor Tracking
-- Tables: smm_competitors, smm_competitor_accounts,
--         smm_competitor_snapshots
-- RLS: is_ad_ops_access() for read + write; is_ops() for delete
--      (competitors/accounts) and delete (snapshots)
-- =============================================================

-- ─── Competitors ──────────────────────────────────────────────
-- Top-level competitor entity (brand / creator / page)
CREATE TABLE public.smm_competitors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  notes       text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER smm_competitors_updated_at
  BEFORE UPDATE ON public.smm_competitors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Competitor Accounts ──────────────────────────────────────
-- One row per platform per competitor
CREATE TABLE public.smm_competitor_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id   uuid NOT NULL REFERENCES public.smm_competitors(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  handle          text,          -- @handle / channel URL slug
  external_id     text,          -- numeric ID if known
  is_active       boolean NOT NULL DEFAULT true,
  last_scraped_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competitor_id, platform)
);

-- ─── Competitor Snapshots ─────────────────────────────────────
-- Daily metrics per competitor account (manual entry or auto-scraped)
CREATE TABLE public.smm_competitor_snapshots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid NOT NULL REFERENCES public.smm_competitor_accounts(id) ON DELETE CASCADE,
  snapshot_date          date NOT NULL,
  follower_count         integer,
  post_count             integer,
  avg_engagement_rate    numeric(8,4),
  posting_frequency_week numeric(6,2),
  notes                  text,
  data_source            text NOT NULL DEFAULT 'manual'
                           CHECK (data_source IN ('auto','manual')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, snapshot_date)
);

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE public.smm_competitors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smm_competitor_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smm_competitor_snapshots ENABLE ROW LEVEL SECURITY;

-- smm_competitors
CREATE POLICY comp_select ON public.smm_competitors FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY comp_insert ON public.smm_competitors FOR INSERT  WITH CHECK (public.is_ad_ops_access());
CREATE POLICY comp_update ON public.smm_competitors FOR UPDATE  USING (public.is_ad_ops_access());
CREATE POLICY comp_delete ON public.smm_competitors FOR DELETE  USING (public.is_ops());

-- smm_competitor_accounts
CREATE POLICY comp_acc_sel ON public.smm_competitor_accounts FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY comp_acc_ins ON public.smm_competitor_accounts FOR INSERT  WITH CHECK (public.is_ad_ops_access());
CREATE POLICY comp_acc_upd ON public.smm_competitor_accounts FOR UPDATE  USING (public.is_ad_ops_access());
CREATE POLICY comp_acc_del ON public.smm_competitor_accounts FOR DELETE  USING (public.is_ops());

-- smm_competitor_snapshots — anyone with ad_ops_access can read/write; OPS to delete
CREATE POLICY comp_snap_sel ON public.smm_competitor_snapshots FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY comp_snap_ins ON public.smm_competitor_snapshots FOR INSERT  WITH CHECK (public.is_ad_ops_access());
CREATE POLICY comp_snap_upd ON public.smm_competitor_snapshots FOR UPDATE  USING (public.is_ad_ops_access());
CREATE POLICY comp_snap_del ON public.smm_competitor_snapshots FOR DELETE  USING (public.is_ops());

-- =============================================================
-- Audit triggers on business tables
-- =============================================================

CREATE TRIGGER smm_competitors_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.smm_competitors
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER smm_competitor_snapshots_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.smm_competitor_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
