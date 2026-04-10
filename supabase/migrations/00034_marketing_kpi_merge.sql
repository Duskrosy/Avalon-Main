-- ============================================================
-- 00034_marketing_kpi_merge.sql
-- Merges Ad Operations KPI definitions into the Marketing
-- department. Ad Ops and Marketing are one team.
--
-- Changes:
--   1. Move all ad-ops KPI definitions to marketing dept
--   2. Rename Stills Performance KPIs to avoid collision with new
--      general Traffic KPIs
--   3. Correct is_platform_tracked flags (only set true for KPIs
--      that can be fully computed from meta_ad_stats)
--   4. Add new KPI categories from the Ads Manager tracker:
--      Performance (RoAS), Budget (Spend), Traffic (CPM/CPC/CTR)
-- ============================================================


-- ============================================================
-- 1. Move all ad-ops KPI definitions → marketing
-- ============================================================
UPDATE public.kpi_definitions
SET department_id = (SELECT id FROM public.departments WHERE slug = 'marketing')
WHERE department_id = (SELECT id FROM public.departments WHERE slug = 'ad-ops');


-- ============================================================
-- 2. Rename Stills Performance KPIs so they don't clash with
--    the new general Traffic KPIs (CPM, CPC, CPLV).
--    Stills-specific metrics can't be auto-separated from the
--    aggregated meta_ad_stats feed, so they stay manual.
-- ============================================================
UPDATE public.kpi_definitions
SET name = 'CPM (Stills)', is_platform_tracked = false,
    hint = 'Below ₱100. Cost per 1,000 impressions for stills ads. Manual entry — cannot auto-separate from video in meta_ad_stats.'
WHERE name = 'CPM' AND category = 'Stills Performance'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

UPDATE public.kpi_definitions
SET name = 'CPLV (Stills)', is_platform_tracked = false,
    hint = 'Below ₱8. Cost per landing page view for stills. Manual entry from Meta Ads Manager.'
WHERE name = 'CPLV' AND category = 'Stills Performance'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

UPDATE public.kpi_definitions
SET name = 'CPC (Stills)', is_platform_tracked = false,
    hint = 'Below ₱10. Cost per click for stills ads. Manual entry — cannot auto-separate from video.'
WHERE name = 'CPC' AND category = 'Stills Performance'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

UPDATE public.kpi_definitions
SET is_platform_tracked = false
WHERE name IN ('CTR (Stills)', 'Add-to-Carts')
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');


-- ============================================================
-- 3. Fix is_platform_tracked for Ad Content Performance KPIs.
--    Video Avg. Play Time requires Meta's avg_play_time field
--    which is not stored in meta_ad_stats — keep manual.
-- ============================================================
UPDATE public.kpi_definitions
SET is_platform_tracked = false,
    hint = 'Target ≥4 seconds average view duration. Manual entry from Meta Ads Manager (Video Average Play Time column).'
WHERE name = 'Video Avg. Play Time'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');


-- ============================================================
-- 4. New KPI Category: Performance (RoAS metrics)
--    Thresholds based on March 2026 tracker data.
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency,
   threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit,
       v.direction::public.kpi_direction, v.frequency::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
FROM public.departments d,
(VALUES
  ('Overall RoAS',
   'Performance', 'number', 'higher_better', 'weekly',
   6.0, 5.0,
   '≥6.0x. Total revenue ÷ total ad spend. Auto-synced weekly from Meta Ads data.',
   1, true),
  ('Conversion RoAS',
   'Performance', 'number', 'higher_better', 'weekly',
   5.0, 3.5,
   '≥5.0x. Conversion campaign revenue ÷ conversion spend. Manual entry — cannot auto-separate campaign types from aggregated feed.',
   2, false),
  ('Messenger RoAS',
   'Performance', 'number', 'higher_better', 'weekly',
   10.0, 8.0,
   '≥10x. Messenger campaign revenue ÷ Messenger ad spend. Manual entry from Meta Ads Manager.',
   3, false)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, so, pt)
WHERE d.slug = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.department_id = d.id AND k.name = v.name AND k.category = v.category
  );


-- ============================================================
-- 5. New KPI Category: Budget (Spend & Pacing)
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency,
   threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit,
       v.direction::public.kpi_direction, v.frequency::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
FROM public.departments d,
(VALUES
  ('Total Ad Spend',
   'Budget', 'currency_php', 'lower_better', 'weekly',
   225000, 265000,
   'Weekly target ≤₱225K (≈₱32K daily × 7). Auto-synced from Meta Ads data.',
   10, true),
  ('Budget Pacing',
   'Budget', 'number', 'higher_better', 'weekly',
   0.9, 0.7,
   'Ideal: 0.9–1.1 (actual ÷ planned daily budget × days elapsed). Below 0.7 = underspending. Manual entry.',
   11, false)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, so, pt)
WHERE d.slug = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.department_id = d.id AND k.name = v.name AND k.category = v.category
  );


-- ============================================================
-- 6. New KPI Category: Traffic (CPM / CPC / CTR / CPLV / CPMR)
--    Thresholds calibrated from March 2026 tracker averages.
--    CPM avg ₱143 → target ₱130, amber ₱160
--    CPC avg ₱11.30 → target ₱10, amber ₱13
--    CTR avg 1.33% → target ≥1.5%, amber ≥1.0%
--    CPLV avg ₱14.48 → target ₱12, amber ₱16
--    CPMR avg ₱10.08 → target ₱9, amber ₱12
-- ============================================================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency,
   threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit,
       v.direction::public.kpi_direction, v.frequency::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
FROM public.departments d,
(VALUES
  ('CPM',
   'Traffic', 'currency_php', 'lower_better', 'weekly',
   130, 160,
   'Below ₱130. Cost per 1,000 impressions (all campaigns). Auto-synced from Meta Ads.',
   20, true),
  ('CPC',
   'Traffic', 'currency_php', 'lower_better', 'weekly',
   10, 13,
   'Below ₱10. Cost per link click (all campaigns). Auto-synced from Meta Ads.',
   21, true),
  ('CTR',
   'Traffic', 'percent', 'higher_better', 'weekly',
   1.5, 1.0,
   'Above 1.5%. Link clicks ÷ impressions (all campaigns). Auto-synced from Meta Ads.',
   22, true),
  ('CPLV',
   'Traffic', 'currency_php', 'lower_better', 'weekly',
   12, 16,
   'Below ₱12. Cost per landing page view. Manual entry from Meta Ads Manager (Landing Page Views column).',
   23, false),
  ('CPMR',
   'Traffic', 'currency_php', 'lower_better', 'weekly',
   9, 12,
   'Below ₱9. Cost per Messenger result. Manual entry from Meta Ads Manager (Cost per Result for Messenger campaigns).',
   24, false)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, so, pt)
WHERE d.slug = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.department_id = d.id AND k.name = v.name AND k.category = v.category
  );
