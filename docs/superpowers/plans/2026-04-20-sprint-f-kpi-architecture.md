# Sprint F — KPI Architecture Cleanup

**Date:** 2026-04-20
**Tickets:** #9 (department tabs in Goals & Deadlines), #18 (wired-on-top sort), #7 (Goals & Deadlines as single source of truth for KPI embeds)
**Status:** Ready to implement — architectural, ship after Sprints A–E

## Context

KPI state today:
- `kpi_definitions` table with `department_id`, `category` (free-text), `is_active`, `data_source_status` (values: `wired`, `to_be_wired`, `standalone`), `sort_order`, `frequency`, `unit`, `direction`, `threshold_green`, `threshold_amber`, `is_platform_tracked`
- `kpi_entries` stores values keyed by `kpi_definition_id` + `profile_id` + `period_date`
- **Goals & Deadlines** page (`/analytics/goals`) — fetches all goals, groups by department implicitly via filter
- **KPI Dashboard** page (`/analytics/kpis`) — fetches KPIs for current user's department only
- **Executive per-dept KPI tabs** (`/executive/ad-ops/kpi-tab-view.tsx`, etc.) — each department has its own bespoke KPI rendering
- Migration 00062 added `kpi_wiring_status`

Framework reference: `~/Documents/Obsidian Vault/KPIs/*.md` (Creatives, Marketing/Ads Ops, Sales, Customer Service, Fulfillment, Inventory).

Problems to fix:
1. Goals page already knows about KPIs via `kpi_definition_id` link, but doesn't organize them by department.
2. Each executive department tab renders KPI cards independently — duplicated logic and drift risk.
3. No "wired vs unwired" ordering to surface what's production-ready.
4. **Seed is incomplete** — Creatives (8 of ~22), Sales (8 of 14), Marketing (partial). Stills, Organic Content, Sales reporting/leadership KPIs missing.
5. **Period-aware thresholds not expressed** — same KPI has different weekly vs monthly RAG bands (e.g., Ad Videos Delivered: 5+/wk vs 23+/mo). Schema supports it via two rows with different `frequency`, but seed never created the pairs.
6. **Groups are free-text `category`** — framework defines canonical groups (North Star, Supporting, Efficiency, Budget, Ad Content Performance, Stills Performance, Organic Content, etc.). Current strings drift and sort alphabetically instead of by priority.
7. **Overall ROAS is duplicated** in Sales (green ≥14x) and Marketing (green ≥7x), with conflicting thresholds.
8. **Owner-specific KPIs have no first-class concept** — Kristine's Salary Tranche Progress and 5-Day Work Week Eligibility are per-person.
9. **Shared KPIs** (Error Rate in Fulfillment + Inventory, Customer Return Rate in CS + Sales, Cancellation Rate in CS + Sales, On-Hand Utilization in CS + Sales) are duplicated across dept rows with no link.

Goal: Goals & Deadlines becomes the single authoritative surface for KPI definitions; other dashboards consume via a shared `<KpiEmbed>` component, and the seed reflects the framework 1:1 with canonical groups.

## Tickets

- **#9** — Department tabs in Goals & Deadlines, proper KPI ↔ department alignment
- **#18** — Within each dept tab: wired/active KPIs on top, unwired/inactive at bottom
- **#7** — Make Goals & Deadlines the source of truth; refactor exec dashboards to consume embeds

## Phase 0 — Data model + seed completeness

This phase is prerequisite. It adds the structure needed to render canonical KPI groups in the embed and exec dashboard, and back-fills the missing KPIs from the framework docs.

### Task 0.1 — Schema additions (migration 00068)

**File:** `supabase/migrations/00068_kpi_structure.sql`

Add to `public.kpi_definitions`:

```sql
alter table public.kpi_definitions
  add column if not exists group_label        text,
  add column if not exists group_sort         integer not null default 0,
  add column if not exists owner_profile_id   uuid references public.profiles(id) on delete set null,
  add column if not exists shared_with_dept_ids uuid[] not null default '{}';

create index if not exists kpi_definitions_group_idx
  on public.kpi_definitions(department_id, group_sort, sort_order);

create index if not exists kpi_definitions_owner_idx
  on public.kpi_definitions(owner_profile_id) where owner_profile_id is not null;
```

Semantics:
- `group_label` — canonical group (e.g., `'North Star'`, `'Supporting'`, `'Efficiency'`, `'Budget'`, `'Ad Content Performance'`, `'Ad Content Output'`, `'Stills Output'`, `'Stills Performance'`, `'Organic Content'`, `'Sales Performance'`, `'Sales Ops'`, `'Reporting & Leadership'`, `'Incentive'`). Replaces free-text `category` for display; `category` stays for backward compat.
- `group_sort` — order of groups within a dept (0 for North Star, 1 for Supporting, etc.).
- `owner_profile_id` — if set, KPI is individually owned (e.g., Kristine's incentive). Non-owners see it read-only or hidden per RLS.
- `shared_with_dept_ids` — for KPIs that appear in multiple dept views (Error Rate shared between Fulfillment + Inventory). Embed dedupes by `id`.

### Task 0.2 — Seed top-up (migration 00069)

**File:** `supabase/migrations/00069_kpi_seed_topup.sql`

**Marketing (North Star, Supporting, Efficiency, Budget):**
- Add `Total Orders / Revenue` (number, monthly, green ≥6,000,000, amber 5M–5.99M)
- Reconcile `Overall ROAS` target to ≥7.0x green, 6.8–6.9x amber, <6.8x red (currently Sales has 14x — see Task 0.3)
- Verify Conversion ROAS (≥5.5x), Messenger ROAS (≥13.5x), Returning Customer Rate (≥25%) exist
- Ensure Efficiency group: Online Store Visits (weekly 18.5K / monthly 74K), CPLV, CPM, CPC, CTR, CPMR
- Budget group: Daily Budget Pacing (±10%), Monthly Spend Utilization (95–105%)
- Set `group_label` and `group_sort` on all Marketing rows.

**Creatives (5 groups):**

For each KPI, tag `group_label` + `group_sort`:

| group_sort | group_label | KPIs |
|---|---|---|
| 0 | Ad Content Performance | Hook Rate, ThruPlay Rate, CTR, Cost per 3-sec Video Play, Video Avg. Play Time |
| 1 | Ad Content Output | Ad Videos Delivered (weekly + monthly pair), On-Time Delivery, Revision Efficiency |
| 2 | Stills Output | Stills Delivered (weekly + monthly pair), On-Time Delivery (Stills), Revision Efficiency (Stills) |
| 3 | Stills Performance | CTR (Stills), CPM (Stills), CPLV (Stills), CPC (Stills), ATC (Stills) |
| 4 | Organic Content | Hook Rate (Organic), View Count (weekly + monthly), Avg Watch Time, Retention Rate, Engagement Rate, Link Clicks (weekly + monthly) |

Add missing KPIs not in current seed. Create **separate rows** for weekly and monthly variants where thresholds differ (e.g., `name = 'Ad Videos Delivered (Weekly)'` with frequency `weekly`, separate row `'Ad Videos Delivered (Monthly)'` with frequency `monthly`).

**Sales (4 groups):**

| group_sort | group_label | KPIs |
|---|---|---|
| 0 | Sales Performance | Confirmed Sales Volume, Delivered Sales Volume, Cancellation Rate, Customer Return Rate, Good Customer Review Rate |
| 1 | Sales Operations | FPS / Productivity Rate, On-Hand Utilization Rate, Lead / Follow-Up Discipline, QA / Quality Score |
| 2 | Reporting & Leadership | Weekly Report Submission, Monthly Report Submission, Schedule Optimization |
| 3 | Incentive | Salary Tranche Progress (owner_profile_id=Kristine), 5-Day Work Week Eligibility (owner_profile_id=Kristine) |

Drop the duplicate `Overall RoAS` row from Sales — it lives in Marketing.

**Customer Service:** already complete — just add `group_label = 'Service Quality'`, `group_sort = 0`; split On-Hand Utilization Rate into its own `group_sort = 1` (Inventory).

**Fulfillment:** already complete — tag with groups: `group_sort=0 'Operations'` for Error Rate/RTS/Arrival-to-Dispatch/Marketplace Score; `group_sort=1 'Compliance'` for Masterlist Allocation/Remittance Accuracy.

**Inventory:** already complete — tag groups: `group_sort=0 'Stock Control'` for Inventory Accuracy/Error Rate/Shipping Time; `group_sort=1 'Stock Levels'` for Total Inventory Level/Packaging & Supplies.

**Shared KPIs** — set `shared_with_dept_ids` on one canonical row rather than inserting duplicates:
- `Error Rate` canonical in Fulfillment, `shared_with_dept_ids = {inventory_id}`
- `Customer Return Rate` canonical in Customer Service, `shared_with_dept_ids = {sales_id}`
- `Cancellation Rate` canonical in Customer Service, `shared_with_dept_ids = {sales_id}`
- `On-Hand Utilization Rate` canonical in Customer Service, `shared_with_dept_ids = {sales_id}`

Delete the duplicate rows in the non-canonical dept after setting shared_with_dept_ids. **Preserve** any `kpi_entries` rows by remapping `kpi_definition_id` to the canonical row first.

### Task 0.3 — ROAS reconciliation script (inside 00069)

```sql
-- Remove Sales 'Overall ROAS' duplicate; keep the Marketing one.
-- Reassign any goal.kpi_definition_id pointing at Sales ROAS → Marketing ROAS first.
update public.goals g
set kpi_definition_id = (
  select id from public.kpi_definitions
  where name = 'Overall ROAS'
  and department_id = (select id from public.departments where slug = 'marketing')
)
where g.kpi_definition_id = (
  select id from public.kpi_definitions
  where name in ('Overall RoAS', 'Overall ROAS')
  and department_id = (select id from public.departments where slug = 'sales')
);

delete from public.kpi_definitions
where name in ('Overall RoAS', 'Overall ROAS')
  and department_id = (select id from public.departments where slug = 'sales');
```

## Phase 1 — #9 Department tabs

### Task 1 — Goals view restructure

**File:** `src/app/(dashboard)/analytics/goals/goals-view.tsx`

- Add a department tab strip above the goals list: `All | Ad-Ops | Creatives | Marketing | Sales | ...` populated from `departments` prop.
- OPS sees all tabs; non-OPS sees only their own department tab (no "All").
- Each tab filters goals by `department.id`.
- Persist selected tab in URL `?dept=<slug>` so links and refreshes keep state.
- Default to user's own department (fall back to "All" for OPS with no dept).

### Task 2 — Show dept-aligned KPI panel per tab

Within each department tab, show two sections:

1. **Goals** (existing goals list, filtered to that dept).
2. **KPI Library** (new) — grouped by `group_label` in `group_sort` order, showing for each group: group header + card list of `kpi_definitions` where `department_id = <dept>` OR `<dept> = ANY(shared_with_dept_ids)`, showing: name, current value (from `latestValueByKpiId`), RAG status (green/amber/red by threshold + direction), unit, sort_order drag-handle (manager+ only).

Fetch the extra KPI definitions in `page.tsx` (already fetched — just pass all, not just filtered).

### Task 3 — "Link goal to KPI" UX sharpening

Existing goal form has `kpi_definition_id` picker. Ensure the picker filters options to the current-tab department by default (with an "All departments" toggle for cross-dept goals). Include KPIs shared into the dept via `shared_with_dept_ids`.

## Phase 2 — #18 Wired-on-top sort

### Task 4 — Update sort order in KPI Library

**File:** `src/app/(dashboard)/analytics/goals/goals-view.tsx` (KPI Library section)

Sort KPIs within each group by:
1. `data_source_status = 'wired'` first
2. then `is_active = true`
3. then `sort_order ASC`
4. then `name ASC`

(Outer sort is `group_sort ASC`, so groups stay in framework order.)

Visually:
- **Wired & active** — full-color card, "Wired" green badge.
- **To wire** — muted card, amber "To Wire" badge.
- **Standalone** — neutral card, grey "Manual" badge.
- **Inactive** — under a collapsed "Inactive KPIs" accordion at the bottom of each group.

### Task 5 — Same sort in the existing KPI Dashboard

**File:** `src/app/(dashboard)/analytics/kpis/kpi-dashboard.tsx`

Apply the same group + wired-first ordering. Currently it only filters `is_active = true` — drop that filter and use the grouped sort. Wrap inactive KPIs in a collapsible section per group.

## Phase 3 — #7 Embed consumers + executive dashboard groupings

### Task 6 — Extract `<KpiEmbed>` component

**New file:** `src/components/kpi/kpi-embed.tsx` (client)

Props:
```ts
type KpiEmbedProps = {
  departmentSlug?: string;   // filter to a dept (includes shared KPIs)
  kpiKeys?: string[];         // or filter to specific KPIs by id
  groupLabels?: string[];     // optional: only render these groups
  layout?: 'grid' | 'list' | 'compact';
  showGoalLinks?: boolean;    // show "Goal: reach 120 by Q3" next to each KPI
  showInactive?: boolean;     // default false
  limit?: number;
};
```

Internally:
- Fetches `/api/kpis/embed?dept=<slug>&groups=<csv>&keys=<csv>` returning `{ groups: [{ label, sort, kpis: [{ id, name, unit, current_value, threshold_green, threshold_amber, direction, data_source_status, frequency, linked_goals: [...] }] }] }`.
- Renders grouped cards using same styling as Goals KPI Library (consistency guarantee).
- Groups render in `group_sort` order with sticky group headers in `list` layout.

### Task 7 — API for embed consumers

**New file:** `src/app/api/kpis/embed/route.ts`

- `GET` params: `dept`, `groups` (csv), `keys` (csv), `limit`.
- Permission: any authenticated user (RLS on `kpi_definitions` handles dept visibility; extended RLS allows `shared_with_dept_ids @> ARRAY[my_dept_id]`).
- Return shape above, already grouped server-side.
- Also return linked goals: `SELECT id, title, target_value, current_value, unit, deadline, status FROM goals WHERE kpi_definition_id IN (...)`.

### Task 8 — Refactor exec KPI tabs to use embed with canonical groups

The exec dashboard groupings should reflect the framework's canonical structure, not bespoke groupings per tab.

**Files:**
- `src/app/(dashboard)/executive/ad-ops/kpi-tab-view.tsx` → Marketing/Ads Ops groups
- `src/app/(dashboard)/executive/marketing/*` KPI section → Marketing groups
- `src/app/(dashboard)/executive/creatives/*` KPI section → Creatives groups
- `src/app/(dashboard)/executive/sales/*` KPI section → Sales groups
- `src/app/(dashboard)/executive/people/*` — no KPIs today; skip

Exec dashboard groupings to use:

**Marketing / Ad Operations exec tab:**
```tsx
<KpiEmbed
  departmentSlug="marketing"
  groupLabels={['North Star', 'Supporting', 'Efficiency', 'Budget']}
  layout="grid"
  showGoalLinks
/>
```
Visual: North Star as large single-card hero row; Supporting as 3-card row; Efficiency as 6-card dense grid; Budget as 2-card row.

**Creatives exec tab:**
```tsx
<KpiEmbed
  departmentSlug="creatives"
  groupLabels={[
    'Ad Content Performance',
    'Ad Content Output',
    'Stills Performance',
    'Stills Output',
    'Organic Content',
  ]}
  layout="grid"
  showGoalLinks
/>
```
Visual: Performance groups (Ad + Stills) share one row of 5+5 cards. Output groups (Ad + Stills) share one row of 3+3. Organic is its own row of 6.

**Sales exec tab:**
```tsx
<KpiEmbed
  departmentSlug="sales"
  groupLabels={['Sales Performance', 'Sales Operations', 'Reporting & Leadership']}
  layout="grid"
  showGoalLinks
/>
```
Incentive group is hidden on the exec tab (Kristine-specific) but visible on Kristine's own `/analytics/kpis` view via `owner_profile_id = current_user.id` filter.

**People exec tab** — no dept-level KPIs in framework. Leave as-is or surface Kristine's Incentive group if Finn wants it visible to leadership.

**Operations exec tab (new possibility):** since Fulfillment, Inventory, Customer Service all have KPIs but no exec dashboard tab today, either add a new `/executive/operations` tab that renders all three via `<KpiEmbed>` with `departmentSlug` iterations, or keep those KPIs visible only on `/analytics/goals` and `/analytics/kpis`. **Default to the latter** — keep scope contained.

Replace bespoke KPI rendering with the embed calls above. Keep any dept-specific extras (charts, trend lines, demographics) below the KPI row. Delete hand-rolled `kpi_definitions` queries from each tab file.

### Task 9 — Remove duplicate KPI definitions

Audit: search for inline KPI card rendering outside the embed. Check `src/app/(dashboard)/sales-ops/`, `operations/`, `ad-ops/live/`, and any dashboard that shows KPIs. Replace with `<KpiEmbed>` where appropriate.

**Do not remove** `/analytics/kpis` (that page stays as the per-user entry view — it uses the same sort/group logic but serves a different audience: individual contributors entering values).

## Verification

**Phase 0:**
1. `npx supabase db push` applies 00068 and 00069 without errors.
2. `select department_id, group_label, group_sort, count(*) from kpi_definitions group by 1,2,3 order by 1,3` shows expected group distribution per framework.
3. No orphaned `kpi_entries` — all point at surviving `kpi_definitions`.
4. No duplicate "Overall ROAS" across depts.

**Phase 1:**
1. Visit `/analytics/goals`. See department tabs.
2. Non-OPS user sees only their dept tab.
3. OPS sees "All" + each dept.
4. Clicking a tab filters goals AND shows the grouped KPI Library below, with group headers in framework order.

**Phase 2:**
1. Within a group, wired KPIs appear first with green badge.
2. "To Wire" KPIs follow with amber badge; Standalone with grey.
3. "Inactive KPIs" accordion is collapsed by default inside each group.
4. Same behavior visible on `/analytics/kpis`.

**Phase 3:**
1. Visit `/executive/marketing` — KPI card row renders via `<KpiEmbed>` with North Star hero + Supporting + Efficiency + Budget groups, matching Goals page styling pixel-for-pixel.
2. Visit `/executive/creatives` — Ad Content + Stills + Organic groups render in framework order.
3. Visit `/executive/sales` — Sales Performance + Ops + Reporting groups render; Incentive hidden.
4. Linked goal hint appears under a KPI when a goal points at that `kpi_definition_id`.
5. Change a KPI threshold in Goals & Deadlines → reflects everywhere on next load.
6. Shared KPI (e.g., Error Rate) renders on both Fulfillment + Inventory exec views if those tabs exist, pulling the same canonical row.

## Risk notes

- Phase 0 is irreversible data work. Dry-run migration 00069 on a staging snapshot before pushing.
- `shared_with_dept_ids` array column needs a GIN index if queried frequently; skip for now, add later if slow.
- Ship **Phase 0 + Phase 1 + Phase 2 first** (one PR), verify, **then** Phase 3 as a separate PR. Don't bundle — blast radius on exec tabs is wide.
- Check `gitnexus_impact` on `kpi_definitions` before removing duplicate queries (CLAUDE.md rule).
- Preserve existing exec-tab chart embeds (demographics, trend lines) — only swap the summary card row.
- Kristine-specific incentive KPIs: confirm `owner_profile_id` with Finn before seeding, since Kristine's profile ID must be known at migration time.

## Out of scope

- KPI editing UI from inside embeds (embed is read-only).
- Historical KPI trend charts inside the embed (link out to `/analytics/kpis` for drill-down).
- Cross-department KPI comparison views.
- Automated KPI wiring (Meta Ads → `kpi_entries` cron) — separate sprint.
- A new `/executive/operations` exec tab — possible follow-up if requested.
