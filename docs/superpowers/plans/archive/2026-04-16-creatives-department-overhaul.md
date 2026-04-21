# Creatives Department Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the Creatives module — hardcode groups (Local, International, PCDLF), merge the Content page into the Tracker, upgrade the Dashboard with richer stats, and improve volume controls.

**Architecture:** The Tracker becomes the single content management page, absorbing the Content page's group-based filtering, published-content analytics, and platform sync. The Dashboard gets new stat cards (content by status breakdown, approved ads, items per group) and a streamlined volume-setting UX. Groups move from database-managed (`smm_groups`) to a hardcoded constant used across all components, with the `creative_content_items` table gaining a `group_label` text column for filtering.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Recharts, Tailwind CSS with CSS variable theming, Zod validation

---

## File Structure

### New files
- `src/lib/creatives/constants.ts` — Hardcoded groups, shared constants
- `supabase/migrations/00052_content_items_group_label.sql` — Add `group_label` column to `creative_content_items`

### Modified files
- `src/app/(dashboard)/creatives/tracker/page.tsx` — Expand SSR queries (add smm_posts analytics, group counts, campaign data)
- `src/app/(dashboard)/creatives/tracker/tracker-view.tsx` — Add group tabs, group filter on items, published analytics grid, platform sync, volume panel
- `src/app/(dashboard)/creatives/dashboard/page.tsx` — Replace smm_groups query with constants, add per-group counts, content-by-status counts
- `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` — New stat cards (per-group progress, status breakdown, approved ads), improved volume UX
- `src/app/api/creatives/content-items/route.ts` — Accept `group_label` on POST/PATCH, return it on GET
- `src/lib/permissions/nav.ts` — Remove "Content" nav item from Creatives group

### Files to keep but deprecate (not delete)
- `src/app/(dashboard)/creatives/content/page.tsx` — Redirect to `/creatives/tracker`
- `src/app/(dashboard)/creatives/content/content-view.tsx` — No longer imported
- `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` — No longer imported

---

## Task 1: Create Hardcoded Groups Constant

**Files:**
- Create: `src/lib/creatives/constants.ts`

This is the central source of truth for creative groups. All components import from here instead of querying `smm_groups`.

- [ ] **Step 1: Create the constants file**

```typescript
// src/lib/creatives/constants.ts

export const CREATIVE_GROUPS = [
  { slug: "local", label: "Local" },
  { slug: "international", label: "International" },
  { slug: "pcdlf", label: "PCDLF" },
] as const;

export type CreativeGroupSlug = (typeof CREATIVE_GROUPS)[number]["slug"];

export const GROUP_LABELS = CREATIVE_GROUPS.map((g) => g.label);
export const GROUP_SLUGS = CREATIVE_GROUPS.map((g) => g.slug);

/**
 * Default weekly targets per group.
 * Used as fallback when no creatives_campaign is set for the week.
 */
export const DEFAULT_TARGETS: Record<CreativeGroupSlug, { organic: number; ads: number }> = {
  local: { organic: 10, ads: 5 },
  international: { organic: 10, ads: 3 },
  pcdlf: { organic: 5, ads: 2 },
};
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/creatives/constants.ts 2>&1 | head -20`
Expected: No errors (or run full build check in step 3)

- [ ] **Step 3: Commit**

```bash
git add src/lib/creatives/constants.ts
git commit -m "feat(creatives): add hardcoded group constants (Local, International, PCDLF)"
```

---

## Task 2: Add `group_label` Column to `creative_content_items`

**Files:**
- Create: `supabase/migrations/00052_content_items_group_label.sql`
- Modify: `src/app/api/creatives/content-items/route.ts`

Every content item gets tagged to a group so the Tracker can filter by group tabs.

- [ ] **Step 1: Create the migration**

```sql
-- ============================================================
-- 00052_content_items_group_label.sql
-- Add group_label to creative_content_items so items can be
-- filtered by creative group (Local, International, PCDLF).
-- Text column (not enum) to match the hardcoded constants
-- without needing a migration for every group change.
-- ============================================================

ALTER TABLE public.creative_content_items
  ADD COLUMN group_label text DEFAULT 'local';

-- Index for group filtering
CREATE INDEX idx_cci_group_label ON public.creative_content_items (group_label)
  WHERE group_label IS NOT NULL;

-- Backfill: set all existing items to 'local' (they were pre-groups)
UPDATE public.creative_content_items SET group_label = 'local' WHERE group_label IS NULL;
```

- [ ] **Step 2: Update the content-items API to accept `group_label`**

In `src/app/api/creatives/content-items/route.ts`, add `group_label` to the POST insert and to PATCH updates.

In the POST handler (around line 44), add to the insert object:
```typescript
group_label: body.group_label ?? "local",
```

The PATCH handler already accepts arbitrary `updates` from the body (line 112: `const { id, ...updates } = body;`), so `group_label` will be passed through automatically. No change needed there.

The GET handler already uses `SELECT *` via the join query, so `group_label` will be returned automatically. No change needed there.

- [ ] **Step 3: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00052_content_items_group_label.sql src/app/api/creatives/content-items/route.ts
git commit -m "feat(creatives): add group_label column to creative_content_items"
```

---

## Task 3: Upgrade TrackerView — Group Tabs + Group Filter

**Files:**
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`
- Modify: `src/app/(dashboard)/creatives/tracker/page.tsx`

Add group tab filtering to the Tracker. Each tab (All, Local, International, PCDLF) filters items by `group_label`.

- [ ] **Step 1: Update the ContentItem type**

In `tracker-view.tsx`, add `group_label` to the `ContentItem` type (around line 15):

```typescript
type ContentItem = {
  id: string;
  title: string;
  content_type: string;
  channel_type: string;
  funnel_stage: string | null;
  creative_angle: string | null;
  product_or_collection: string | null;
  campaign_label: string | null;
  promo_code: string | null;
  transfer_link: string | null;
  planned_week_start: string | null;
  date_submitted: string | null;
  status: string;
  assigned_to: string | null;
  group_label: string | null;          // <-- NEW
  linked_card_id: string | null;
  linked_post_id: string | null;
  linked_ad_asset_id: string | null;
  linked_external_url: string | null;
  linked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned_profile: { id: string; first_name: string; last_name: string } | null;
  creator_profile: { id: string; first_name: string; last_name: string } | null;
};
```

- [ ] **Step 2: Import CREATIVE_GROUPS and add group filter state**

At the top of `tracker-view.tsx`, add the import:
```typescript
import { CREATIVE_GROUPS } from "@/lib/creatives/constants";
```

Inside the `TrackerView` component, add state (after line 136, the `statusFilter` state):
```typescript
const [groupFilter, setGroupFilter] = useState<string>("all");
```

- [ ] **Step 3: Update the filter memos to include group filtering**

Update the `planned` memo (around line 143) to also filter by group:
```typescript
const planned = useMemo(
  () =>
    items
      .filter((i) => PLANNED_STATUSES.includes(i.status))
      .filter((i) => groupFilter === "all" || i.group_label === groupFilter)
      .filter(
        (i) =>
          !search ||
          i.title.toLowerCase().includes(search.toLowerCase()) ||
          (i.campaign_label ?? "").toLowerCase().includes(search.toLowerCase())
      )
      .filter((i) => !statusFilter || i.status === statusFilter),
  [items, search, statusFilter, groupFilter]
);
```

Update the `published` memo (around line 157) similarly:
```typescript
const published = useMemo(
  () =>
    items
      .filter((i) => PUBLISHED_STATUSES.includes(i.status))
      .filter((i) => groupFilter === "all" || i.group_label === groupFilter)
      .filter(
        (i) =>
          !search ||
          i.title.toLowerCase().includes(search.toLowerCase()) ||
          (i.campaign_label ?? "").toLowerCase().includes(search.toLowerCase())
      ),
  [items, search, groupFilter]
);
```

- [ ] **Step 4: Add group tabs to the UI**

In the render section, add a group tab row between the existing Planned/Published tabs and the filter bar. After the closing `</div>` of the Planned/Published tabs (around line 270), add:

```tsx
{/* Group tabs */}
<div className="flex items-center gap-2 flex-wrap">
  <TabPill
    label="All Groups"
    active={groupFilter === "all"}
    onClick={() => setGroupFilter("all")}
  />
  {CREATIVE_GROUPS.map((g) => (
    <TabPill
      key={g.slug}
      label={g.label}
      active={groupFilter === g.slug}
      onClick={() => setGroupFilter(g.slug)}
    />
  ))}
</div>
```

- [ ] **Step 5: Add group_label to the ItemModal**

In the `ItemModal` component (around line 530), add group state and a group select field.

Add state (after `const [status, setStatus] = useState(...)` around line 555):
```typescript
const [groupLabel, setGroupLabel] = useState(initial?.group_label ?? "local");
```

Add to the submit data object (inside the `submit` function, around line 562):
```typescript
group_label: groupLabel,
```

Add a select field in the form grid (after the Status field, around line 653):
```tsx
<Field label="Group">
  <select
    value={groupLabel}
    onChange={(e) => setGroupLabel(e.target.value)}
    className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
  >
    {CREATIVE_GROUPS.map((g) => (
      <option key={g.slug} value={g.slug}>
        {g.label}
      </option>
    ))}
  </select>
</Field>
```

- [ ] **Step 6: Add Group column to the desktop table**

In the table header row (around line 308), add after the Title `<th>`:
```tsx
<th className="px-4 py-3">Group</th>
```

In the table body row (around line 331), add after the Title `<td>`:
```tsx
<td className="px-4 py-3 text-[var(--color-text-secondary)]">
  {item.group_label ? CREATIVE_GROUPS.find((g) => g.slug === item.group_label)?.label ?? item.group_label : "-"}
</td>
```

In the mobile card (around line 407), add group to the metadata row:
```tsx
{item.group_label && (
  <span className="text-indigo-600 font-medium">
    {CREATIVE_GROUPS.find((g) => g.slug === item.group_label)?.label ?? item.group_label}
  </span>
)}
```

- [ ] **Step 7: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/app/(dashboard)/creatives/tracker/tracker-view.tsx
git commit -m "feat(creatives): add group tabs (Local/International/PCDLF) to Tracker"
```

---

## Task 4: Upgrade Dashboard — Richer Stats + Improved Volume Controls

**Files:**
- Modify: `src/app/(dashboard)/creatives/dashboard/page.tsx`
- Modify: `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx`

Replace the smm_groups query with constants. Add per-group content counts, status breakdown pie, approved ads stat card, and an improved campaign/volume editing UX.

- [ ] **Step 1: Update dashboard page.tsx — Replace smm_groups with constants and add new queries**

Replace the entire file content. Key changes:
1. Remove `smm_groups` query (no longer needed — groups are hardcoded)
2. Add query for `creative_content_items` grouped counts (per-group, per-status)
3. Keep existing queries (weekPosts, campaign, members, kanban cards, ad requests)
4. Add content items count by status for the status breakdown
5. Pass `adsApprovedCount` through to the view (it was fetched but not rendered — fix the dead prop)

Replace the data fetching section (lines 38–102) with:

```typescript
const [
  { data: weekPosts },
  { data: campaign },
  { data: members },
  { count: pendingTasksCount },
  { count: adsApprovedCount },
  { count: requestsInReview },
  { data: contentItems },
] = await Promise.all([
  // 1. This week's smm_posts
  supabase
    .from("smm_posts")
    .select("id, post_type, status, scheduled_at, published_at")
    .gte("scheduled_at", mondayISO)
    .lte("scheduled_at", sundayISO),

  // 2. This week's creatives campaign
  supabase
    .from("creatives_campaigns")
    .select("id, campaign_name, organic_target, ads_target, notes, week_start")
    .eq("week_start", mondayISO)
    .maybeSingle(),

  // 3. Dept members
  deptId
    ? supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("department_id", deptId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("first_name")
    : supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("first_name"),

  // 4. Pending kanban cards
  supabase
    .from("kanban_cards")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", currentUser.id),

  // 5. Approved ad requests this week
  supabase
    .from("ad_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .gte("updated_at", monday.toISOString()),

  // 6. Requests in review
  supabase
    .from("ad_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "review"),

  // 7. All content items this week (for per-group and per-status breakdown)
  supabase
    .from("creative_content_items")
    .select("id, status, group_label")
    .gte("planned_week_start", mondayISO)
    .lte("planned_week_start", sundayISO),
]);
```

Replace the targets computation (lines 109–113) with:
```typescript
// Use campaign targets or defaults
const weeklyOrganicTarget = campaign?.organic_target ?? 25;
const weeklyAdsTarget = campaign?.ads_target ?? 10;
```

Add per-group and per-status counts after the targets:
```typescript
// Per-group item counts
const allItems = contentItems ?? [];
const groupCounts = {
  local: allItems.filter((i) => i.group_label === "local").length,
  international: allItems.filter((i) => i.group_label === "international").length,
  pcdlf: allItems.filter((i) => i.group_label === "pcdlf").length,
};

// Per-status counts (all items, not just this week)
const statusCounts = {
  idea: allItems.filter((i) => i.status === "idea").length,
  in_production: allItems.filter((i) => i.status === "in_production").length,
  submitted: allItems.filter((i) => i.status === "submitted").length,
  approved: allItems.filter((i) => i.status === "approved").length,
  scheduled: allItems.filter((i) => i.status === "scheduled").length,
  published: allItems.filter((i) => i.status === "published").length,
};
```

Update the return JSX to pass the new props:
```tsx
<CreativesDashboard
  currentUserId={currentUser.id}
  canManage={isManagerOrAbove(currentUser)}
  members={(members ?? []) as { id: string; first_name: string; last_name: string }[]}
  campaign={campaign ?? null}
  organicCount={organicCount}
  adsCount={adsCount}
  weeklyOrganicTarget={weeklyOrganicTarget}
  weeklyAdsTarget={weeklyAdsTarget}
  pendingTasksCount={pendingTasksCount ?? 0}
  requestsInReview={requestsInReview ?? 0}
  weekStart={mondayISO}
  weeklyPostsByDay={weeklyPostsByDay}
  adsApprovedCount={adsApprovedCount ?? 0}
  groupCounts={groupCounts}
  statusCounts={statusCounts}
/>
```

- [ ] **Step 2: Update dashboard-view.tsx Props type**

Add the new props (around line 28):
```typescript
type Props = {
  currentUserId: string;
  canManage: boolean;
  members: Member[];
  campaign: Campaign | null;
  organicCount: number;
  adsCount: number;
  weeklyOrganicTarget: number;
  weeklyAdsTarget: number;
  pendingTasksCount: number;
  requestsInReview: number;
  adsApprovedCount: number;
  weekStart: string;
  weeklyPostsByDay: DayData[];
  groupCounts: Record<string, number>;
  statusCounts: Record<string, number>;
};
```

Import CREATIVE_GROUPS at the top:
```typescript
import { CREATIVE_GROUPS } from "@/lib/creatives/constants";
```

- [ ] **Step 3: Destructure new props in CreativesDashboard**

Update the component destructuring (around line 233) to include:
```typescript
export function CreativesDashboard({
  canManage,
  members,
  campaign: initialCampaign,
  organicCount,
  adsCount,
  weeklyOrganicTarget,
  weeklyAdsTarget,
  pendingTasksCount,
  requestsInReview,
  weekStart,
  weeklyPostsByDay,
  adsApprovedCount,
  groupCounts,
  statusCounts,
}: Props) {
```

- [ ] **Step 4: Add "Ads Approved" to the stats row**

The `adsApprovedCount` prop was already fetched but never rendered. Change the stats grid from `sm:grid-cols-3` to `sm:grid-cols-4` (around line 405) and add after the "Requests In Review" card:

```tsx
{/* Ads Approved */}
<div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
  <div className="flex items-center gap-2 mb-2">
    <svg className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
      Ads Approved
    </p>
  </div>
  <p className="text-3xl font-bold text-[var(--color-text-primary)]">{adsApprovedCount}</p>
  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">this week</p>
</div>
```

- [ ] **Step 5: Add per-group progress section**

After the stats row, before the team member list, add a "Content by Group" card:

```tsx
{/* Content by Group */}
<div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-6">
  <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-4">
    Content by Group — This Week
  </p>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    {CREATIVE_GROUPS.map((g) => {
      const count = groupCounts[g.slug] ?? 0;
      return (
        <div key={g.slug} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{g.label}</span>
            <span className="text-sm font-bold text-[var(--color-text-primary)]">{count}</span>
          </div>
          <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${Math.min((count / Math.max(weeklyOrganicTarget / 3, 1)) * 100, 100)}%` }}
            />
          </div>
        </div>
      );
    })}
  </div>
</div>
```

- [ ] **Step 6: Add status breakdown section**

After the "Content by Group" card, add a "Pipeline Status" card:

```tsx
{/* Pipeline Status */}
<div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-6">
  <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-4">
    Pipeline Status — This Week
  </p>
  <div className="flex flex-wrap gap-3">
    {[
      { key: "idea", label: "Ideas", color: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]" },
      { key: "in_production", label: "In Production", color: "bg-[var(--color-accent-light)] text-[var(--color-accent)]" },
      { key: "submitted", label: "Submitted", color: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]" },
      { key: "approved", label: "Approved", color: "bg-[var(--color-success-light)] text-[var(--color-success)]" },
      { key: "scheduled", label: "Scheduled", color: "bg-purple-100 text-purple-700" },
      { key: "published", label: "Published", color: "bg-emerald-100 text-emerald-700" },
    ].map((s) => (
      <div key={s.key} className={`rounded-xl px-4 py-3 text-center min-w-[100px] ${s.color}`}>
        <p className="text-2xl font-bold">{statusCounts[s.key] ?? 0}</p>
        <p className="text-xs font-medium mt-0.5">{s.label}</p>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 7: Improve the Campaign Setup / Volume UX**

Replace the hardcoded "Andromeda Creatives" title (line 266) with a dynamic label:
```tsx
<span className="text-base font-semibold text-[var(--color-text-primary)]">
  {campaign?.campaign_name ?? "Creatives"}
</span>
```

When a campaign exists, add an "Edit targets" button that allows inline editing of organic_target and ads_target. Add this after the campaign name badge (around line 272):

```tsx
{campaign && canManage && (
  <button
    onClick={() => setEditing(true)}
    className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
  >
    Edit targets
  </button>
)}
```

Add editing state at the top of CreativesDashboard:
```typescript
const [editing, setEditing] = useState(false);
const [editOrganic, setEditOrganic] = useState(weeklyOrganicTarget);
const [editAds, setEditAds] = useState(weeklyAdsTarget);
const [editSaving, setEditSaving] = useState(false);
```

Add an inline edit form that replaces the progress bars when `editing` is true. Insert before the progress grid (around line 278):

```tsx
{editing ? (
  <div className="space-y-4 mb-6">
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="text-xs text-[var(--color-text-secondary)] font-medium">Organic target</label>
        <input
          type="number"
          min={1}
          max={200}
          value={editOrganic}
          onChange={(e) => setEditOrganic(Number(e.target.value))}
          className="mt-1 w-full border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>
      <div>
        <label className="text-xs text-[var(--color-text-secondary)] font-medium">Ads target</label>
        <input
          type="number"
          min={1}
          max={100}
          value={editAds}
          onChange={(e) => setEditAds(Number(e.target.value))}
          className="mt-1 w-full border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>
    </div>
    <div className="flex gap-2">
      <button
        onClick={async () => {
          setEditSaving(true);
          await fetch("/api/creatives/campaigns", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: campaign!.id,
              organic_target: editOrganic,
              ads_target: editAds,
            }),
          });
          setCampaign({ ...campaign!, organic_target: editOrganic, ads_target: editAds });
          setEditing(false);
          setEditSaving(false);
        }}
        disabled={editSaving}
        className="text-sm px-4 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
      >
        {editSaving ? "Saving..." : "Save"}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-sm px-3 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        Cancel
      </button>
    </div>
  </div>
) : (
  // existing progress grid goes here
  <>
    {/* ... existing progress bars ... */}
  </>
)}
```

- [ ] **Step 8: Verify build passes**

Run: `npm run build 2>&1 | tail -30`
Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add src/app/(dashboard)/creatives/dashboard/page.tsx src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx
git commit -m "feat(creatives): upgrade dashboard — per-group counts, status breakdown, ads approved, inline target editing"
```

---

## Task 5: Remove Content from Nav + Add Redirect

**Files:**
- Modify: `src/lib/permissions/nav.ts`
- Modify: `src/app/(dashboard)/creatives/content/page.tsx`

Remove the Content nav item and redirect the old URL to Tracker.

- [ ] **Step 1: Remove Content from nav.ts**

In `src/lib/permissions/nav.ts`, in the Creatives group (around line 96–106), remove the Content item:

Change from:
```typescript
items: [
  { name: "Dashboard",  slug: "creatives-dashboard", route: "/creatives/dashboard" },
  { name: "Content",    slug: "creatives-content",   route: "/creatives/content" },
  { name: "Analytics",  slug: "creatives-analytics", route: "/creatives/analytics" },
  { name: "Requests",   slug: "creatives-requests",  route: "/creatives/requests" },
  { name: "Tracker",    slug: "creatives-tracker",   route: "/creatives/tracker" },
],
```

To:
```typescript
items: [
  { name: "Dashboard",  slug: "creatives-dashboard", route: "/creatives/dashboard" },
  { name: "Tracker",    slug: "creatives-tracker",   route: "/creatives/tracker" },
  { name: "Analytics",  slug: "creatives-analytics", route: "/creatives/analytics" },
  { name: "Requests",   slug: "creatives-requests",  route: "/creatives/requests" },
],
```

Note: Tracker is promoted to second position (after Dashboard), since it's now the primary content management page.

- [ ] **Step 2: Redirect /creatives/content to /creatives/tracker**

Replace the entire `src/app/(dashboard)/creatives/content/page.tsx` with a redirect:

```typescript
import { redirect } from "next/navigation";

export default function CreativesContentPage() {
  redirect("/creatives/tracker");
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/lib/permissions/nav.ts src/app/(dashboard)/creatives/content/page.tsx
git commit -m "feat(creatives): remove Content nav item, redirect to Tracker"
```

---

## Task 6: Absorb Content Page Features into Tracker — Published Analytics + Platform Sync

**Files:**
- Modify: `src/app/(dashboard)/creatives/tracker/page.tsx`
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`

Add the Content page's best features to the Tracker: a "Live" tab showing published posts with platform analytics (impressions, engagements, video plays), and a Sync button to pull latest data from connected platforms.

- [ ] **Step 1: Update tracker page.tsx to fetch platform data**

Add smm_group_platforms query to the page's data fetch. After the existing `posts` query, add a fourth parallel query:

```typescript
const [{ data: items }, { data: profiles }, { data: posts }, { data: platforms }] =
  await Promise.all([
    // ... existing 3 queries unchanged ...

    // 4. Platform connections (for sync button display)
    admin
      .from("smm_group_platforms")
      .select("id, group_id, platform, page_name, is_active, token_expires_at")
      .eq("is_active", true),
  ]);
```

Update the return to pass platforms:
```tsx
<TrackerView
  items={items ?? []}
  profiles={profiles ?? []}
  posts={posts ?? []}
  platforms={platforms ?? []}
  currentUserId={user.id}
  isManager={isManagerOrAbove(user)}
/>
```

- [ ] **Step 2: Update TrackerView Props to accept platforms**

Add the Platform type and update Props in tracker-view.tsx:

```typescript
type PlatformConnection = {
  id: string;
  group_id: string;
  platform: string;
  page_name: string | null;
  is_active: boolean;
  token_expires_at: string | null;
};
```

Update Props:
```typescript
type Props = {
  items: ContentItem[];
  profiles: Profile[];
  posts: SmmPost[];
  platforms: PlatformConnection[];
  currentUserId: string;
  isManager: boolean;
};
```

- [ ] **Step 3: Add a "Live" tab alongside Planned and Published**

Change the tab state type to include "live":
```typescript
const [tab, setTab] = useState<"planned" | "published" | "live">("planned");
```

Add the Live tab pill:
```tsx
<TabPill
  label="Live Analytics"
  active={tab === "live"}
  onClick={() => {
    setTab("live");
    setStatusFilter("");
  }}
/>
```

- [ ] **Step 4: Add live posts state and fetch logic**

Add state for live posts data:
```typescript
const [livePosts, setLivePosts] = useState<Record<string, any[]>>({});
const [syncing, setSyncing] = useState(false);
```

Add a sync function:
```typescript
const handleSync = useCallback(async () => {
  setSyncing(true);
  try {
    const res = await fetch("/api/smm/social-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      setToast({ message: "Sync complete", type: "success" });
      // Refresh live data
      const topRes = await fetch("/api/smm/top-posts?from=2020-01-01&to=2099-01-01");
      if (topRes.ok) {
        const topData = await topRes.json();
        setLivePosts(topData ?? {});
      }
    }
  } catch {
    setToast({ message: "Sync failed", type: "error" });
  } finally {
    setSyncing(false);
  }
}, [setToast]);
```

- [ ] **Step 5: Render the Live tab content**

When `tab === "live"`, render a grid of analytics cards showing platform metrics. Add after the mobile cards section (before the modals, around line 442):

```tsx
{tab === "live" && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Published content analytics from connected platforms
      </p>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {syncing ? "Syncing..." : "Sync"}
      </button>
    </div>
    {Object.keys(livePosts).length === 0 ? (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">
        No live data yet. Click Sync to pull from connected platforms.
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(livePosts).flatMap(([platformId, posts]) =>
          posts.map((p: any) => (
            <div
              key={p.id || p.post_external_id}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-4 space-y-2"
            >
              {p.thumbnail_url && (
                <img src={p.thumbnail_url} alt="" className="w-full h-32 object-cover rounded-lg" />
              )}
              <p className="text-sm text-[var(--color-text-primary)] line-clamp-2">
                {p.caption_preview ?? "(no caption)"}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                {p.impressions != null && <span>Impressions: {fmtK(p.impressions)}</span>}
                {p.engagements != null && <span>Engagements: {fmtK(p.engagements)}</span>}
                {p.video_plays != null && <span>Plays: {fmtK(p.video_plays)}</span>}
              </div>
              {p.post_url && (
                <a
                  href={p.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  View post
                </a>
              )}
            </div>
          ))
        )}
      </div>
    )}
  </div>
)}
```

Add the `fmtK` helper (copy from content-view.tsx) near the other helpers:
```typescript
function fmtK(n: number | null | undefined): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
```

- [ ] **Step 6: Verify build passes**

Run: `npm run build 2>&1 | tail -30`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/creatives/tracker/page.tsx src/app/(dashboard)/creatives/tracker/tracker-view.tsx
git commit -m "feat(creatives): add Live Analytics tab to Tracker with platform sync"
```

---

## Task 7: Apply the Migration + Verify End-to-End

**Files:** None (verification only)

- [ ] **Step 1: Run the migration locally**

This step requires the Supabase CLI or direct database access. If using Supabase CLI:

Run: `npx supabase db push`

If using the Supabase dashboard, apply migration `00052_content_items_group_label.sql` manually.

- [ ] **Step 2: Start the dev server and test**

Run: `npm run dev`

Test checklist:
1. Navigate to `/creatives/dashboard` — verify per-group progress bars render, status breakdown shows, "Ads Approved" card appears, "Edit targets" button works for managers
2. Navigate to `/creatives/tracker` — verify group tabs (All, Local, International, PCDLF) work, creating a new item includes Group dropdown, table shows Group column
3. Navigate to `/creatives/content` — verify it redirects to `/creatives/tracker`
4. In the sidebar, verify "Content" nav item is gone, "Tracker" is in second position
5. Click "Live Analytics" tab — verify Sync button and analytics grid render
6. On mobile viewport — verify responsive layouts work for all new sections

- [ ] **Step 3: Final build verification**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(creatives): address any remaining issues from testing"
```

---

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Groups** | Created via UI in SmmSettingsPanel, stored in `smm_groups` table | Hardcoded in `src/lib/creatives/constants.ts` as Local, International, PCDLF |
| **Content page** | Separate 700-line page with SMM post management | Redirects to Tracker; functionality absorbed |
| **Tracker** | Basic planned/published tabs, no group filtering | Group tabs, Live Analytics tab with platform sync, group column in table |
| **Dashboard stats** | 3 stat cards (tasks, team, requests) | 4 stat cards (+Ads Approved), per-group progress, pipeline status breakdown |
| **Volume control** | Separate CampaignSetupForm for initial setup only | CampaignSetupForm + inline "Edit targets" for existing campaigns |
| **Nav** | 5 items (Dashboard, Content, Analytics, Requests, Tracker) | 4 items (Dashboard, Tracker, Analytics, Requests) |
| **DB schema** | `creative_content_items` has no group concept | New `group_label` text column with index |
