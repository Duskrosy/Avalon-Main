-- ============================================================
-- 00011_dept_expansion.sql
-- Add missing departments and seed their KPI definitions.
--
-- Migration 00005 seeded KPIs for creatives, customer-service,
-- fulfillment, inventory, and sales. Only 'sales' existed in the DB
-- at that point — all other department inserts silently produced 0
-- rows. This migration:
--   1. Adds the missing departments
--   2. Re-seeds KPIs for those departments (ON CONFLICT DO NOTHING
--      so re-running is safe)
--   3. Adds new qualitative Sales KPIs (AI, duplication, schedule)
--   4. Fixes Creatives Video Avg Play Time threshold (6→4 seconds)
-- ============================================================


-- ============================================================
-- 1. DEPARTMENTS
-- ============================================================
INSERT INTO public.departments (name, slug, description) VALUES
  ('Creatives',        'creatives',        'Creative content and video production'),
  ('Customer Service', 'customer-service', 'Customer service and support'),
  ('Fulfillment',      'fulfillment',      'Order fulfillment operations'),
  ('Inventory',        'inventory',        'Inventory and stock management'),
  ('Marketing',        'marketing',        'Marketing department'),
  ('Marketplaces',     'marketplaces',     'Marketplace management (Shopee, Lazada, TikTok Shop)')
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- 2. CREATIVES — Ad Content KPIs
-- (Weekly performance + output metrics for video editor / content creator)
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit, v.direction::public.kpi_direction,
       v.frequency::public.kpi_frequency, v.tg, v.ta, v.hint, v.sort_order
FROM public.departments d,
(VALUES
  ('Hook Rate',                 'Performance', 'percent',      'higher_better', 'weekly', 30,  25,  'Above 30% target. Measures how many viewers watch past the hook.',            1),
  ('ThruPlay Rate',             'Performance', 'percent',      'higher_better', 'weekly', 15,  10,  'Above 15%. Percentage of viewers who watch 15s or to 97% completion.',       2),
  ('Click Through Rate',        'Performance', 'percent',      'higher_better', 'weekly', 1.5, 1.0, 'Above 1.5%. Clicks ÷ impressions.',                                          3),
  ('Cost per 3-sec Video Play', 'Performance', 'currency_php', 'lower_better',  'weekly', 0.60,0.90,'Below ₱0.60. Cost for each 3-second play.',                                  4),
  ('Video Avg. Play Time',      'Performance', 'seconds',      'higher_better', 'weekly', 4,   3,   'Target: above 6 seconds. Green ≥4s, Amber 3–3.9s, Red <3s.',                 5),
  ('Ad Content Videos Delivered','Output',     'number',       'higher_better', 'weekly', 5,   4,   '5+ per week. On-time delivery of ad content videos.',                        6),
  ('On-Time Delivery',          'Output',      'percent',      'higher_better', 'weekly', 100, 80,  '100% on-time delivery target.',                                              7),
  ('Revision Efficiency',       'Output',      'percent',      'higher_better', 'weekly', 90,  80,  '≥90%. First-pass or revision-within-one-round rate.',                        8)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, sort_order)
WHERE d.slug = 'creatives'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. CUSTOMER SERVICE KPIs
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit, v.direction::public.kpi_direction,
       v.frequency::public.kpi_frequency, v.tg, v.ta, v.hint, v.sort_order
FROM public.departments d,
(VALUES
  ('Customer Return Rate',      'Service Quality', 'percent', 'higher_better', 'monthly', 30, 20, '≥30% monthly. Measures how often customers come back.',                                               1),
  ('Good Customer Review Rate', 'Service Quality', 'percent', 'higher_better', 'monthly', 99, 95, '≥99%. Only 1 complaint per 100 orders. Replacements & refunds not counted unless accompanied by a bad review.', 2),
  ('Cancellation Rate',         'Service Quality', 'percent', 'lower_better',  'monthly', 5,  7,  '<5% target. Above 7% is a critical flag regardless of sales volume.',          3),
  ('On-Hand Utilization Rate',  'Inventory',       'percent', 'higher_better', 'monthly', 40, 30, '≥40% of delivered orders must come from on-hand inventory.',                   4)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, sort_order)
WHERE d.slug = 'customer-service'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 4. FULFILLMENT KPIs
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit, v.direction::public.kpi_direction,
       v.frequency::public.kpi_frequency, v.tg, v.ta, v.hint, v.sort_order
FROM public.departments d,
(VALUES
  ('Error Rate',                    'Operations', 'percent', 'lower_better',  'monthly', 1,   3,   '<1% target. Includes wrong items, wrong sizes, mispacks. Shared KPI with Inventory.',             1),
  ('Return-to-Sender (RTS) Rate',   'Operations', 'percent', 'lower_better',  'monthly', 7,   10,  '<7% target. RTS rate must stay below 10% at all times.',                                         2),
  ('Inventory Arrival to Dispatch', 'Operations', 'days',    'lower_better',  'monthly', 3,   5,   '<3 days from inventory arrival to dispatch.',                                                     3),
  ('Marketplace Score',             'Operations', 'percent', 'higher_better', 'monthly', 97,  93,  '≥97% across Shopee, Lazada, and TikTok Shop.',                                                    4),
  ('Masterlist Order Allocation',   'Compliance', 'percent', 'higher_better', 'monthly', 100, 95,  '100% allocated — Delivered, Cancelled, or RTS. Zero "No Update" status beyond 1 month.',          5),
  ('Remittance Accuracy',           'Compliance', 'percent', 'higher_better', 'monthly', 100, 95,  '100% accuracy required. Any discrepancy requires immediate investigation.',                        6)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, sort_order)
WHERE d.slug = 'fulfillment'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 5. INVENTORY KPIs
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit, v.direction::public.kpi_direction,
       v.frequency::public.kpi_frequency, v.tg, v.ta, v.hint, v.sort_order
FROM public.departments d,
(VALUES
  ('Inventory Accuracy',        'Stock Control', 'percent', 'higher_better', 'monthly', 99,   95,   '≥99% system vs physical count match. Activates upon Zetpy migration.',                             1),
  ('Error Rate',                'Stock Control', 'percent', 'lower_better',  'monthly', 1,    3,    '<1% target. Includes wrong items, sizes, mispacks. Shared KPI with Fulfillment.',                  2),
  ('Shipping Time from Order',  'Stock Control', 'weeks',   'lower_better',  'monthly', 3,    4,    '<3 weeks from order placement to receipt. Above 4 weeks is critical.',                             3),
  ('Total Inventory Level',     'Stock Levels',  'number',  'higher_better', 'monthly', 2500, 2000, '≥2,500 pairs. Below 2,000 is a critical stock alert.',                                            4),
  ('Packaging & Supplies Stock','Stock Levels',  'percent', 'higher_better', 'monthly', 100,  50,   'Log as 100 (all stocked), 50 (critically low on any item), or 0 (any item at zero). Covers: boxes, paper bags, bubble wrap, printing paper, tapes.', 5)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, sort_order)
WHERE d.slug = 'inventory'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 6. NEW SALES KPIs — qualitative leadership metrics
-- Scale: 0 = Critical, 1 = Monitor, 2 = On Track
-- (Weekly/Monthly Report Submission and Salary Tranche are
--  platform-tracked — the weekly-report and monthly-summary
--  pages capture this data automatically. Not seeded here.)
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit, v.direction::public.kpi_direction,
       v.frequency::public.kpi_frequency, v.tg, v.ta, v.hint, v.sort_order, v.auto
FROM public.departments d,
(VALUES
  ('AI (Alex) Report Submission',   'AI Performance',      'number', 'higher_better', 'weekly',  2, 1, 'Log 2 = submitted on time and complete, 1 = submitted but incomplete, 0 = not submitted. Weekly mandatory submission by Kristine.', 9,  false),
  ('Team Duplication of Alex Tasks','AI Performance',      'number', 'higher_better', 'weekly',  2, 1, 'Log 2 = zero duplication, 1 = occasional duplication observed, 0 = agents regularly doing what Alex handles. Sales members must not duplicate what Alex can already handle.', 10, false),
  ('Schedule Optimization',         'Leadership',          'number', 'higher_better', 'monthly', 2, 1, 'Log 2 = full coverage across all 26 working days, 1 = minor clustering of leaves observed, 0 = gaps in coverage on high-traffic days. No performance gaps allowed on high-traffic days.', 11, false)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, sort_order, auto)
WHERE d.slug = 'sales'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 7. FIX Creatives Video Avg. Play Time threshold
-- If the row already existed (e.g. from 00005 on a fresh install),
-- correct the threshold_green from 6 → 4.
-- ============================================================
UPDATE public.kpi_definitions
SET threshold_green = 4,
    hint = 'Target: above 6 seconds. Green ≥4s, Amber 3–3.9s, Red <3s.'
WHERE name = 'Video Avg. Play Time'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'creatives');


-- ============================================================
-- 8. Update is_ad_ops_access() to include creatives + marketing
-- now that those departments exist in the DB.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_ad_ops_access() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.is_ops() OR (
    SELECT slug FROM public.departments WHERE id = public.get_my_department_id() LIMIT 1
  ) IN ('ad-ops', 'creatives', 'marketing')
$$;
