-- ============================================================
-- 00070_kpi_source_stats.sql
-- Sprint F — "Source Stats" catch-all bucket
--
-- After 00069 tagged every canonical framework KPI with a
-- group_label, any kpi_definitions row still missing a
-- group_label is a non-framework / legacy / source-derived row
-- (e.g. older seeds, ad-ops platform stats, pre-merge duplicates).
--
-- Per Finn: KPIs in the Obsidian MD framework are the ones that
-- get highlighted by canonical group. Everything else — real
-- source metrics that still show up in ad-ops/campaigns or
-- elsewhere — should collapse into a single trailing group
-- called "Source Stats" so the framework groups stay clean at
-- the top and the leftovers are still visible but deprioritized.
--
-- group_sort = 9000 places Source Stats last within any dept tab.
--
-- Idempotent: only hits rows where group_label is null.
-- ============================================================

update public.kpi_definitions
set group_label = 'Source Stats',
    group_sort  = 9000
where group_label is null;


-- ============================================================
-- Verification (commented — run manually after push):
--
--   select d.slug, k.group_label, k.group_sort, count(*)
--   from public.kpi_definitions k
--   join public.departments d on d.id = k.department_id
--   group by 1, 2, 3
--   order by d.slug, k.group_sort;
--
-- Expect: "Source Stats" rows collected at group_sort = 9000
-- for any dept that has un-framework KPIs still in the table.
-- ============================================================
