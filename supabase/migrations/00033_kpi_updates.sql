-- ============================================================
-- 00033_kpi_updates.sql
-- Run once — adds Ad Ops KPIs and additional Creatives KPI categories.
-- ============================================================


-- ==========================
-- AD OPS: Ad Content Performance
-- ==========================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order, kpi.auto
FROM public.departments d,
(VALUES
  ('Hook Rate',              'Ad Content Performance', 'percent',      'higher_better', 'weekly', 30,   25,   'Above 30%. Partial integration — pulled from Meta Ads. Per-creative linking coming soon.',      1, true),
  ('ThruPlay Rate',          'Ad Content Performance', 'percent',      'higher_better', 'weekly', 15,   10,   'Above 15%. Percentage watching 15s or 97% completion. Partial integration.',                  2, true),
  ('Click Through Rate',     'Ad Content Performance', 'percent',      'higher_better', 'weekly', 1.5,  1.0,  'Above 1.5%. Clicks ÷ impressions. Partial integration.',                                    3, true),
  ('Cost per 3-sec Play',    'Ad Content Performance', 'currency_php', 'lower_better',  'weekly', 0.60, 0.90, 'Below ₱0.60 target. Partial integration from Meta Ads.',                                    4, true),
  ('Video Avg. Play Time',   'Ad Content Performance', 'seconds',      'higher_better', 'weekly', 6,    3,    'Above 6 seconds. Partial integration from Meta Ads.',                                       5, true)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order, auto)
WHERE d.slug = 'ad-ops';


-- ==========================
-- AD OPS: Stills Performance
-- ==========================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order, kpi.auto
FROM public.departments d,
(VALUES
  ('CTR (Stills)',   'Stills Performance', 'percent',      'higher_better', 'weekly', 1.2,  1.0,  'Above 1.2%. Stills-specific click-through rate. Partial integration.',    6,  true),
  ('CPM',           'Stills Performance', 'currency_php', 'lower_better',  'weekly', 100,  120,  'Below ₱100. Cost per 1,000 impressions. Partial integration.',             7,  true),
  ('CPLV',          'Stills Performance', 'currency_php', 'lower_better',  'weekly', 8,    10,   'Below ₱8. Cost per landing page view. Partial integration.',               8,  true),
  ('CPC',           'Stills Performance', 'currency_php', 'lower_better',  'weekly', 10,   12,   'Below ₱10. Cost per click. Partial integration.',                          9,  true),
  ('Add-to-Carts',  'Stills Performance', 'number',       'higher_better', 'weekly', 20,   10,   '≥20 per week. Partial integration from Meta Ads.',                         10, true)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order, auto)
WHERE d.slug = 'ad-ops';


-- ==========================
-- CREATIVES: Stills Output
-- ==========================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order, kpi.auto
FROM public.departments d,
(VALUES
  ('Stills Delivered',           'Stills Output', 'number',  'higher_better', 'weekly', 5,   4,  '5+ per week. Count of stills creatives completed and delivered.',              9,  false),
  ('On-Time Delivery (Stills)',  'Stills Output', 'percent', 'higher_better', 'weekly', 95,  80, '≥95% on-time. Stills have a slightly tighter standard than video.',            10, false),
  ('Revision Efficiency (Stills)','Stills Output','percent', 'higher_better', 'weekly', 90,  80, '≥90%. Percentage of stills accepted within one revision round.',               11, false)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order, auto)
WHERE d.slug = 'creatives';


-- ==========================
-- CREATIVES: Stills Performance
-- ==========================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order, kpi.auto
FROM public.departments d,
(VALUES
  ('CTR (Stills)',         'Stills Performance', 'percent',      'higher_better', 'weekly', 1.2, 1.0,  'Above 1.2%. Partial integration — pulled from Meta Ads per still.',    12, true),
  ('CPM (Stills)',         'Stills Performance', 'currency_php', 'lower_better',  'weekly', 100, 120,  'Below ₱100. Partial integration from Meta Ads.',                        13, true),
  ('CPLV (Stills)',        'Stills Performance', 'currency_php', 'lower_better',  'weekly', 8,   10,   'Below ₱8. Cost per landing page view. Partial integration.',            14, true),
  ('CPC (Stills)',         'Stills Performance', 'currency_php', 'lower_better',  'weekly', 10,  12,   'Below ₱10. Cost per click. Partial integration.',                       15, true),
  ('Add-to-Carts (Stills)','Stills Performance', 'number',       'higher_better', 'weekly', 20,  10,   '≥20 per week. Partial integration from Meta Ads.',                      16, true)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order, auto)
WHERE d.slug = 'creatives';


-- ==========================
-- CREATIVES: Organic Performance
-- ==========================
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order, kpi.auto
FROM public.departments d,
(VALUES
  ('Hook Rate (Organic)',       'Organic Performance', 'percent', 'higher_better', 'weekly', 25,   20,   'Above 25% on organic content. Tracked manually from platform insights.',            17, false),
  ('View Count',                'Organic Performance', 'number',  'higher_better', 'weekly', 2500, 1750, '≥2,500 views per week per post. Manual entry from TikTok/IG insights.',             18, false),
  ('Avg. Watch Time (Organic)', 'Organic Performance', 'seconds', 'higher_better', 'weekly', 6,    4,    '≥6 seconds average. Manual entry from platform analytics.',                         19, false),
  ('Retention Rate',            'Organic Performance', 'percent', 'higher_better', 'weekly', 28,   18,   '≥28% of video length watched. Manual entry.',                                       20, false),
  ('Engagement Rate',           'Organic Performance', 'percent', 'higher_better', 'weekly', 0.6,  0.4,  '≥0.6%. (Engagements ÷ Reach). Manual entry.',                                      21, false),
  ('Link Clicks',               'Organic Performance', 'number',  'higher_better', 'weekly', 18,   12,   '≥18 link clicks per week. Manual entry from platform.',                             22, false)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order, auto)
WHERE d.slug = 'creatives';
