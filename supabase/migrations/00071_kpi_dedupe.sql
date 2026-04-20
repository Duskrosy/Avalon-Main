-- ============================================================
-- 00071_kpi_dedupe.sql
-- Sprint F — remove duplicate kpi_definitions rows
--
-- Problem: multiple historical seed migrations (00005, 00011,
-- 00033, 00034, etc.) inserted overlapping KPI rows for the
-- same department. The /analytics/goals snapshot revealed
-- dozens of visible duplicates (same name, or renamed
-- equivalents) rendering side-by-side in the KPI Library.
--
-- Policy:
--   * Canonical = the row the Obsidian MD framework keeps
--     (the name 00069 updated). Its group_label is non-null
--     after 00069.
--   * Loser = the other row. Untagged rows landed in
--     "Source Stats" after 00070.
--   * Remap any goals pointing at a loser → canonical.
--   * DELETE the loser. kpi_entries FK is ON DELETE CASCADE —
--     acceptable because team-level entries were never
--     independently owned on the stale row (same policy as
--     the Sales "Overall ROAS" cleanup in 00069).
--
-- This migration handles two cases:
--   A. Same-name duplicates within the same department.
--   B. Renamed equivalents (name differs, same KPI).
--
-- Idempotent: all DELETEs gate on the loser actually existing;
-- goal remaps are harmless no-ops if the loser is already gone.
-- ============================================================


-- ============================================================
-- A. SAME-NAME DUPLICATES
--    For each (department_id, name) with >1 row, pick the
--    canonical winner (has group_label set, lowest sort_order,
--    earliest created_at) and remap + delete the rest.
-- ============================================================
do $$
declare
  r record;
  winner_id uuid;
begin
  for r in
    select department_id, name, count(*) as n
    from public.kpi_definitions
    group by department_id, name
    having count(*) > 1
  loop
    -- Pick the canonical winner for this (dept, name):
    -- prefer tagged rows (group_label not 'Source Stats'),
    -- then lowest sort_order, then earliest created_at.
    select id into winner_id
    from public.kpi_definitions
    where department_id = r.department_id
      and name = r.name
    order by
      case when coalesce(group_label, 'Source Stats') = 'Source Stats' then 1 else 0 end,
      sort_order nulls last,
      created_at
    limit 1;

    -- Remap goals on loser rows → winner
    update public.goals g
    set kpi_definition_id = winner_id
    where g.kpi_definition_id in (
      select id from public.kpi_definitions
      where department_id = r.department_id
        and name = r.name
        and id <> winner_id
    );

    -- Drop the losers (kpi_entries cascade)
    delete from public.kpi_definitions
    where department_id = r.department_id
      and name = r.name
      and id <> winner_id;
  end loop;
end $$;


-- ============================================================
-- B. RENAMED EQUIVALENTS
--    Different names, same KPI. Keep the framework name, remap
--    linked goals from the deprecated name, then delete.
-- ============================================================

-- Temporary lookup: resolved (dept, keep_id, drop_id) per rename pair.
-- Materialized in a temp table so we can reference it from both the
-- UPDATE (remap goals) and the DELETE (drop deprecated row).
create temp table _kpi_rename_pairs on commit drop as
with pairs(slug, keep_name, drop_name) as (
  values
    -- Creatives
    ('creatives',   'Ad Videos Delivered',           'Ad Content Videos Delivered'),
    ('creatives',   'Cost per 3-sec Video Play',     'Cost per 3-sec Play'),
    ('creatives',   'Add-to-Carts (Stills)',         'Add-to-Carts'),
    -- Fulfillment
    ('fulfillment', 'Return-to-Sender (RTS) Rate',   'Return-to-Sender Rate'),
    ('fulfillment', 'Inventory Arrival to Dispatch', 'Arrival to Dispatch Time'),
    -- Inventory
    ('inventory',   'Packaging & Supplies Stock',    'Packaging & Supplies')
)
select
  (select id from public.kpi_definitions
    where department_id = d.id and name = p.keep_name limit 1) as keep_id,
  (select id from public.kpi_definitions
    where department_id = d.id and name = p.drop_name limit 1) as drop_id
from pairs p
join public.departments d on d.slug = p.slug;

-- Remap any goals pointing at the deprecated row
update public.goals g
set kpi_definition_id = r.keep_id
from _kpi_rename_pairs r
where g.kpi_definition_id = r.drop_id
  and r.keep_id is not null
  and r.drop_id is not null;

-- Drop the deprecated rows
delete from public.kpi_definitions k
using _kpi_rename_pairs r
where k.id = r.drop_id
  and r.keep_id is not null
  and r.drop_id is not null;


-- ============================================================
-- Verification (commented):
--
--   -- Should return 0 rows after this migration:
--   select department_id, name, count(*)
--   from public.kpi_definitions
--   group by department_id, name
--   having count(*) > 1;
--
--   -- Spot-check dept KPI counts:
--   select d.slug, count(*) from public.kpi_definitions k
--   join public.departments d on d.id = k.department_id
--   group by d.slug order by d.slug;
-- ============================================================
