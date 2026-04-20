-- ============================================================
-- 00068_kpi_structure.sql
-- Sprint F Phase 0 — structural columns on kpi_definitions
--
-- Adds:
--   group_label          — canonical group name (e.g. 'North Star',
--                          'Supporting', 'Efficiency', 'Budget',
--                          'Ad Content Performance', 'Organic Content')
--   group_sort           — group display order within a department
--   owner_profile_id     — per-person KPIs (e.g. Kristine's incentive)
--   shared_with_dept_ids — KPIs visible under multiple dept tabs
--
-- All defaults are safe; existing rows are untouched. Per-row
-- group_label / group_sort values are populated in 00069.
-- ============================================================

alter table public.kpi_definitions
  add column if not exists group_label          text,
  add column if not exists group_sort           integer not null default 0,
  add column if not exists owner_profile_id     uuid references public.profiles(id) on delete set null,
  add column if not exists shared_with_dept_ids uuid[] not null default '{}';

create index if not exists kpi_definitions_group_idx
  on public.kpi_definitions (department_id, group_sort, sort_order);

create index if not exists kpi_definitions_owner_idx
  on public.kpi_definitions (owner_profile_id)
  where owner_profile_id is not null;

-- Extend the read policy so a user sees KPIs shared into their dept,
-- not just KPIs whose primary department_id matches.
drop policy if exists kpi_def_select on public.kpi_definitions;

create policy kpi_def_select on public.kpi_definitions for select using (
  is_active = true and (
    public.is_ops()
    or department_id is null
    or department_id = public.get_my_department_id()
    or public.get_my_department_id() = any(shared_with_dept_ids)
  )
);
