# Goals & KPI Overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Goals page to show all KPI definitions in a grouped overview at the top (active + wired first, active standalone second, inactive collapsed at bottom), each with the existing wired/to-wire badge and an "Add Goal" shortcut button, and create a migration file that sets `data_source_status` values for Meta-backed KPIs (user pushes separately).

**Architecture:** Two-part change. (1) Data layer: extend `page.tsx` to fetch ALL `kpi_definitions` (not just active) plus latest `kpi_entries` team-level values, then pass a `latestValueByKpiId` lookup down to `GoalsView`. (2) UI layer: extend `goals-view.tsx` types, add computed groupings via `useMemo`, add a `fmtValue` helper, a `KpiCard` inner component, and a KPI Overview section above the existing goals list. No schema changes are needed — `data_source_status`, `is_active`, `threshold_green`, `threshold_amber`, `direction` all exist already. A separate migration file (DO NOT AUTO-PUSH) updates data_source_status values for KPIs that have Meta Ads integration available.

**Tech Stack:** Next.js App Router (Server Components for page.tsx, Client Component for goals-view.tsx), Supabase, React useMemo/useCallback, date-fns

---

## Files

- Modify: `src/app/(dashboard)/analytics/goals/page.tsx`
- Modify: `src/app/(dashboard)/analytics/goals/goals-view.tsx`
- Create: `supabase/migrations/00062_kpi_wiring_status.sql` (**DO NOT PUSH** — value-only migration, user reviews first)

---

## Task 1: Extend page.tsx to fetch all KPIs and latest entries

**File:**
- Modify: `src/app/(dashboard)/analytics/goals/page.tsx`

**Context:** Currently `page.tsx` fetches only `is_active = true` KPI definitions with 5 fields and no entry values. We need ALL definitions (including inactive, for the bottom section) plus latest team-level kpi_entry per KPI for displaying current values.

- [ ] **Step 1: Expand the kpiDefs query and add kpiEntries query**

Find the `Promise.all` call in `page.tsx` (lines 13–29). The third element is the kpiDefs query:
```typescript
    admin
      .from("kpi_definitions")
      .select("id, name, department_id, unit, category, data_source_status")
      .eq("is_active", true)
      .order("name"),
```

Replace that element AND add a fourth element for entries:
```typescript
    admin
      .from("kpi_definitions")
      .select("id, name, department_id, unit, category, data_source_status, is_active, threshold_green, threshold_amber, direction, sort_order")
      .order("sort_order")
      .order("name"),
    admin
      .from("kpi_entries")
      .select("kpi_definition_id, value_numeric, period_date")
      .is("profile_id", null)
      .order("period_date", { ascending: false }),
```

So the destructure line changes from:
```typescript
  const [{ data: goals }, { data: departments }, { data: kpiDefs }] = await Promise.all([
```
To:
```typescript
  const [{ data: goals }, { data: departments }, { data: kpiDefs }, { data: kpiEntries }] = await Promise.all([
```

- [ ] **Step 2: Build latestValueByKpiId map and pass to GoalsView**

After the `Promise.all` (before the `return`), add:
```typescript
  const latestValueByKpiId: Record<string, { value: number; date: string }> = {};
  for (const e of kpiEntries ?? []) {
    if (!latestValueByKpiId[e.kpi_definition_id]) {
      latestValueByKpiId[e.kpi_definition_id] = { value: e.value_numeric, date: e.period_date };
    }
  }
```

Then update the `<GoalsView ... />` JSX to add the new prop:
```tsx
  return (
    <GoalsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      goals={(goals ?? []) as any}
      departments={departments ?? []}
      kpiDefinitions={(kpiDefs ?? []) as any}
      latestValueByKpiId={latestValueByKpiId}
      currentDeptId={deptId}
      canManage={isManagerOrAbove(currentUser)}
      isOps={isOps(currentUser)}
    />
  );
```

- [ ] **Step 3: Build check**

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && npm run build 2>&1 | tail -20
```

Expected: TypeScript error on `GoalsView` because `latestValueByKpiId` is not yet in its Props type. That is expected — Task 2 fixes it.

- [ ] **Step 4: Commit (TypeScript errors OK at this stage — partial commit)**

Skip the build gate here. The page.tsx change is complete; we commit it and fix the types in Task 2.

```bash
cd "/Users/fc-international-1/Documents/Avalon New"
git add src/app/(dashboard)/analytics/goals/page.tsx
git commit -m "feat(goals): fetch all KPI defs + latest entries for KPI overview panel"
```

---

## Task 2: Extend GoalsView types and add grouping logic

**File:**
- Modify: `src/app/(dashboard)/analytics/goals/goals-view.tsx`

**Context:** The current `KpiDefOption` type has 6 fields and `Props` has no `latestValueByKpiId`. We extend both, add `useMemo` groupings, a `fmtValue` formatter, and a `handleAddGoalFromKpi` callback.

- [ ] **Step 1: Extend `KpiDefOption` type**

Find:
```tsx
type KpiDefOption = { id: string; name: string; department_id: string; unit: string; category: string; data_source_status: string };
```

Replace with:
```tsx
type KpiDefOption = {
  id: string;
  name: string;
  department_id: string;
  unit: string;
  category: string;
  data_source_status: string;
  is_active: boolean;
  threshold_green: number;
  threshold_amber: number;
  direction: string;
};
```

- [ ] **Step 2: Extend `Props` type**

Find:
```tsx
type Props = {
  goals: Goal[];
  departments: Dept[];
  kpiDefinitions: KpiDefOption[];
  currentDeptId: string | null;
  canManage: boolean;
  isOps: boolean;
};
```

Replace with:
```tsx
type Props = {
  goals: Goal[];
  departments: Dept[];
  kpiDefinitions: KpiDefOption[];
  latestValueByKpiId: Record<string, { value: number; date: string }>;
  currentDeptId: string | null;
  canManage: boolean;
  isOps: boolean;
};
```

- [ ] **Step 3: Add `fmtValue` helper after the `RAG_BORDER` constant**

Find the `const DATE_RANGES` line. Just before it, add:
```tsx
function fmtValue(v: number, unit: string): string {
  if (unit === "percent") return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  if (unit === "currency_php") {
    if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `₱${(v / 1_000).toFixed(0)}K`;
    return `₱${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (unit === "number") {
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  return `${v.toFixed(2)}x`; // ratio / RoAS
}
```

- [ ] **Step 4: Update `GoalsView` function signature to accept `latestValueByKpiId`**

Find:
```tsx
export function GoalsView({ goals: initial, departments, kpiDefinitions, currentDeptId, canManage, isOps }: Props) {
```

Replace with:
```tsx
export function GoalsView({ goals: initial, departments, kpiDefinitions, latestValueByKpiId, currentDeptId, canManage, isOps }: Props) {
```

- [ ] **Step 5: Add KPI groupings and handleAddGoalFromKpi inside `GoalsView`**

Find the block of `useState` declarations inside `GoalsView`. After all `useState` calls and just before the `useCallback` / `useEffect` / `useMemo` blocks, add:

```tsx
  const activeLinked = useMemo(
    () => kpiDefinitions.filter((k) => k.is_active && k.data_source_status !== "standalone"),
    [kpiDefinitions]
  );
  const activeStandalone = useMemo(
    () => kpiDefinitions.filter((k) => k.is_active && k.data_source_status === "standalone"),
    [kpiDefinitions]
  );
  const inactiveKpis = useMemo(
    () => kpiDefinitions.filter((k) => !k.is_active),
    [kpiDefinitions]
  );

  const handleAddGoalFromKpi = useCallback((kpi: KpiDefOption) => {
    setForm((f) => ({
      ...f,
      kpi_definition_id: kpi.id,
      unit: kpi.unit === "percent" ? "%" : kpi.unit === "currency_php" ? "PHP" : kpi.unit,
      target_value: String(kpi.threshold_green),
      department_id: kpi.department_id,
    }));
    setShowCreate(true);
  }, []);
```

- [ ] **Step 6: Build check**

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && npm run build 2>&1 | tail -20
```

Expected: Clean build — all types are now consistent. (The KPI overview JSX is added in Task 3.)

- [ ] **Step 7: Commit**

```bash
cd "/Users/fc-international-1/Documents/Avalon New"
git add src/app/(dashboard)/analytics/goals/goals-view.tsx
git commit -m "feat(goals): extend KpiDefOption + Props types, add KPI grouping logic and handleAddGoalFromKpi"
```

---

## Task 3: Add KPI Overview section to GoalsView JSX

**File:**
- Modify: `src/app/(dashboard)/analytics/goals/goals-view.tsx`

**Context:** Insert a KPI Overview section before the goals list (before the `{/* Summary cards */}` block or wherever the goals JSX starts). Renders three groups: active+linked (wired/to-wire badge), active standalone, inactive (collapsed `<details>`).

- [ ] **Step 1: Add `KpiCard` inner component before `GoalCard`**

Find `function GoalCard(` (around line 93). Just before it, insert:

```tsx
function KpiCard({
  kpi,
  latest,
  canManage,
  onAddGoal,
}: {
  kpi: KpiDefOption;
  latest: { value: number; date: string } | undefined;
  canManage: boolean;
  onAddGoal: (kpi: KpiDefOption) => void;
}) {
  let ragDot = "bg-[var(--color-border-primary)]";
  if (latest != null) {
    const v = latest.value;
    const isGood =
      kpi.direction === "higher_better"
        ? v >= kpi.threshold_green
        : v <= kpi.threshold_green;
    const isOk =
      kpi.direction === "higher_better"
        ? v >= kpi.threshold_amber
        : v <= kpi.threshold_amber;
    ragDot = isGood
      ? "bg-[var(--color-success)]"
      : isOk
      ? "bg-amber-400"
      : "bg-[var(--color-error)]";
  }

  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${ragDot}`} />
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{kpi.name}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] text-[var(--color-text-tertiary)]">{kpi.category}</span>
            {kpi.data_source_status !== "standalone" && (
              <>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">·</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    kpi.data_source_status === "wired"
                      ? "bg-green-50 text-green-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {kpi.data_source_status === "wired" ? "Wired" : "To Wire"}
                </span>
              </>
            )}
            {latest && (
              <span className="text-[10px] text-[var(--color-text-tertiary)]">· {latest.date}</span>
            )}
          </div>
        </div>
        {latest != null && (
          <span className="text-sm font-bold text-[var(--color-text-primary)] shrink-0 tabular-nums">
            {fmtValue(latest.value, kpi.unit)}
          </span>
        )}
      </div>
      {canManage && (
        <button
          type="button"
          onClick={() => onAddGoal(kpi)}
          className="mt-1 w-full text-xs border border-[var(--color-border-primary)] rounded-md py-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          + Add Goal
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Insert KPI Overview section in the return JSX**

In the `GoalsView` return, find the opening `<div className="...">` wrapper. After the opening wrapper tag and BEFORE the `{/* Summary cards */}` (or the first meaningful content), insert:

```tsx
      {/* ── KPI Overview ──────────────────────────────────────────────── */}
      {kpiDefinitions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">KPI Overview</h2>

          {activeLinked.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
                With Integration
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeLinked.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    kpi={kpi}
                    latest={latestValueByKpiId[kpi.id]}
                    canManage={canManage}
                    onAddGoal={handleAddGoalFromKpi}
                  />
                ))}
              </div>
            </div>
          )}

          {activeStandalone.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
                Manual Entry
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeStandalone.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    kpi={kpi}
                    latest={latestValueByKpiId[kpi.id]}
                    canManage={canManage}
                    onAddGoal={handleAddGoalFromKpi}
                  />
                ))}
              </div>
            </div>
          )}

          {inactiveKpis.length > 0 && (
            <details className="opacity-60">
              <summary className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide cursor-pointer select-none mb-3">
                Inactive KPIs ({inactiveKpis.length})
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                {inactiveKpis.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    kpi={kpi}
                    latest={latestValueByKpiId[kpi.id]}
                    canManage={canManage}
                    onAddGoal={handleAddGoalFromKpi}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
```

- [ ] **Step 3: Build check**

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && npm run build 2>&1 | tail -20
```

Expected: Clean build.

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Navigate to `/analytics/goals`:
- KPI Overview section appears above the goals list
- Active KPIs with `data_source_status !== 'standalone'` appear under "With Integration" (currently empty until migration B is pushed)
- Active KPIs with `data_source_status === 'standalone'` appear under "Manual Entry" (all current KPIs)
- Inactive KPIs are in a collapsed `<details>` at the bottom
- Each KPI card shows: name, category, RAG dot (gray if no latest entry), formatted value if entry exists
- Clicking "Add Goal" on any KPI card opens the create form pre-filled with that KPI's id, unit, and target = threshold_green
- Wired/To Wire badge appears on KPIs with non-standalone status (none yet until migration B)

- [ ] **Step 5: Commit**

```bash
cd "/Users/fc-international-1/Documents/Avalon New"
git add src/app/(dashboard)/analytics/goals/goals-view.tsx
git commit -m "feat(goals): add KPI Overview section with wired badges and Add Goal shortcut"
```

---

## Task 4: Create the data_source_status migration (DO NOT PUSH)

**File:**
- Create: `supabase/migrations/00062_kpi_wiring_status.sql`

**Context:** All KPI definitions currently have `data_source_status = 'standalone'` (the default set in migration 00055). Based on the hints in migration 00047, Overall RoAS / CPM / CPC / CTR are described as "auto-synced from Meta Ads" — the Meta Ads API integration already exists in the campaigns page, making these KPIs candidates for wiring. This migration marks them `to_be_wired`. The user reviews and pushes this file manually.

**Do NOT run `npx supabase db push` for this file — leave it for the user.**

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/00062_kpi_wiring_status.sql`:

```sql
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
```

- [ ] **Step 2: Commit the migration file (without pushing to DB)**

```bash
cd "/Users/fc-international-1/Documents/Avalon New"
git add supabase/migrations/00062_kpi_wiring_status.sql
git commit -m "feat(kpis): add data_source_status migration (DO NOT PUSH — review first)"
```

---

## Self-Review

**Spec coverage:**
- ✅ "Display all active KPIs neatly at the top grouped" — Task 3 adds KPI Overview with active KPIs in two groups
- ✅ "Separate by if has integration or not" — activeLinked (With Integration) vs activeStandalone (Manual Entry)
- ✅ "Inactive KPIs at the bottom" — `<details>` collapsed section for `is_active = false` KPIs
- ✅ "Put the existing tag on them with the wired component we have" — `KpiCard` renders the same green/amber badge pattern from GoalCard lines 147-155
- ✅ "A button per KPI card that says 'Add goal'" — `KpiCard` renders `+ Add Goal` button, calls `handleAddGoalFromKpi`
- ✅ "Which can adjust the KPI ranges needed and also add deadlines" — `handleAddGoalFromKpi` pre-fills the existing create form; user can edit target_value (range) and deadline before submitting
- ✅ "I can push that schema with values" — Task 4 creates migration B, notes not to auto-push
- ✅ "Two separate ones" — only Migration B needed (no structural changes), so only one file. If no structural migration is needed, only the value migration is created.

**Placeholder scan:** None — all JSX and TypeScript blocks are complete.

**Type consistency:**
- `KpiDefOption` extended in Task 2 Step 1; `KpiCard` component receives `kpi: KpiDefOption` — consistent
- `latestValueByKpiId: Record<string, { value: number; date: string }>` defined in page.tsx Task 1, typed in Props in Task 2, used in Task 3 — consistent
- `handleAddGoalFromKpi(kpi: KpiDefOption)` defined in Task 2, referenced as `onAddGoal` in `KpiCard` — consistent
- `fmtValue(v: number, unit: string)` defined in Task 2 Step 3, used in `KpiCard` Task 3 Step 1 — consistent

**Migration note:** Only one migration file is needed (value updates). No `ALTER TABLE` or `CREATE TABLE` is required because `data_source_status`, `is_active`, `threshold_green`, `threshold_amber`, and `direction` already exist on `kpi_definitions`. If the user later identifies KPIs that need structural changes, those go in a separate numbered migration.
