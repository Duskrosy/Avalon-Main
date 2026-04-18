-- ============================================================
-- 00062_kpi_wiring_status.sql
-- Updates data_source_status for KPI definitions based on
-- available integrations.
--
-- ⚠️  DO NOT AUTO-PUSH — review and confirm each KPI before
-- applying. Run manually: npx supabase db push
-- ============================================================

-- Meta Ads KPIs: Overall RoAS, CPM, CPC, CTR are computable
-- from the Meta Ads campaign stats integration that already exists.
-- Marked as 'to_be_wired' (planned wiring, not yet auto-populating kpi_entries).
UPDATE public.kpi_definitions
SET data_source_status = 'to_be_wired'
WHERE name IN ('Overall RoAS', 'CPM', 'CPC', 'CTR')
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- The following remain 'standalone' (manual entry required):
--   Conversion RoAS        — cannot auto-separate campaign types from aggregated API feed
--   Messenger RoAS         — manual entry from Meta Ads Manager (Cost per Result, Messenger column)
--   CPLV                   — manual entry from Meta Ads Manager (Landing Page Views column)
--   CPMR                   — manual entry from Meta Ads Manager (Cost per Result, Messenger column)
--   Daily Budget Pacing    — manual calculation (actual ÷ planned daily budget)
--   Monthly Spend Util.    — manual calculation (actual ÷ allocated monthly budget)
--   Total Revenue          — manual entry from Shopify/accounting
--   Returning Customer Rate — manual entry from Shopify analytics
--   Online Store Visits    — manual entry from Shopify analytics
--   Video Avg. Play Time   — manual entry from Meta Ads Manager
--   View Count (Monthly)   — manual entry from TikTok/IG insights
--   Link Clicks (Monthly)  — manual entry from TikTok/IG insights
