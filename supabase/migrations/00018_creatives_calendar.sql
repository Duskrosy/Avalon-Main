-- =============================================================
-- Migration 00018 — Creatives Weekly Campaigns + Calendar Settings
-- =============================================================

-- ─── Creatives Weekly Campaigns ───────────────────────────────
-- One row per week — tracks the named campaign and targets for that week
CREATE TABLE public.creatives_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start       date NOT NULL UNIQUE,   -- always the Monday of that week
  campaign_name    text NOT NULL,
  organic_target   integer NOT NULL DEFAULT 25,
  ads_target       integer NOT NULL DEFAULT 10,
  notes            text,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER creatives_campaigns_updated_at
  BEFORE UPDATE ON public.creatives_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── User Calendar Settings ───────────────────────────────────
-- Per-user toggles for which event types appear in their calendar by default
CREATE TABLE public.user_calendar_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  show_tasks      boolean NOT NULL DEFAULT true,
  show_leaves     boolean NOT NULL DEFAULT true,
  show_rooms      boolean NOT NULL DEFAULT true,
  show_birthdays  boolean NOT NULL DEFAULT true,
  show_posts      boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE public.creatives_campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_calendar_settings  ENABLE ROW LEVEL SECURITY;

-- Campaigns: creatives/ad-ops/OPS can read; managers+ can write
CREATE POLICY cc_select ON public.creatives_campaigns FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY cc_insert ON public.creatives_campaigns FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY cc_update ON public.creatives_campaigns FOR UPDATE USING (public.is_manager_or_above());
CREATE POLICY cc_delete ON public.creatives_campaigns FOR DELETE USING (public.is_ops());

-- Calendar settings: each user owns their own row
CREATE POLICY cs_select ON public.user_calendar_settings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY cs_insert ON public.user_calendar_settings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY cs_update ON public.user_calendar_settings FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY cs_delete ON public.user_calendar_settings FOR DELETE USING (user_id = auth.uid());

-- =============================================================
-- Audit trigger on creatives_campaigns
-- =============================================================

CREATE TRIGGER creatives_campaigns_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.creatives_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
