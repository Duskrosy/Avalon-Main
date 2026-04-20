-- ============================================================
-- 00069_kpi_seed_topup.sql
-- Sprint F Phase 0 — canonical group tagging + missing KPIs
--
-- 1. Tag every existing kpi_definitions row with group_label +
--    group_sort per the framework docs
--    (~/Documents/Obsidian Vault/KPIs/*.md).
-- 2. Add missing Sales KPIs (Delivered Volume, Good Review Rate,
--    Customer Return Rate, FPS/Productivity, Lead Follow-up,
--    Weekly/Monthly Report Submission, Salary Tranche, 5-Day
--    Eligibility).
-- 3. Reconcile the duplicate "Overall ROAS" that exists on
--    both Sales and Marketing — keep Marketing's (7.0x green),
--    drop Sales's (14x green), remapping linked goals first.
-- 4. Cross-reference the four shared KPIs (Error Rate,
--    Customer Return Rate, Cancellation Rate, On-Hand Utilization)
--    by populating shared_with_dept_ids on BOTH rows so each dept
--    sees the other's canonical copy in its KPI Library — data
--    rows stay separate so each owner enters their own values.
--
-- Idempotent on re-run: UPDATEs are keyed by dept+name, INSERTs
-- gate on NOT EXISTS, deletes are narrow.
-- ============================================================


-- ============================================================
-- 1. GROUP LABELS / SORT — MARKETING
-- ============================================================
update public.kpi_definitions k
set group_label = v.grp, group_sort = v.gs
from (values
  ('Overall RoAS',                'North Star',  0),
  ('Total Revenue',               'North Star',  0),
  ('Conversion RoAS',             'Supporting',  1),
  ('Messenger RoAS',              'Supporting',  1),
  ('Returning Customer Rate',     'Supporting',  1),
  ('Online Store Visits',         'Efficiency',  2),
  ('CPM',                         'Efficiency',  2),
  ('CPC',                         'Efficiency',  2),
  ('CTR',                         'Efficiency',  2),
  ('CPLV',                        'Efficiency',  2),
  ('CPMR',                        'Efficiency',  2),
  ('Total Ad Spend',              'Budget',      3),
  ('Daily Budget Pacing',         'Budget',      3),
  ('Monthly Spend Utilization',   'Budget',      3)
) as v(nm, grp, gs)
where k.department_id = (select id from public.departments where slug = 'marketing')
  and k.name = v.nm;


-- ============================================================
-- 2. GROUP LABELS / SORT — CREATIVES
-- ============================================================
update public.kpi_definitions k
set group_label = v.grp, group_sort = v.gs
from (values
  -- Ad Content Performance
  ('Hook Rate',                   'Ad Content Performance', 0),
  ('ThruPlay Rate',               'Ad Content Performance', 0),
  ('Click Through Rate',          'Ad Content Performance', 0),
  ('Cost per 3-sec Video Play',   'Ad Content Performance', 0),
  ('Video Avg. Play Time',        'Ad Content Performance', 0),
  -- Ad Content Output
  ('Ad Videos Delivered',         'Ad Content Output',      1),
  ('On-Time Delivery',            'Ad Content Output',      1),
  ('Revision Efficiency',         'Ad Content Output',      1),
  -- Stills Output
  ('Stills Delivered',            'Stills Output',          2),
  ('On-Time Delivery (Stills)',   'Stills Output',          2),
  ('Revision Efficiency (Stills)','Stills Output',          2),
  -- Stills Performance
  ('CTR (Stills)',                'Stills Performance',     3),
  ('CPM (Stills)',                'Stills Performance',     3),
  ('CPLV (Stills)',               'Stills Performance',     3),
  ('CPC (Stills)',                'Stills Performance',     3),
  ('Add-to-Carts (Stills)',       'Stills Performance',     3),
  -- Organic Content
  ('Hook Rate (Organic)',         'Organic Content',        4),
  ('View Count',                  'Organic Content',        4),
  ('View Count (Monthly)',        'Organic Content',        4),
  ('Avg. Watch Time (Organic)',   'Organic Content',        4),
  ('Retention Rate',              'Organic Content',        4),
  ('Engagement Rate',             'Organic Content',        4),
  ('Link Clicks',                 'Organic Content',        4),
  ('Link Clicks (Monthly)',       'Organic Content',        4)
) as v(nm, grp, gs)
where k.department_id = (select id from public.departments where slug = 'creatives')
  and k.name = v.nm;


-- ============================================================
-- 3. GROUP LABELS / SORT — SALES (existing rows)
-- ============================================================
update public.kpi_definitions k
set group_label = v.grp, group_sort = v.gs
from (values
  ('Monthly Team Pairs Sold',         'Sales Performance',     0),
  ('Individual Agent Daily Target',   'Sales Performance',     0),
  ('Individual Agent Monthly Total',  'Sales Performance',     0),
  ('Cancellation Rate',               'Sales Performance',     0),
  ('Quality Score',                   'Sales Operations',      1),
  ('On-Hand Inventory Utilization',   'Sales Operations',      1),
  ('Monthly Messages Volume',         'Sales Operations',      1),
  ('AI (Alex) Report Submission',     'Reporting & Leadership',2),
  ('Team Duplication of Alex Tasks',  'Reporting & Leadership',2),
  ('Schedule Optimization',           'Reporting & Leadership',2)
) as v(nm, grp, gs)
where k.department_id = (select id from public.departments where slug = 'sales')
  and k.name = v.nm;


-- ============================================================
-- 4. GROUP LABELS / SORT — CUSTOMER SERVICE
-- ============================================================
update public.kpi_definitions k
set group_label = v.grp, group_sort = v.gs
from (values
  ('Customer Return Rate',      'Service Quality', 0),
  ('Good Customer Review Rate', 'Service Quality', 0),
  ('Cancellation Rate',         'Service Quality', 0),
  ('On-Hand Utilization Rate',  'Inventory Link',  1)
) as v(nm, grp, gs)
where k.department_id = (select id from public.departments where slug = 'customer-service')
  and k.name = v.nm;


-- ============================================================
-- 5. GROUP LABELS / SORT — FULFILLMENT
-- ============================================================
update public.kpi_definitions k
set group_label = v.grp, group_sort = v.gs
from (values
  ('Error Rate',                      'Operations', 0),
  ('Return-to-Sender (RTS) Rate',     'Operations', 0),
  ('Inventory Arrival to Dispatch',   'Operations', 0),
  ('Marketplace Score',               'Operations', 0),
  ('Masterlist Order Allocation',     'Compliance', 1),
  ('Remittance Accuracy',             'Compliance', 1)
) as v(nm, grp, gs)
where k.department_id = (select id from public.departments where slug = 'fulfillment')
  and k.name = v.nm;


-- ============================================================
-- 6. GROUP LABELS / SORT — INVENTORY
-- ============================================================
update public.kpi_definitions k
set group_label = v.grp, group_sort = v.gs
from (values
  ('Inventory Accuracy',        'Stock Control', 0),
  ('Error Rate',                'Stock Control', 0),
  ('Shipping Time from Order',  'Stock Control', 0),
  ('Total Inventory Level',     'Stock Levels',  1),
  ('Packaging & Supplies Stock','Stock Levels',  1)
) as v(nm, grp, gs)
where k.department_id = (select id from public.departments where slug = 'inventory')
  and k.name = v.nm;


-- ============================================================
-- 7. ADD MISSING SALES KPIs (per framework)
-- ============================================================
insert into public.kpi_definitions
  (department_id, name, category, group_label, group_sort,
   unit, direction, frequency, threshold_green, threshold_amber,
   hint, sort_order, is_platform_tracked)
select d.id, v.nm, v.cat, v.grp, v.gs,
       v.unit::public.kpi_unit, v.dir::public.kpi_direction, v.freq::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
from public.departments d,
(values
  -- Sales Performance
  ('Delivered Sales Volume',       'Volume',   'Sales Performance',     0,
   'number',  'higher_better', 'monthly',
   1100, 950,
   '≥1,100 pairs delivered per month. Tracks confirmed-to-delivered follow-through. Lower than 1,060 confirmed implies leakage.',
   12, true),
  ('Customer Return Rate',         'Quality',  'Sales Performance',     0,
   'percent', 'higher_better', 'monthly',
   30, 20,
   '≥30% monthly. Measures repeat buyers. Shared with Customer Service.',
   13, false),
  ('Good Customer Review Rate',    'Quality',  'Sales Performance',     0,
   'percent', 'higher_better', 'monthly',
   99, 95,
   '≥99%. Good review rate. Only 1 complaint per 100 orders accepted.',
   14, false),
  -- Sales Operations
  ('FPS / Productivity Rate',      'Operations','Sales Operations',     1,
   'number',  'higher_better', 'monthly',
   100, 80,
   'Fulfilled Per Shift productivity index. Normalized to 100 = on baseline, <80 is critical.',
   15, true),
  ('Lead / Follow-Up Discipline',  'Operations','Sales Operations',     1,
   'percent', 'higher_better', 'weekly',
   95, 80,
   '≥95% of assigned leads receive documented follow-up within 48h.',
   16, false),
  -- Reporting & Leadership
  ('Weekly Report Submission',     'Reporting','Reporting & Leadership',2,
   'percent', 'higher_better', 'weekly',
   100, 90,
   'On-time + complete weekly sales report (includes sales, quality, cancellation, AI notes). 100% = submitted on time and complete.',
   17, false),
  ('Monthly Report Submission',    'Reporting','Reporting & Leadership',2,
   'percent', 'higher_better', 'monthly',
   100, 90,
   'On-time + complete monthly sales report (includes trend analysis and staffing recommendations). 100% = submitted on time and complete.',
   18, false)
) as v(nm, cat, grp, gs, unit, dir, freq, tg, ta, hint, so, pt)
where d.slug = 'sales'
  and not exists (
    select 1 from public.kpi_definitions k
    where k.department_id = d.id and k.name = v.nm
  );


-- ============================================================
-- 8. ADD KRISTINE'S INCENTIVE KPIs (owner-specific)
--    owner_profile_id is NOT set in the migration — leave NULL
--    so the row is visible to the department; Finn/OPS can later
--    set owner_profile_id via UI to scope it to Kristine only.
-- ============================================================
insert into public.kpi_definitions
  (department_id, name, category, group_label, group_sort,
   unit, direction, frequency, threshold_green, threshold_amber,
   hint, sort_order, is_platform_tracked)
select d.id, v.nm, v.cat, v.grp, v.gs,
       v.unit::public.kpi_unit, v.dir::public.kpi_direction, v.freq::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
from public.departments d,
(values
  ('Salary Tranche Progress',      'Incentive','Incentive',             3,
   'number',  'higher_better', 'monthly',
   1375, 1200,
   'Tranche 3 = 1,375–1,549 pairs/mo (₱26,000). Tranche 4 = 1,550+ (₱30,000). Must sustain for 2 consecutive months to move up.',
   19, false),
  ('5-Day Work Week Eligibility',  'Incentive','Incentive',             3,
   'number',  'higher_better', 'monthly',
   1200, 1000,
   '1,200+ pairs for 2 consecutive months to qualify for 5-day work week arrangement.',
   20, false)
) as v(nm, cat, grp, gs, unit, dir, freq, tg, ta, hint, so, pt)
where d.slug = 'sales'
  and not exists (
    select 1 from public.kpi_definitions k
    where k.department_id = d.id and k.name = v.nm
  );


-- ============================================================
-- 9. DROP the Sales "Overall ROAS" duplicate
--    Marketing owns the canonical row (7.0/6.8 thresholds).
--    Sales row uses 14/10 — stale, confusing. Remap any goals
--    that point at it before deleting.
-- ============================================================
-- Remap linked goals
update public.goals g
set kpi_definition_id = (
  select id from public.kpi_definitions
  where name = 'Overall RoAS'
    and department_id = (select id from public.departments where slug = 'marketing')
  limit 1
)
where g.kpi_definition_id in (
  select id from public.kpi_definitions
  where name in ('Overall RoAS', 'Overall ROAS')
    and department_id = (select id from public.departments where slug = 'sales')
);

-- Delete the stale Sales row(s). kpi_entries is ON DELETE CASCADE,
-- so historical entries disappear with the row. This is acceptable —
-- the Sales ROAS number was never separately owned; the Marketing
-- row is the authoritative one going forward.
delete from public.kpi_definitions
where name in ('Overall RoAS', 'Overall ROAS')
  and department_id = (select id from public.departments where slug = 'sales');


-- ============================================================
-- 10. CROSS-REFERENCE SHARED KPIs
--     For KPIs that appear in two departments with the same
--     semantics, populate shared_with_dept_ids on BOTH rows.
--     This lets the embed show one canonical card on each dept
--     tab while keeping per-dept data separate.
--
--     Shared pairs (per framework):
--       Error Rate              Fulfillment ↔ Inventory
--       Customer Return Rate    Customer Service ↔ Sales
--       Cancellation Rate       Customer Service ↔ Sales
--       On-Hand Utilization     Customer Service ↔ Sales
--          (names differ: 'On-Hand Utilization Rate' in CS,
--                         'On-Hand Inventory Utilization' in Sales)
-- ============================================================
do $$
declare
  dept_fulfillment uuid := (select id from public.departments where slug = 'fulfillment');
  dept_inventory   uuid := (select id from public.departments where slug = 'inventory');
  dept_cs          uuid := (select id from public.departments where slug = 'customer-service');
  dept_sales       uuid := (select id from public.departments where slug = 'sales');
begin
  -- Error Rate — Fulfillment points at Inventory
  update public.kpi_definitions
  set shared_with_dept_ids = array[dept_inventory]
  where name = 'Error Rate' and department_id = dept_fulfillment;

  update public.kpi_definitions
  set shared_with_dept_ids = array[dept_fulfillment]
  where name = 'Error Rate' and department_id = dept_inventory;

  -- Customer Return Rate — CS ↔ Sales
  update public.kpi_definitions
  set shared_with_dept_ids = array[dept_sales]
  where name = 'Customer Return Rate' and department_id = dept_cs;

  update public.kpi_definitions
  set shared_with_dept_ids = array[dept_cs]
  where name = 'Customer Return Rate' and department_id = dept_sales;

  -- Cancellation Rate — CS ↔ Sales
  update public.kpi_definitions
  set shared_with_dept_ids = array[dept_sales]
  where name = 'Cancellation Rate' and department_id = dept_cs;

  update public.kpi_definitions
  set shared_with_dept_ids = array[dept_cs]
  where name = 'Cancellation Rate' and department_id = dept_sales;

  -- On-Hand Utilization — CS 'On-Hand Utilization Rate'
  --                      Sales 'On-Hand Inventory Utilization'
  update public.kpi_definitions
  set shared_with_dept_ids = array[dept_sales]
  where name = 'On-Hand Utilization Rate' and department_id = dept_cs;

  update public.kpi_definitions
  set shared_with_dept_ids = array[dept_cs]
  where name = 'On-Hand Inventory Utilization' and department_id = dept_sales;
end $$;


-- ============================================================
-- 11. VERIFICATION QUERIES (commented — run manually after push)
-- ============================================================
-- select d.slug, k.group_sort, k.group_label, count(*) as kpis
-- from public.kpi_definitions k
-- join public.departments d on d.id = k.department_id
-- group by 1, 2, 3
-- order by d.slug, k.group_sort;
--
-- Untagged rows should be empty:
-- select d.slug, k.name
-- from public.kpi_definitions k
-- join public.departments d on d.id = k.department_id
-- where k.group_label is null;
--
-- Duplicate Overall ROAS gone:
-- select count(*) from public.kpi_definitions
-- where name in ('Overall RoAS','Overall ROAS');  -- should return 1 (Marketing)
