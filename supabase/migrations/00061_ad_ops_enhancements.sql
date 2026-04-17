-- supabase/migrations/00061_ad_ops_enhancements.sql
-- ============================================================
-- Ad-Ops Enhancements
-- 1. ad_type column on kpi_definitions (fixes Messenger tab split)
-- 2. Ad-level columns on meta_ad_demographics (enables drill-down)
-- ============================================================

-- ── 1. KPI ad_type ──────────────────────────────────────────────────────────

ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS ad_type text NOT NULL DEFAULT 'conversion'
  CONSTRAINT kpi_definitions_ad_type_check
    CHECK (ad_type IN ('conversion', 'messenger', 'both'));

-- Messenger-specific KPIs
UPDATE public.kpi_definitions
  SET ad_type = 'messenger'
  WHERE name IN ('Messenger RoAS', 'CPMR');

-- KPIs relevant to both ad types
UPDATE public.kpi_definitions
  SET ad_type = 'both'
  WHERE name IN ('Overall RoAS', 'Daily Budget Pacing');

-- ── 2. Ad-level demographic columns ─────────────────────────────────────────

ALTER TABLE public.meta_ad_demographics
  ADD COLUMN IF NOT EXISTS adset_id      text,
  ADD COLUMN IF NOT EXISTS adset_name    text,
  ADD COLUMN IF NOT EXISTS ad_id         text,
  ADD COLUMN IF NOT EXISTS ad_name       text,
  ADD COLUMN IF NOT EXISTS campaign_name text,
  ADD COLUMN IF NOT EXISTS age_group     text;

-- Replace campaign-level unique constraint with ad-level one.
-- NULLS NOT DISTINCT: NULL = NULL in uniqueness check (Postgres 15+).
ALTER TABLE public.meta_ad_demographics
  DROP CONSTRAINT IF EXISTS meta_ad_demographics_unique;

ALTER TABLE public.meta_ad_demographics
  ADD CONSTRAINT meta_ad_demographics_unique
  UNIQUE NULLS NOT DISTINCT (
    meta_account_id, campaign_id, adset_id, ad_id,
    date, gender, age_group
  );
