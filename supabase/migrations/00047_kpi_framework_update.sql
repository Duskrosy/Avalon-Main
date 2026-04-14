-- ============================================================
-- 00047_kpi_framework_update.sql
-- Updates KPI definitions to match the official Ads Ops and
-- Creatives KPI frameworks (April 2026).
--
-- Changes:
--   1. Re-categorize Marketing KPIs into 4-tier system:
--      Performance → North Star, Traffic → Efficiency,
--      Conversion/Messenger RoAS → Supporting, Budget stays Budget
--   2. Update Marketing KPI thresholds to match Ads Ops framework
--   3. Add missing Marketing KPIs (Total Revenue, Returning
--      Customer Rate, Online Store Visits, Monthly Spend Utilization)
--   4. Update Creatives Video Avg. Play Time threshold
--   5. Add monthly organic variants for Creatives
-- ============================================================


-- ============================================================
-- 1. RE-CATEGORIZE Marketing KPIs into 4-tier system
-- ============================================================

-- Performance → North Star
UPDATE public.kpi_definitions
SET category = 'North Star'
WHERE category = 'Performance'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Traffic → Efficiency
UPDATE public.kpi_definitions
SET category = 'Efficiency'
WHERE category = 'Traffic'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Conversion RoAS and Messenger RoAS → Supporting
UPDATE public.kpi_definitions
SET category = 'Supporting'
WHERE name IN ('Conversion RoAS', 'Messenger RoAS')
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Budget stays Budget — no change needed


-- ============================================================
-- 2. UPDATE Marketing KPI thresholds (Ads Ops Framework)
-- ============================================================

-- Overall RoAS: 6.0/5.0 → 7.0/6.8 (higher_better)
UPDATE public.kpi_definitions
SET threshold_green = 7.0,
    threshold_amber = 6.8,
    hint = '≥7.0x. Total revenue ÷ total ad spend. Auto-synced weekly from Meta Ads data.'
WHERE name = 'Overall RoAS'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Conversion RoAS: 5.0/3.5 → 5.5/5.0
UPDATE public.kpi_definitions
SET threshold_green = 5.5,
    threshold_amber = 5.0,
    hint = '≥5.5x. Conversion campaign revenue ÷ conversion spend. Manual entry — cannot auto-separate campaign types from aggregated feed.'
WHERE name = 'Conversion RoAS'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Messenger RoAS: 10.0/8.0 → 13.5/12.5
UPDATE public.kpi_definitions
SET threshold_green = 13.5,
    threshold_amber = 12.5,
    hint = '≥13.5x. Messenger campaign revenue ÷ Messenger ad spend. Manual entry from Meta Ads Manager.'
WHERE name = 'Messenger RoAS'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CPM: 130/160 → 100/120 (lower_better)
UPDATE public.kpi_definitions
SET threshold_green = 100,
    threshold_amber = 120,
    hint = 'Below ₱100. Cost per 1,000 impressions (all campaigns). Auto-synced from Meta Ads.'
WHERE name = 'CPM'
  AND category IN ('Traffic', 'Efficiency')
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CPC: 10/13 → 10/10 (lower_better)
UPDATE public.kpi_definitions
SET threshold_green = 10,
    threshold_amber = 10,
    hint = 'Below ₱10. Cost per link click (all campaigns). Auto-synced from Meta Ads.'
WHERE name = 'CPC'
  AND category IN ('Traffic', 'Efficiency')
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CTR: green stays 1.5, amber 1.0 → 1.3 (higher_better)
UPDATE public.kpi_definitions
SET threshold_amber = 1.3,
    hint = 'Above 1.5%. Link clicks ÷ impressions (all campaigns). Auto-synced from Meta Ads.'
WHERE name = 'CTR'
  AND category IN ('Traffic', 'Efficiency')
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CPLV: 12/16 → 9/10 (lower_better)
UPDATE public.kpi_definitions
SET threshold_green = 9,
    threshold_amber = 10,
    hint = 'Below ₱9. Cost per landing page view. Manual entry from Meta Ads Manager (Landing Page Views column).'
WHERE name = 'CPLV'
  AND category IN ('Traffic', 'Efficiency')
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CPMR: 9/12 → 9/10 (lower_better)
UPDATE public.kpi_definitions
SET threshold_green = 9,
    threshold_amber = 10,
    hint = 'Below ₱9. Cost per Messenger result. Manual entry from Meta Ads Manager (Cost per Result for Messenger campaigns).'
WHERE name = 'CPMR'
  AND category IN ('Traffic', 'Efficiency')
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Budget Pacing → renamed to "Daily Budget Pacing": 0.9/0.7 → 1.0/0.89
UPDATE public.kpi_definitions
SET name = 'Daily Budget Pacing',
    threshold_green = 1.0,
    threshold_amber = 0.89,
    hint = 'Ideal: 1.0 (actual ÷ planned daily budget). Below 0.89 = underspending. Manual entry.'
WHERE name = 'Budget Pacing'
  AND category = 'Budget'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');


-- ============================================================
-- 3. ADD missing Marketing KPIs
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency,
   threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit,
       v.direction::public.kpi_direction, v.frequency::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
FROM public.departments d,
(VALUES
  ('Total Revenue',
   'North Star', 'currency_php', 'higher_better', 'monthly',
   6000000, 5500000,
   '≥₱6M monthly. Total revenue across all channels. Manual entry from Shopify/accounting.',
   0, false),
  ('Returning Customer Rate',
   'Supporting', 'percent', 'higher_better', 'monthly',
   25, 20,
   '≥25%. Percentage of returning customers out of total. Manual entry from Shopify analytics.',
   4, false),
  ('Online Store Visits',
   'Efficiency', 'number', 'higher_better', 'weekly',
   18500, 17500,
   '≥18,500 weekly store sessions. Manual entry from Shopify analytics.',
   19, false),
  ('Monthly Spend Utilization',
   'Budget', 'percent', 'higher_better', 'monthly',
   100, 94,
   '≥100% of allocated budget utilized. Actual spend ÷ planned monthly budget. Manual entry.',
   12, false)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, so, pt)
WHERE d.slug = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.department_id = d.id AND k.name = v.name AND k.category = v.category
  );


-- ============================================================
-- 4. UPDATE Creatives Video Avg. Play Time threshold
--    Framework says green = 4-6s, so green threshold → 4
-- ============================================================
UPDATE public.kpi_definitions
SET threshold_green = 4,
    hint = 'Green 4–6 seconds average view duration. Manual entry from Meta Ads Manager (Video Average Play Time column).'
WHERE name = 'Video Avg. Play Time'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'creatives');


-- ============================================================
-- 5. ADD monthly organic variants for Creatives
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency,
   threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit,
       v.direction::public.kpi_direction, v.frequency::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
FROM public.departments d,
(VALUES
  ('View Count (Monthly)',
   'Organic Performance', 'number', 'higher_better', 'monthly',
   10000, 7000,
   '≥10,000 views per month across organic posts. Manual entry from TikTok/IG insights.',
   23, false),
  ('Link Clicks (Monthly)',
   'Organic Performance', 'number', 'higher_better', 'monthly',
   70, 50,
   '≥70 link clicks per month from organic content. Manual entry from platform insights.',
   24, false)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, so, pt)
WHERE d.slug = 'creatives'
  AND NOT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.department_id = d.id AND k.name = v.name AND k.category = v.category
  );
