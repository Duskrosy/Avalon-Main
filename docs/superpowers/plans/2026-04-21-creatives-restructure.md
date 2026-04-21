# Creatives Module Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Creatives module so each page has a distinct identity: Dashboard (pulse + alerts), Planner (workflow stages — renamed from Tracker), Tracker (new chronological ledger), Analytics (content-level), Performance (platform-level), Settings (safer secrets). Upgrade the Gather picker, add Unassigned Posts stat, and build the new Tracker page.

**Architecture:** Route-level rename (`/creatives/tracker` → `/creatives/planner`) with a new greenfield page at `/creatives/tracker`. Navigation labels come from `src/lib/permissions/nav.ts`. The new Tracker reuses shaping/render helpers from `posted-content-view.tsx` (`resolveThumb`, `platformBadge`, metric formatters). Gather picker (`AssignPostModal` inside `tracker-view.tsx`) upgrades in place before the rename lands. Unassigned Posts stat queries the gap between published content (`smm_top_posts` / `meta_ad_stats`) and linked `creative_content_items.linked_post_id` / `linked_ad_asset_id`.

**Tech Stack:** Next.js 16 App Router, React Server Components, Supabase (Postgres + SSR client), Tailwind, TypeScript, bun.

---

## Testing Note (Project Reality)

This repo has **no test framework configured** (only `build` and `lint` in `package.json`). Verification in every task uses the available tooling:

- **Type check:** `bunx tsc --noEmit`
- **Lint:** `bun run lint`
- **Build:** `bun run build` (fail = regression)
- **Manual QA:** `gstack browse` commands against local dev server — screenshots, snapshots, click flows

Where the skill template says "write failing test," this plan substitutes a concrete verify-then-code-then-verify loop that ends at green.

---

## File Structure Overview

| File | Responsibility |
|------|----------------|
| `src/lib/permissions/nav.ts` | Nav labels for Creatives cluster (Planner, Tracker, etc.) |
| `src/app/(dashboard)/creatives/planner/page.tsx` | **Moved from** `tracker/page.tsx` — server component data fetch |
| `src/app/(dashboard)/creatives/planner/planner-view.tsx` | **Moved from** `tracker-view.tsx`, Mine-only removed, Gather modal upgraded |
| `src/app/(dashboard)/creatives/planner/gather-modal.tsx` | **Extracted** from inline definition — upgraded picker (multiselect, platform filter, ad hierarchy) |
| `src/app/(dashboard)/creatives/tracker/page.tsx` | **NEW** — chronological ledger server component |
| `src/app/(dashboard)/creatives/tracker/tracker-view.tsx` | **NEW** — month grouping, group + platform switchers, mini calendar |
| `src/app/(dashboard)/creatives/tracker/ledger-helpers.ts` | **NEW** — shaping helpers (shared with posted-content where useful) |
| `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | Add Unassigned Posts KpiTile |
| `src/app/(dashboard)/creatives/analytics/analytics-tabs-view.tsx` | Remove `"live"` tab; keep Recent or rename to content-focused label |
| `src/app/(dashboard)/creatives/analytics/analytics-view.tsx` | Tighten wording → content-level framing |
| `src/app/(dashboard)/creatives/performance/page.tsx` | Tighten wording → platform/group-level framing |
| `src/app/(dashboard)/creatives/settings/settings-view.tsx` | Hide/reveal secrets, `isSuperOps` guard for mutation |
| `src/lib/permissions/roles.ts` (new or existing) | `isSuperOps` helper |
| `src/app/api/creatives/unassigned-posts/route.ts` | **NEW** — count endpoint for dashboard |
| `src/app/api/creatives/tracker-feed/route.ts` | **NEW** — combined planned + posted feed for new Tracker |

---

## Decisions Resolved (2026-04-21)

All five decision points locked with the user before execution. Plan below has been updated to reflect these choices — no more pauses needed.

**D1. Route rename = clean break.** Rename folder `creatives/tracker/` → `creatives/planner/`, create greenfield `creatives/tracker/`. Old `/creatives/tracker` URL loads the NEW tracker page (not a redirect to Planner).

**D2. Super Ops role = reuse existing check.** No new role/migration. Settings gate uses the existing `canManage` / `isManager` pattern already in place. Task 21 is DROPPED. Task 22 still happens using existing permissions.

**D3. Unassigned Posts = combined with sub-label.** Single KPI tile `Unassigned Posts: N` with subtext `(X organic · Y ads)`. Query sums both `smm_top_posts` unassigned + `meta_ad_stats` unassigned.

**D4. Live tab = full delete + migrate Ads Spending Today widget to Performance page.** Two of the three Live columns (Published-24h, Scheduled-24h) are redundant with Posted Content / Planner. The third column (Ads spending today) is a unique platform/budget signal and moves to the Performance page — which belongs at the top since Performance is becoming the platform-level role. Phase 5 also needs to decouple Performance from its current `AnalyticsView` import.

**D5. Tracker visibility gate = existing route-permission pattern.** Use whatever guard the other `(dashboard)/creatives/*` routes already use; no new inline `department === 'creatives'` check. Task 15 reuses existing pattern — executor confirms on arrival.

---

## Phase 1 — Naming + Navigation Cleanup

Goal: rename Tracker → Planner, remove Mine-only, remove Live Analytics tab. Independent of later phases — ships on its own.

### Task 1: Extract AssignPostModal into its own file (prep for Phase 2)

**Why first:** The modal is currently inline in a 1,327-line `tracker-view.tsx`. Extracting it BEFORE the rename keeps git history clean (one move = one commit) and unblocks Phase 2 edits.

**Files:**
- Create: `src/app/(dashboard)/creatives/tracker/gather-modal.tsx`
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx` (remove inline `AssignPostModal`, import from new file)

- [ ] **Step 1: Run impact analysis on `AssignPostModal`**

```bash
# From project root
npx gitnexus impact --target AssignPostModal --direction upstream
```

Report blast radius. Expected: only used in `tracker-view.tsx`. If more, stop and reassess.

- [ ] **Step 2: Create `gather-modal.tsx` with the extracted component**

Copy the `AssignPostModal` function definition and its prop types (`SmmPost`, `LiveAd`, selection type) from `tracker-view.tsx` lines ~772-900 into a new file. Export as named export. Do not change behavior yet.

```tsx
// src/app/(dashboard)/creatives/tracker/gather-modal.tsx
"use client";
import { useMemo, useState } from "react";
// ...copy existing types SmmPost, LiveAd, and component body verbatim
export type GatherSelection = { kind: "post"; url: string } | { kind: "ad"; assetId: string };
export function AssignPostModal(props: {
  posts: SmmPost[];
  ads: LiveAd[];
  onSelect: (selection: GatherSelection) => void;
  onClose: () => void;
}) {
  /* existing body, unchanged */
}
```

- [ ] **Step 3: Replace inline definition with import in `tracker-view.tsx`**

```tsx
// top of tracker-view.tsx
import { AssignPostModal, type GatherSelection } from "./gather-modal";
```

Delete the inline `function AssignPostModal(...)` block. Delete any now-unused types that moved into `gather-modal.tsx`.

- [ ] **Step 4: Verify build + typecheck**

```bash
bunx tsc --noEmit
bun run lint
bun run build
```

Expected: all three pass. If TS complains about missing types, move them into `gather-modal.tsx` or re-export.

- [ ] **Step 5: Manual smoke-test**

Start dev server if not running, then:

```bash
$B goto http://localhost:3000/creatives/tracker
$B wait --load
$B snapshot -i
# Click "Gather Post" on a Published row
$B click '<ref from snapshot>'
$B snapshot -a -o /tmp/gather-after-extract.png
```

Use Read on `/tmp/gather-after-extract.png`. Modal should render identically to before.

- [ ] **Step 6: Pre-commit detect_changes**

```bash
npx gitnexus detect-changes --scope staged
```

Expect changes in two files only: `tracker-view.tsx`, `gather-modal.tsx` (new).

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/creatives/tracker/
git commit -m "refactor(creatives): extract AssignPostModal into gather-modal.tsx"
```

---

### Task 2: Remove "Mine only" filter from current Tracker page

**Files:**
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx:203, 245-249, 466-474`

- [ ] **Step 1: Impact check**

```bash
npx gitnexus context --name mineOnly
```

Report. Expect local-only state within `tracker-view.tsx`.

- [ ] **Step 2: Delete the state declaration**

At line ~203, remove:

```tsx
const [mineOnly, setMineOnly] = useState(false);
```

- [ ] **Step 3: Delete the `isMine` callback / filter call site**

Lines ~245-249. Remove the `isMine` helper AND any `.filter(isMine)` or `mineOnly && isMine(...)` usages.

- [ ] **Step 4: Delete the toggle UI**

Lines ~466-474 — the checkbox/label. Remove the JSX block entirely.

- [ ] **Step 5: Verify build + lint**

```bash
bunx tsc --noEmit && bun run lint && bun run build
```

- [ ] **Step 6: Manual QA**

```bash
$B goto http://localhost:3000/creatives/tracker
$B wait --load
$B snapshot -i
# confirm NO "Mine only" checkbox present
$B screenshot /tmp/tracker-no-mine-only.png
```

Read screenshot to confirm.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/creatives/tracker/tracker-view.tsx
git commit -m "refactor(creatives): remove Mine-only filter from tracker (becoming Planner)"
```

---

### Task 3: Rename `tracker` folder → `planner`

**Files:**
- Move: `src/app/(dashboard)/creatives/tracker/page.tsx` → `src/app/(dashboard)/creatives/planner/page.tsx`
- Move: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx` → `src/app/(dashboard)/creatives/planner/planner-view.tsx`
- Move: `src/app/(dashboard)/creatives/tracker/gather-modal.tsx` → `src/app/(dashboard)/creatives/planner/gather-modal.tsx`
- Modify: page title inside `planner-view.tsx` line ~389

- [ ] **Step 1: Impact scan**

```bash
npx gitnexus query --query "tracker-view"
```

Note any other files that import from `creatives/tracker/` — update those too.

- [ ] **Step 2: Move files with `git mv`**

```bash
cd "/Users/fc-international-1/Documents/Avalon New"
git mv "src/app/(dashboard)/creatives/tracker/page.tsx" "src/app/(dashboard)/creatives/planner/page.tsx"
git mv "src/app/(dashboard)/creatives/tracker/tracker-view.tsx" "src/app/(dashboard)/creatives/planner/planner-view.tsx"
git mv "src/app/(dashboard)/creatives/tracker/gather-modal.tsx" "src/app/(dashboard)/creatives/planner/gather-modal.tsx"
```

- [ ] **Step 3: Rename symbol `TrackerView` → `PlannerView` using gitnexus**

```bash
npx gitnexus rename --symbol-name TrackerView --new-name PlannerView --dry-run
# review output
npx gitnexus rename --symbol-name TrackerView --new-name PlannerView
```

If gitnexus flags text_search edits, apply them manually with Edit.

- [ ] **Step 4: Update page title in `planner-view.tsx`**

```tsx
<h1>Creatives Planner</h1>
```

(was: `<h1>Creatives Tracker</h1>`)

- [ ] **Step 5: Update page metadata in `planner/page.tsx`**

If a `metadata` export or `<title>` exists, change `Tracker` → `Planner`.

- [ ] **Step 6: Update any imports in `planner/page.tsx`**

```tsx
import { PlannerView } from "./planner-view";
```

- [ ] **Step 7: Verify build**

```bash
bunx tsc --noEmit && bun run lint && bun run build
```

If TS complains about a leftover reference, grep for `tracker-view` and `TrackerView` across `src/` and fix.

- [ ] **Step 8: Manual QA**

```bash
$B goto http://localhost:3000/creatives/planner
$B wait --load
$B text | head -20
$B screenshot /tmp/planner-page.png
```

Read screenshot. Header should say "Creatives Planner."

```bash
$B goto http://localhost:3000/creatives/tracker
$B wait --load
# Expect 404 until Phase 4 creates the new Tracker
```

- [ ] **Step 9: Commit**

```bash
git add -A src/app/\(dashboard\)/creatives/
git commit -m "refactor(creatives): rename Tracker page to Planner (route + component)"
```

---

### Task 4: Update nav label and route in `nav.ts`

**Files:**
- Modify: `src/lib/permissions/nav.ts:98-106` (Creatives cluster)

- [ ] **Step 1: Read the current nav block**

```bash
# via Read tool
```

Read `src/lib/permissions/nav.ts` lines 80-120 to confirm the exact shape.

- [ ] **Step 2: Change Tracker → Planner**

```ts
// Was: { label: "Tracker", href: "/creatives/tracker" }
{ label: "Planner", href: "/creatives/planner" }
```

Keep all other items (Dashboard, Posted Content, Analytics, Performance, Settings).

- [ ] **Step 3: Verify build**

```bash
bunx tsc --noEmit && bun run lint && bun run build
```

- [ ] **Step 4: Manual QA — sidebar**

```bash
$B goto http://localhost:3000/creatives/dashboard
$B wait --load
$B snapshot -i | grep -A1 Planner
$B click '<Planner ref>'
$B wait --load
$B url
# Expect: http://localhost:3000/creatives/planner
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions/nav.ts
git commit -m "feat(nav): rename Creatives Tracker to Planner in sidebar"
```

---

### Task 5: Remove Live Analytics tab

**Files:**
- Modify: `src/app/(dashboard)/creatives/analytics/analytics-tabs-view.tsx:39, 76-116, 120-154` (type, component, LivePanel)

- [ ] **Step 1: Impact check on `LivePanel`**

```bash
npx gitnexus impact --target LivePanel --direction upstream
npx gitnexus context --name AnalyticsLiveRecentView
```

Confirm `LivePanel` is only used inside `analytics-tabs-view.tsx`.

- [ ] **Step 2: Change tab type**

Line ~39. Was `type Tab = "live" | "recent";`. Change to:

```ts
type Tab = "recent";
```

Or remove the `Tab` type entirely if only one value remains and the useState for tab can be hardcoded.

- [ ] **Step 3: Delete `LivePanel` component**

Remove the function at lines ~120-154 entirely. Delete its imports if unused elsewhere.

- [ ] **Step 4: Simplify `AnalyticsLiveRecentView`**

At lines ~76-116, remove the tab-switcher UI and conditional render. Either render the Recent content directly, or keep a single-tab header for consistency. Prefer removing the tabs entirely.

- [ ] **Step 5: Typecheck + lint + build**

```bash
bunx tsc --noEmit && bun run lint && bun run build
```

- [ ] **Step 6: Manual QA**

```bash
$B goto http://localhost:3000/creatives/analytics
$B wait --load
$B snapshot -i
$B screenshot /tmp/analytics-no-live-tab.png
```

Read screenshot. No "Live" tab visible.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/creatives/analytics/
git commit -m "refactor(creatives): remove Live Analytics tab per restructure spec"
```

---

### Task 6: Phase 1 regression sweep

- [ ] **Step 1: Full app smoke test**

```bash
$B goto http://localhost:3000/creatives/dashboard; $B screenshot /tmp/sweep-dashboard.png
$B goto http://localhost:3000/creatives/planner; $B screenshot /tmp/sweep-planner.png
$B goto http://localhost:3000/creatives/posted-content; $B screenshot /tmp/sweep-posted.png
$B goto http://localhost:3000/creatives/analytics; $B screenshot /tmp/sweep-analytics.png
$B goto http://localhost:3000/creatives/performance; $B screenshot /tmp/sweep-perf.png
$B goto http://localhost:3000/creatives/settings; $B screenshot /tmp/sweep-settings.png
```

Read all six screenshots. Each page must load without error. Console must be clean:

```bash
$B console --errors
```

- [ ] **Step 2: `gitnexus detect_changes` across the whole Phase 1 diff**

```bash
npx gitnexus detect-changes --scope compare --base-ref main
```

Confirm only expected files changed.

- [ ] **Step 3: Reindex if commits piled up**

```bash
# Index is automatically reindexed by PostToolUse hook after commit.
# If the hook didn't run, do it now:
npx gitnexus analyze
```

---

## Phase 2 — Planner Gather Modal Upgrades

Goal: inside the now-named Planner, upgrade the Gather picker so it supports multiselect, richer ad context (thumbnail + campaign + ad set + ad name), and platform filtering for organic posts.

### Task 7: Add ad thumbnail + hierarchy to Gather modal ad rows

**Files:**
- Modify: `src/app/(dashboard)/creatives/planner/gather-modal.tsx` (ad render section, ~line 800 region from pre-move)
- Verify: data source `meta_ad_stats` already carries thumbnail/campaign/adset — if not, update `planner/page.tsx` fetch to join those fields.

- [ ] **Step 1: Inspect current LiveAd type**

```bash
# Read gather-modal.tsx
```

Identify which fields exist: `ad_name`, `campaign_name`, `adset_name`, `thumbnail_url`, `asset_id`.

- [ ] **Step 2: If fields missing, update the data fetch**

In `planner/page.tsx`, extend the `meta_ad_stats` select to include `campaign_name, adset_name, thumbnail_url`. If those columns don't exist on the table, query `ad_assets` via join on `asset_id`.

```sql
-- Shape check first
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'meta_ad_stats';
```

Run that via `supabase sql` if needed to confirm.

- [ ] **Step 3: Update LiveAd type**

```ts
export type LiveAd = {
  assetId: string;
  adName: string;
  campaignName: string | null;
  adsetName: string | null;
  thumbnailUrl: string | null;
  // ...existing fields
};
```

- [ ] **Step 4: Render the hierarchy in each ad row**

Replace the current ad row JSX with:

```tsx
<li className="flex gap-3 p-2 border-b">
  {ad.thumbnailUrl ? (
    <img src={ad.thumbnailUrl} alt="" className="h-12 w-12 rounded object-cover" />
  ) : (
    <div className="h-12 w-12 rounded bg-neutral-200" />
  )}
  <div className="flex-1 text-sm">
    {ad.campaignName && <div className="text-neutral-500">{ad.campaignName}</div>}
    {ad.adsetName && <div className="text-neutral-600">{ad.adsetName}</div>}
    <div className="font-medium">{ad.adName}</div>
  </div>
  <button onClick={() => onSelect({ kind: "ad", assetId: ad.assetId })}>Select</button>
</li>
```

- [ ] **Step 5: Typecheck + lint + build**

```bash
bunx tsc --noEmit && bun run lint && bun run build
```

- [ ] **Step 6: Manual QA**

```bash
$B goto http://localhost:3000/creatives/planner
$B wait --load
$B snapshot -i
$B click '<Gather Post ref on a Published row>'
$B wait --load
# switch to Ads tab inside modal if present
$B snapshot -a -o /tmp/gather-ads-hierarchy.png
```

Read screenshot. Each ad row shows thumbnail + campaign + ad set + ad name.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/creatives/planner/
git commit -m "feat(creatives): Gather picker shows ad thumbnail + campaign + adset hierarchy"
```

---

### Task 8: Add organic platform filter to Gather modal

**Files:**
- Modify: `src/app/(dashboard)/creatives/planner/gather-modal.tsx`

- [ ] **Step 1: Add `platformFilter` state**

```tsx
const [platformFilter, setPlatformFilter] = useState<
  "all" | "facebook" | "instagram" | "tiktok" | "youtube"
>("all");
```

- [ ] **Step 2: Add platform tabs/chips UI above the organic list**

```tsx
<div className="flex gap-2 mb-2">
  {(["all","facebook","instagram","tiktok","youtube"] as const).map(p => (
    <button
      key={p}
      onClick={() => setPlatformFilter(p)}
      className={platformFilter === p ? "font-bold underline" : ""}
    >{p}</button>
  ))}
</div>
```

- [ ] **Step 3: Apply the filter to `posts` before render**

```tsx
const filteredPosts = useMemo(
  () => platformFilter === "all"
    ? posts
    : posts.filter(p => p.platform?.toLowerCase() === platformFilter),
  [posts, platformFilter]
);
```

Use `filteredPosts` in the organic list render.

- [ ] **Step 4: Typecheck + lint + build**

```bash
bunx tsc --noEmit && bun run lint && bun run build
```

- [ ] **Step 5: Manual QA**

```bash
$B goto http://localhost:3000/creatives/planner
$B click '<Gather Post>'
$B snapshot -i
$B click '<facebook filter ref>'
$B snapshot -a -o /tmp/gather-organic-fb.png
```

Read screenshot. Only Facebook organic posts visible.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/creatives/planner/gather-modal.tsx
git commit -m "feat(creatives): platform filter for organic posts in Gather picker"
```

---

### Task 9: Multiselect in Gather modal

**Files:**
- Modify: `src/app/(dashboard)/creatives/planner/gather-modal.tsx`
- Modify: `src/app/(dashboard)/creatives/planner/planner-view.tsx` (onSelect handler)

- [ ] **Step 1: Change prop signature to a batch callback**

```ts
export type GatherSelection =
  | { kind: "post"; url: string }
  | { kind: "ad"; assetId: string };

export function AssignPostModal(props: {
  posts: SmmPost[];
  ads: LiveAd[];
  onConfirm: (selections: GatherSelection[]) => void;
  onClose: () => void;
}) { /* ... */ }
```

(Rename `onSelect` → `onConfirm` to signal the batch nature — and gitnexus-rename the callsite.)

- [ ] **Step 2: Add selection state + checkbox UI**

```tsx
const [selected, setSelected] = useState<GatherSelection[]>([]);
const isSelected = (s: GatherSelection) =>
  selected.some(x => JSON.stringify(x) === JSON.stringify(s));
const toggle = (s: GatherSelection) =>
  setSelected(prev =>
    isSelected(s)
      ? prev.filter(x => JSON.stringify(x) !== JSON.stringify(s))
      : [...prev, s]
  );
```

Render a checkbox at the start of each post and ad row. Replace the per-row "Select" button.

- [ ] **Step 3: Add a footer Confirm bar**

```tsx
<div className="sticky bottom-0 p-2 border-t bg-white flex justify-between">
  <span>{selected.length} selected</span>
  <div>
    <button onClick={onClose}>Cancel</button>
    <button
      disabled={selected.length === 0}
      onClick={() => { onConfirm(selected); onClose(); }}
    >Confirm ({selected.length})</button>
  </div>
</div>
```

- [ ] **Step 4: Update `planner-view.tsx` `handleAssignPost`**

Find the existing single-select handler (formerly `handleAssignPost`, was accepting one selection). Change it to iterate over the array:

```tsx
async function handleGatherConfirm(selections: GatherSelection[]) {
  for (const sel of selections) {
    await assignOne(sel, activeItemId);
  }
  // existing: refetch / close modal
}
```

Extract the old single-select body into `assignOne(sel, itemId)` first. Keep each assignment sequential (not `Promise.all`) to surface any single failure cleanly.

- [ ] **Step 5: Typecheck + lint + build**

```bash
bunx tsc --noEmit && bun run lint && bun run build
```

- [ ] **Step 6: Manual QA — multi-select flow**

```bash
$B goto http://localhost:3000/creatives/planner
$B click '<Gather Post>'
$B snapshot -i
$B click '<checkbox ref 1>'
$B click '<checkbox ref 2>'
$B snapshot -a -o /tmp/gather-multi.png
$B click '<Confirm ref>'
$B wait --load
$B snapshot -a -o /tmp/gather-after-confirm.png
```

Read both screenshots. Confirm both items linked to the content row.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/creatives/planner/
git commit -m "feat(creatives): multiselect in Gather picker"
```

---

### Task 10: Phase 2 regression sweep

- [ ] Repeat the Phase-1 six-page screenshot sweep (Task 6 Step 1).
- [ ] `$B console --errors` — zero expected.
- [ ] `npx gitnexus detect-changes --scope compare --base-ref main`.

---

## Phase 3 — Dashboard: Unassigned Posts Stat

### Task 11: Unassigned-posts count API

**Files:**
- Create: `src/app/api/creatives/unassigned-posts/route.ts`

- [ ] **Step 1: Confirm D3 (definition) with user before writing query.** If organic-only: query `smm_top_posts`. If organic+ads: union with `meta_ad_stats`.

- [ ] **Step 2: Write the GET handler**

Default query (organic + ads, per D3 default):

```ts
// src/app/api/creatives/unassigned-posts/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { data: organicUnassigned, error: e1 } = await supabase
    .rpc("count_unassigned_organic_posts"); // see Step 3
  const { data: adsUnassigned, error: e2 } = await supabase
    .rpc("count_unassigned_ads");

  if (e1 || e2) {
    return NextResponse.json({ error: (e1 ?? e2)?.message }, { status: 500 });
  }

  return NextResponse.json({
    organic: organicUnassigned ?? 0,
    ads: adsUnassigned ?? 0,
    total: (organicUnassigned ?? 0) + (adsUnassigned ?? 0),
  });
}
```

- [ ] **Step 3: Add the two Postgres functions via migration `00073_unassigned_post_counts.sql`**

```sql
-- supabase/migrations/00073_unassigned_post_counts.sql
create or replace function public.count_unassigned_organic_posts()
returns integer language sql stable as $$
  select count(*)::int
  from public.smm_top_posts p
  where not exists (
    select 1 from public.creative_content_items c
    where c.linked_post_id = p.id
  );
$$;

create or replace function public.count_unassigned_ads()
returns integer language sql stable as $$
  select count(*)::int
  from public.meta_ad_stats m
  where not exists (
    select 1 from public.creative_content_items c
    where c.linked_ad_asset_id = m.asset_id
  );
$$;

grant execute on function public.count_unassigned_organic_posts() to authenticated;
grant execute on function public.count_unassigned_ads() to authenticated;
```

Follow the existing migration convention (sequential numbering, no "DON'T PUSH" labels per user rule).

- [ ] **Step 4: Apply migration locally**

User will run their normal migration command (the user's rule: never run `supabase db push` on their behalf). Instead, print this instruction and pause:

> Please run your usual migration workflow to apply `00073_unassigned_post_counts.sql` in the target environment, then continue.

- [ ] **Step 5: Verify endpoint**

```bash
$B goto http://localhost:3000/api/creatives/unassigned-posts
$B text
# expect JSON: {"organic": N, "ads": M, "total": N+M}
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00073_unassigned_post_counts.sql src/app/api/creatives/unassigned-posts/
git commit -m "feat(creatives): unassigned-posts count endpoint + migration 00073"
```

---

### Task 12: Add "Unassigned Posts" KpiTile to dashboard

**Files:**
- Modify: `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` (lines ~289-305 grid)
- Modify: `src/app/(dashboard)/creatives/dashboard/page.tsx` if server-side fetch is preferred

- [ ] **Step 1: Choose fetch strategy**

Preferred: fetch in the server component `page.tsx` so the count renders on first paint. Alternative: client-fetch via `useEffect`. Default to server-side.

- [ ] **Step 2: Extend `page.tsx` fetch**

In `dashboard/page.tsx`, add a parallel RPC call:

```ts
const { data: unassignedOrganic } = await supabase.rpc("count_unassigned_organic_posts");
const { data: unassignedAds } = await supabase.rpc("count_unassigned_ads");
const unassignedTotal = (unassignedOrganic ?? 0) + (unassignedAds ?? 0);
// pass unassignedTotal to <DashboardView />
```

- [ ] **Step 3: Accept new prop in `DashboardView`**

```ts
type Props = { /* existing */; unassignedPosts: number; };
```

- [ ] **Step 4: Add the KpiTile with combined count + sub-label (D3 = b)**

At line ~289-305, add a fourth tile. Value is the combined total; the hint carries the organic/ads breakdown per D3.

```tsx
<KpiTile
  label="Unassigned Posts"
  value={unassignedTotal}
  hint={`${unassignedOrganic ?? 0} organic · ${unassignedAds ?? 0} ads`}
/>
```

If `KpiTile` doesn't render `hint` underneath the value already, inspect the component (lines 204–228) and adjust — no new component, just use its existing slot. No `href` (KpiTile may not accept it — do not expand scope).

- [ ] **Step 5: Typecheck + lint + build**

- [ ] **Step 6: Manual QA**

```bash
$B goto http://localhost:3000/creatives/dashboard
$B screenshot /tmp/dashboard-with-unassigned.png
```

Read screenshot. Fourth tile present with accurate count.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/creatives/dashboard/
git commit -m "feat(creatives): Unassigned Posts stat on dashboard"
```

---

## Phase 4 — New Tracker Page (Chronological Ledger)

Goal: greenfield page at `/creatives/tracker` — group view switch (Local / International / PCDLF), platform switch (F/I/T/Y/Meta Ads), monthly grouping, month switcher, mini calendar, combined planned+posted.

### Task 13: Re-add Tracker route to nav

**Files:**
- Modify: `src/lib/permissions/nav.ts:98-106`

- [ ] **Step 1: Add the Tracker item back**

After the Planner entry:

```ts
{ label: "Planner", href: "/creatives/planner" },
{ label: "Tracker", href: "/creatives/tracker" },
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/permissions/nav.ts
git commit -m "chore(nav): re-add Tracker to Creatives nav (new page incoming)"
```

---

### Task 14: Tracker feed API

**Files:**
- Create: `src/app/api/creatives/tracker-feed/route.ts`

The feed returns a unified timeline row type covering both planned items (from `creative_content_items`) and posted items (from `smm_top_posts` + `meta_ad_stats`).

- [ ] **Step 1: Define the unified row type**

```ts
// put the type in src/types/tracker-feed.ts so both API and view can import it
export type TrackerFeedRow = {
  id: string;
  kind: "planned" | "posted_organic" | "posted_ad";
  occurredAt: string; // ISO — scheduled_at for planned, published_at for posted
  platform: "facebook" | "instagram" | "tiktok" | "youtube" | "meta_ads" | null;
  group: "local" | "international" | "pcdlf" | null;
  title: string;
  thumbnailUrl: string | null;
  href: string | null; // link to original detail
};
```

- [ ] **Step 2: Write the GET handler**

```ts
// src/app/api/creatives/tracker-feed/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { TrackerFeedRow } from "@/types/tracker-feed";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM
  const group = searchParams.get("group"); // local|international|pcdlf
  const platform = searchParams.get("platform"); // fb|ig|tt|yt|meta_ads

  const supabase = await createClient();
  // parallel fetch
  const [planned, organic, ads] = await Promise.all([
    supabase.from("creative_content_items").select("id, title, scheduled_at, platform, group_name, thumbnail_url")
      .gte("scheduled_at", monthStart(month)).lt("scheduled_at", monthEnd(month)),
    supabase.from("smm_top_posts").select("id, caption, published_at, platform, group_name, thumbnail_url, permalink")
      .gte("published_at", monthStart(month)).lt("published_at", monthEnd(month)),
    supabase.from("meta_ad_stats").select("asset_id, ad_name, created_at, thumbnail_url")
      .gte("created_at", monthStart(month)).lt("created_at", monthEnd(month)),
  ]);

  // shape into TrackerFeedRow[] — see ledger-helpers.ts in Task 16
  const rows: TrackerFeedRow[] = [
    ...shapePlanned(planned.data ?? []),
    ...shapeOrganic(organic.data ?? []),
    ...shapeAds(ads.data ?? []),
  ];

  // apply group + platform filters in-memory after shaping
  const filtered = rows.filter(r => {
    if (group && r.group !== group) return false;
    if (platform && r.platform !== platform) return false;
    return true;
  });

  filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return NextResponse.json({ data: filtered });
}

function monthStart(m: string | null) { /* default to current month if null */ }
function monthEnd(m: string | null) { /* ... */ }
```

- [ ] **Step 3: Shape-check the actual column names**

Run gitnexus shape_check against each table referenced:

```bash
npx gitnexus shape-check --table creative_content_items
npx gitnexus shape-check --table smm_top_posts
npx gitnexus shape-check --table meta_ad_stats
```

Adjust column names if any differ from the plan above.

- [ ] **Step 4: Verify endpoint**

```bash
$B goto "http://localhost:3000/api/creatives/tracker-feed?month=2026-04"
$B text | head -50
```

- [ ] **Step 5: Commit**

```bash
git add src/types/tracker-feed.ts src/app/api/creatives/tracker-feed/
git commit -m "feat(creatives): tracker-feed API combines planned + posted content"
```

---

### Task 15: Tracker page server component

**Files:**
- Create: `src/app/(dashboard)/creatives/tracker/page.tsx`

- [ ] **Step 1: Identify the existing route-permission pattern used by sibling Creatives pages (per D5)**

Before writing the new page, Read `src/app/(dashboard)/creatives/planner/page.tsx` (the renamed Tracker from Task 3) and one other sibling like `posted-content/page.tsx`. Copy whatever auth / permission guard they already use. Do NOT invent a new inline check.

- [ ] **Step 2: Write the server component using the existing pattern**

```tsx
// src/app/(dashboard)/creatives/tracker/page.tsx
import { createClient } from "@/lib/supabase/server";
// ...other imports matching sibling page pattern
import { TrackerLedgerView } from "./tracker-view";

export const metadata = { title: "Creatives Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; group?: string; platform?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  // <copy the auth + permission guard block from a sibling Creatives page>

  return <TrackerLedgerView initialMonth={sp.month} initialGroup={sp.group} initialPlatform={sp.platform} />;
}
```

- [ ] **Step 2: Typecheck + lint + build**

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/creatives/tracker/page.tsx
git commit -m "feat(creatives): new Tracker page server component with creatives-team gate"
```

---

### Task 16: Shared ledger helpers

**Files:**
- Create: `src/app/(dashboard)/creatives/tracker/ledger-helpers.ts`

Move `resolveThumb` (posted-content-view.tsx:106) and `platformBadge` (posted-content-view.tsx:54) into a shared helper file, and add the three feed shapers (`shapePlanned`, `shapeOrganic`, `shapeAds`) used by the tracker-feed API route (Task 14) here too. Note: the shapers do NOT exist today — they are written fresh in this task.

- [ ] **Step 1: Copy `resolveThumb` + `platformBadge` from posted-content-view.tsx into the new file**

- [ ] **Step 2: Write `shapePlanned`, `shapeOrganic`, `shapeAds`**

Each takes raw DB rows and returns `TrackerFeedRow[]`. Example:

```ts
export function shapePlanned(rows: PlannedDbRow[]): TrackerFeedRow[] {
  return rows.map(r => ({
    id: r.id,
    kind: "planned",
    occurredAt: r.scheduled_at,
    platform: normalizePlatform(r.platform),
    group: normalizeGroup(r.group_name),
    title: r.title ?? "(untitled)",
    thumbnailUrl: resolveThumb(r.thumbnail_url),
    href: `/creatives/planner?id=${r.id}`,
  }));
}
// shapeOrganic + shapeAds follow the same pattern
```

- [ ] **Step 3: Update `posted-content-view.tsx` to import `resolveThumb` + `platformBadge` from ledger-helpers**

- [ ] **Step 4: Update tracker-feed route.ts to import from ledger-helpers**

- [ ] **Step 5: Build + QA posted-content didn't regress**

```bash
$B goto http://localhost:3000/creatives/posted-content
$B screenshot /tmp/posted-after-extract.png
```

- [ ] **Step 6: Commit**

```bash
git add -A src/app/\(dashboard\)/creatives/
git commit -m "refactor(creatives): extract ledger-helpers shared by Tracker + Posted Content"
```

---

### Task 17: Tracker client view — month grouping + switchers

**Files:**
- Create: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`

- [ ] **Step 1: Scaffold the client component**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type { TrackerFeedRow } from "@/types/tracker-feed";

type Group = "local" | "international" | "pcdlf";
type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "meta_ads";

export function TrackerLedgerView({
  initialMonth, initialGroup, initialPlatform
}: { initialMonth?: string; initialGroup?: string; initialPlatform?: string }) {
  const [month, setMonth] = useState(initialMonth ?? currentMonth());
  const [group, setGroup] = useState<Group | "all">((initialGroup as Group) ?? "all");
  const [platform, setPlatform] = useState<Platform | "all">((initialPlatform as Platform) ?? "all");
  const [rows, setRows] = useState<TrackerFeedRow[]>([]);

  useEffect(() => {
    const qs = new URLSearchParams({ month });
    if (group !== "all") qs.set("group", group);
    if (platform !== "all") qs.set("platform", platform);
    fetch(`/api/creatives/tracker-feed?${qs}`)
      .then(r => r.json())
      .then(j => setRows(j.data ?? []));
  }, [month, group, platform]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Creatives Tracker</h1>
      <GroupSwitcher value={group} onChange={setGroup} />
      <PlatformSwitcher value={platform} onChange={setPlatform} />
      <MonthSwitcher month={month} onChange={setMonth} />
      <MiniCalendar month={month} rows={rows} onPickMonth={setMonth} />
      <MonthList rows={rows} />
    </div>
  );
}
```

- [ ] **Step 2: Implement the four small subcomponents in the same file**

- `GroupSwitcher`: 4 buttons (All, Local, International, PCDLF).
- `PlatformSwitcher`: 6 buttons (All, FB, IG, TT, YT, Meta Ads).
- `MonthSwitcher`: prev / label / next buttons.
- `MiniCalendar`: month grid with dot density per day based on `rows` count (keep it dead simple — one dot per row on that day).
- `MonthList`: group rows by `YYYY-MM` header (since feed is already month-scoped, render as a single month block with day subheaders).

- [ ] **Step 3: Typecheck + lint + build**

- [ ] **Step 4: Manual QA**

```bash
$B goto http://localhost:3000/creatives/tracker
$B wait --load
$B screenshot /tmp/new-tracker-default.png
$B click '<Local group ref>'
$B screenshot /tmp/new-tracker-local.png
$B click '<facebook platform ref>'
$B screenshot /tmp/new-tracker-fb.png
$B click '<next month ref>'
$B screenshot /tmp/new-tracker-next-month.png
```

Read all screenshots. Verify filters change the list.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/creatives/tracker/tracker-view.tsx
git commit -m "feat(creatives): new Tracker page with group/platform/month switchers + mini calendar"
```

---

### Task 18: Phase 4 regression sweep

- [ ] Six-page screenshot sweep.
- [ ] `$B console --errors` on the new Tracker.
- [ ] `npx gitnexus detect-changes --scope compare --base-ref main` — confirm scope.

---

## Phase 5 — Role Clarification: Analytics vs Performance

**IMPORTANT context (discovered 2026-04-21):** `performance/page.tsx` currently `import { AnalyticsView } from "../analytics/analytics-view"` and renders it. Performance and Analytics literally display the same component today. Phase 5 decouples them AND migrates the "Ads Spending Today" widget from the deleted Live tab (Task 5) into Performance as its first native piece (per D4 = c).

### Task 19: Analytics — content-level framing + no Performance import

**Files:**
- Modify: `src/app/(dashboard)/creatives/analytics/analytics-view.tsx` (page header + body copy)
- Modify: `src/app/(dashboard)/creatives/analytics/analytics-tabs-view.tsx` if a subheader exists

- [ ] **Step 1: Read current headings + intro copy**

Use Read on `analytics-view.tsx` and skim `analytics-tabs-view.tsx` for any header text.

- [ ] **Step 2: Rewrite for content-level framing**
  - Page title: `Creatives Analytics` → `Content Analytics`
  - Intro sentence: emphasize per-post/per-ad content metrics (reach, engagement, individual content performance)
  - Strip any copy about "platform trends," "group rollup," "daily platform metrics" — that moves to Performance
- [ ] **Step 3: Typecheck + lint + build**
- [ ] **Step 4: Manual QA**

```bash
$B goto http://localhost:3000/creatives/analytics
$B screenshot /tmp/analytics-content-framing.png
```

Read screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/creatives/analytics/
git commit -m "refactor(creatives): Analytics reframed as content-level view"
```

---

### Task 20: Decouple Performance from AnalyticsView + migrate Ads Spending Today widget

**Files:**
- Modify: `src/app/(dashboard)/creatives/performance/page.tsx` (stop importing `AnalyticsView`, render native layout)
- Create: `src/app/(dashboard)/creatives/performance/performance-view.tsx` (new client component for the page body)
- Create: `src/app/(dashboard)/creatives/performance/ads-spending-today.tsx` (extracted/rewritten from the deleted `LivePanel` column 3)

**Note:** Task 5 already deleted `LivePanel`. Before Task 20 starts, executor should `git log` for the commit that removed it and re-reference the deleted code to port the ads column's logic here. If Phase 5 is run in a single session with Phase 1 context, the ported code is already in the diff.

- [ ] **Step 1: Identify the ad spending data source**

In the deleted `LivePanel` signature: `ads: LiveAd[]` — those ads came from `performance/page.tsx`'s existing Supabase fetch OR from `analytics/page.tsx`. Trace back from `git show` on the Task 5 commit to find the fetch site and which table (`meta_ad_stats`? `ad_assets`?). Lock the source before writing the widget.

- [ ] **Step 2: Create `ads-spending-today.tsx` (client or server component as data source dictates)**

```tsx
// src/app/(dashboard)/creatives/performance/ads-spending-today.tsx
type Ad = { ad_id: string; ad_name: string | null; spend_today: number | null; platform: string };
export function AdsSpendingToday({ ads }: { ads: Ad[] }) {
  if (ads.length === 0) {
    return <EmptyCell text="No ads with spend today yet." />;
  }
  return (
    <section>
      <header className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold">Ads spending · today</h2>
        <span className="text-xs text-[var(--color-text-tertiary)]">{ads.length} active</span>
      </header>
      <ul className="divide-y divide-[var(--color-border-primary)]">
        {ads.map(a => <LiveAdRow key={a.ad_id} ad={a} />)}
      </ul>
    </section>
  );
}
```

Port `LiveAdRow` + `EmptyCell` from the pre-deletion `analytics-tabs-view.tsx` (use `git show` on the Task 5 commit to pull the exact markup).

- [ ] **Step 3: Rewrite `performance/page.tsx` to stop importing `AnalyticsView`**

```tsx
// src/app/(dashboard)/creatives/performance/page.tsx
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth"; // existing helper per current imports
import { AdsSpendingToday } from "./ads-spending-today";

export default async function CreativesPerformancePage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  // fetch today's ad spend — exact query TBD by Step 1 finding
  const { data: ads } = await supabase
    .from("meta_ad_stats")
    .select("ad_id, ad_name, spend_today, platform")
    .gte("date", new Date().toISOString().slice(0, 10))
    .gt("spend_today", 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Platform Performance</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
          Platform-level trends across Local, International, and PCDLF — daily metrics and today&apos;s active ad spend.
        </p>
      </div>
      <AdsSpendingToday ads={ads ?? []} />
      {/* Platform daily metrics section (keep existing from previous page layout if any) */}
    </div>
  );
}
```

If the deleted page content had more than just the `AnalyticsView` reference (e.g., daily metrics fetch), port those parts over too. Delete the `AnalyticsView` import.

- [ ] **Step 4: Typecheck + lint + build**

- [ ] **Step 5: Manual QA**

```bash
$B goto http://localhost:3000/creatives/performance
$B wait --load
$B screenshot /tmp/performance-decoupled.png
$B goto http://localhost:3000/creatives/analytics
$B screenshot /tmp/analytics-still-works.png
```

Read both. Performance shows Ads Spending Today; Analytics still works independently.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/creatives/performance/
git commit -m "feat(creatives): decouple Performance from AnalyticsView; Ads Spending Today widget lands here"
```

---

## Phase 6 — Settings Secrets: Hide / Reveal (reusing existing canManage)

Per D2: no new `is_super_ops` role. The existing `canManage` boolean passed into `SettingsView` is the authoritative mutation gate. Task 21 (role migration) is DROPPED. Task 22 performs hide/reveal + server-side secret scrubbing using `canManage` only.

### Task 21: ~~DROPPED per D2~~ — no migration needed.

---

### Task 22: Settings — hide/reveal + canManage-gated secret exposure

**Files:**
- Modify: `src/app/(dashboard)/creatives/settings/settings-view.tsx`
- Modify: `src/app/(dashboard)/creatives/settings/page.tsx` (verify it already fetches secrets only when `canManage`)

- [ ] **Step 1: Audit `settings/page.tsx` — never fetch raw secret values for non-canManage users**

Read the current server component. If it currently SELECTs token/key/env columns for all users, restrict: conditionally `.select("id, has_value, last4, ...non-secret")` when `!canManage`, and the full select only when `canManage === true`. This is the single most important defense — client-side hide is cosmetic; server-side scoping is real.

- [ ] **Step 2: Add hide/reveal state in `settings-view.tsx`**

```tsx
const [revealed, setRevealed] = useState<Set<string>>(new Set());
const isRevealed = (key: string) => revealed.has(key);
const toggleReveal = (key: string) =>
  setRevealed(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
```

- [ ] **Step 3: Wrap each secret field**

For every token/key/env input (lines ~192-193, 207-209, and any others):

```tsx
<div className="flex gap-2 items-center">
  <input
    type={isRevealed(row.id) ? "text" : "password"}
    value={canManage ? row.value ?? "" : ""}
    readOnly={!canManage}
    placeholder={row.hasValue ? "●●●● set" : "—"}
  />
  <button type="button" onClick={() => toggleReveal(row.id)}>
    {isRevealed(row.id) ? "Hide" : "Reveal"}
  </button>
</div>
```

Non-canManage users can still click Reveal; they just see an empty string because the server never sent the value. This is correct: cosmetic hide for canManage users, real data scoping for others.

- [ ] **Step 4: Block mutation for non-canManage**

In every mutation handler (form submit, save button, etc.):

```tsx
if (!canManage) return; // client gate; server must also re-check
```

Update the corresponding API route(s) to re-check `canManage` / the underlying role on the server before writing. Find the routes via `grep "settings" src/app/api/`.

- [ ] **Step 5: Typecheck + lint + build**

- [ ] **Step 6: Manual QA**

```bash
$B goto http://localhost:3000/creatives/settings
$B snapshot -i
$B screenshot /tmp/settings-default-hidden.png
# verify values are dots by default
$B click '<Reveal ref>'
$B screenshot /tmp/settings-revealed.png
```

Read both. Default state hidden; reveal shows value for canManage user.

Simulate non-canManage if feasible (dev helper / different login). Confirm:
- Fields render but are read-only
- Reveal shows empty string (server never shipped the value)
- Save button disabled / API returns 403

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/creatives/settings/
git commit -m "feat(creatives/settings): hide/reveal secrets + server-side scrub for non-canManage"
```

---

## Final Sweep

### Task 23: Full Creatives regression + commit cleanup

- [ ] **Step 1: Six-page smoke test** (Phase 1 Task 6 Step 1).
- [ ] **Step 2: `$B console --errors`** on each page.
- [ ] **Step 3: `bun run build`** — full production build must succeed.
- [ ] **Step 4: `npx gitnexus detect-changes --scope compare --base-ref main`** — review the full branch diff against the plan's File Structure table. No unexpected files.
- [ ] **Step 5: Reindex gitnexus**

```bash
npx gitnexus analyze
```

- [ ] **Step 6: Ready for ship** — invoke `/gstack-ship` (user's preferred flow per memory).

---

## Acceptance Criteria Cross-Check

| Spec requirement | Covered by task |
|---|---|
| Dashboard: Unassigned Posts stat | Task 11 + 12 |
| Rename Tracker → Planner (label + route + title) | Task 3 + 4 |
| Remove "Mine only" toggle | Task 2 |
| Gather modal: ad thumbnail + campaign + ad set hierarchy | Task 7 |
| Gather modal: multiselect | Task 9 |
| Gather modal: organic platform filter | Task 8 |
| Remove Live Analytics tab | Task 5 |
| New Tracker page exists | Task 15 + 17 |
| Tracker: Local / International / PCDLF | Task 17 (GroupSwitcher) |
| Tracker: FB / IG / TT / YT / Meta Ads | Task 17 (PlatformSwitcher) |
| Tracker: monthly grouping | Task 17 (MonthList) |
| Tracker: month switcher | Task 17 (MonthSwitcher) |
| Tracker: mini calendar | Task 17 (MiniCalendar) |
| Tracker: creatives-team-only | Task 15 (reuse existing route-permission pattern per D5) |
| Tracker: planned + posted combined | Task 14 (tracker-feed API) |
| Analytics vs Performance wording distinct + decoupled | Task 19 + 20 |
| Performance hosts Ads Spending Today (per D4) | Task 20 |
| Settings: sensitive values hidden by default | Task 22 |
| Settings: reveal behavior | Task 22 |
| Settings: only canManage can modify (per D2: reuse existing) | Task 22 |

---

## Implementation Notes

- **Frequent commits:** every task ends with a commit. Do not batch.
- **Phase independence:** Phases 1, 3, 5, 6 each ship on their own if needed. Phase 2 depends on Phase 1 Task 1 (extract). Phase 4 depends on Phase 1 Task 3 (rename) and Phase 4 Task 16 (ledger-helpers extract from posted-content).
- **No TDD:** project has no test framework. Each task verifies via typecheck + lint + build + manual browse QA. Do not introduce a test framework as scope creep.
- **Migrations:** user prefers running migrations themselves. Never run `supabase db push`. Print the migration filename and pause when a migration is ready.
- **Terminology discipline:** Planner = workflow stages. Tracker = chronological ledger. Do not let them drift back together. Analytics = per-content. Performance = per-platform/group.
- **Permissions:** do not regress existing checks. Phase 6 Task 22 tightens a path — verify both happy and denied paths.
