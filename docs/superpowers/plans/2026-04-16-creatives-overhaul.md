# Creatives Module Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Creatives module — add multi-assignee support, assign-to-live-post, week grouping, and search to the Tracker; open creative requests to all departments with bidirectional kanban sync; fix the analytics data pipeline and add per-content detail modals.

**Architecture:** A shared migration adds the `content_item_assignees` junction table, broadens `ad_requests` RLS, and adds `linked_card_id` to requests. A reusable `PeoplePicker` component serves the Tracker and Kanban. The Tracker view gets week-grouped sections, a post-linking modal, and multi-select assignee chips. The Requests page drops its department gate and shows contextual UI. The Analytics page switches to admin client and gets a detail modal.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + admin client), Tailwind CSS with CSS variables, TypeScript, Recharts

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/00054_creatives_overhaul.sql` | Junction table, RLS changes, ad_requests.linked_card_id |
| `src/components/ui/people-picker.tsx` | Reusable multi-select people picker (dept-first, search all, avatars) |
| `src/app/(dashboard)/creatives/tracker/page.tsx` | Fetch assignees from junction table |
| `src/app/(dashboard)/creatives/tracker/tracker-view.tsx` | Week grouping, search, assign-to-post, multi-assignee |
| `src/app/api/creatives/content-items/route.ts` | Handle assignee_ids in POST/PATCH, include assignees in GET |
| `src/app/(dashboard)/creatives/requests/page.tsx` | Remove dept gate, pass dept context, admin client for profiles |
| `src/app/(dashboard)/creatives/requests/requests-view.tsx` | Contextual UI for creatives vs non-creatives |
| `src/lib/permissions/nav.ts` | Make requests visible to all departments |
| `src/app/api/ad-ops/requests/route.ts` | Auto-create kanban card on accept, use admin for cross-dept |
| `src/app/(dashboard)/creatives/analytics/page.tsx` | Admin client for groups query |
| `src/app/(dashboard)/creatives/analytics/analytics-view.tsx` | Per-content detail modal, error states |

---

## Task 1: Migration — Schema Changes

**Files:**
- Create: `supabase/migrations/00054_creatives_overhaul.sql`

- [ ] **Step 1: Create migration file**

```sql
-- ============================================================
-- 00054_creatives_overhaul.sql
-- 1. content_item_assignees junction table (multi-assignee)
-- 2. Broaden ad_requests RLS (open to all authenticated users)
-- 3. Add linked_card_id to ad_requests (kanban sync)
-- ============================================================

-- 1. Multi-assignee junction table
CREATE TABLE public.content_item_assignees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES public.creative_content_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);

CREATE INDEX idx_cia_item ON public.content_item_assignees(item_id);
CREATE INDEX idx_cia_user ON public.content_item_assignees(user_id);

ALTER TABLE public.content_item_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_item_assignees FORCE ROW LEVEL SECURITY;

CREATE POLICY cia_select ON public.content_item_assignees
  FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY cia_insert ON public.content_item_assignees
  FOR INSERT WITH CHECK (public.is_ad_ops_access());
CREATE POLICY cia_delete ON public.content_item_assignees
  FOR DELETE USING (public.is_ad_ops_access());

-- 2. Broaden ad_requests: all authenticated can view + submit
DROP POLICY IF EXISTS ar_select ON public.ad_requests;
DROP POLICY IF EXISTS ar_insert ON public.ad_requests;

CREATE POLICY ar_select ON public.ad_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY ar_insert ON public.ad_requests
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ar_update and ar_delete stay unchanged (restricted to ad_ops_access / manager+)

-- 3. Kanban sync column on ad_requests
ALTER TABLE public.ad_requests
  ADD COLUMN IF NOT EXISTS linked_card_id uuid REFERENCES public.kanban_cards(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00054_creatives_overhaul.sql
git commit -m "feat(db): add content_item_assignees, broaden ad_requests RLS, add linked_card_id"
```

---

## Task 2: Smart People Picker Component

**Files:**
- Create: `src/components/ui/people-picker.tsx`

- [ ] **Step 1: Create the reusable component**

```tsx
"use client";

import { useState, useRef, useEffect, useMemo } from "react";

type User = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  department_id?: string | null;
};

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  allUsers: User[];
  currentDeptId?: string | null;
  placeholder?: string;
  single?: boolean; // false = multi-select (default), true = single select
};

export function PeoplePicker({ value, onChange, allUsers, currentDeptId, placeholder = "Search people...", single = false }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedUsers = useMemo(() =>
    value.map((id) => allUsers.find((u) => u.id === id)).filter(Boolean) as User[],
    [value, allUsers]
  );

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = allUsers.filter((u) => {
      if (value.includes(u.id)) return false; // already selected
      if (q) return `${u.first_name} ${u.last_name}`.toLowerCase().includes(q);
      return true;
    });
    // Sort: current department first
    return filtered.sort((a, b) => {
      const aMatch = a.department_id === currentDeptId ? 0 : 1;
      const bMatch = b.department_id === currentDeptId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });
  }, [allUsers, search, value, currentDeptId]);

  function initials(u: User) {
    return `${u.first_name?.[0] ?? ""}${u.last_name?.[0] ?? ""}`.toUpperCase();
  }

  function addUser(id: string) {
    if (single) {
      onChange([id]);
      setOpen(false);
    } else {
      onChange([...value, id]);
    }
    setSearch("");
  }

  function removeUser(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div ref={ref} className="relative">
      {/* Selected chips */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selectedUsers.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)] text-xs font-medium">
              {u.avatar_url ? (
                <img src={u.avatar_url} className="w-4 h-4 rounded-full object-cover" alt="" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center text-[8px] font-bold">{initials(u)}</span>
              )}
              {u.first_name} {u.last_name}
              <button type="button" onClick={() => removeUser(u.id)} className="ml-0.5 hover:text-[var(--color-error)]">&times;</button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
      />

      {/* Dropdown */}
      {open && filteredUsers.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-md)]">
          {filteredUsers.slice(0, 20).map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => addUser(u.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              {u.avatar_url ? (
                <img src={u.avatar_url} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">{initials(u)}</span>
              )}
              <span className="text-[var(--color-text-primary)]">{u.first_name} {u.last_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/people-picker.tsx
git commit -m "feat(ui): add reusable PeoplePicker component with dept-first sorting"
```

---

## Task 3: Content Items API — Multi-Assignee Support

**Files:**
- Modify: `src/app/api/creatives/content-items/route.ts`

- [ ] **Step 1: Update GET to include assignees from junction table**

In the GET handler, change the select to include assignees:

```typescript
// In the select string, add:
assignees:content_item_assignees(
  user_id,
  profile:profiles!user_id(id, first_name, last_name, avatar_url)
)
```

- [ ] **Step 2: Update POST to handle assignee_ids array**

After creating the content item, if `body.assignee_ids` is provided (array of UUIDs), insert rows into `content_item_assignees`:

```typescript
// After the item is created successfully:
if (body.assignee_ids?.length && item.id) {
  const assigneeRows = body.assignee_ids.map((uid: string) => ({
    item_id: item.id,
    user_id: uid,
  }));
  await admin.from("content_item_assignees").insert(assigneeRows);
}
```

Also keep setting `assigned_to` to the first assignee for backward compat:
```typescript
assigned_to: body.assignee_ids?.[0] ?? body.assigned_to ?? null,
```

- [ ] **Step 3: Update PATCH to sync assignee_ids**

In the PATCH handler, if `assignee_ids` is provided, sync the junction table:

```typescript
if (body.assignee_ids !== undefined) {
  // Delete existing and re-insert
  await admin.from("content_item_assignees").delete().eq("item_id", id);
  if (body.assignee_ids.length > 0) {
    await admin.from("content_item_assignees").insert(
      body.assignee_ids.map((uid: string) => ({ item_id: id, user_id: uid }))
    );
  }
  // Keep assigned_to in sync for backward compat
  updates.assigned_to = body.assignee_ids[0] ?? null;
  delete updates.assignee_ids;
}
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/creatives/content-items/route.ts
git commit -m "feat(api): multi-assignee support for content items via junction table"
```

---

## Task 4: Tracker Page — Fetch Assignees

**Files:**
- Modify: `src/app/(dashboard)/creatives/tracker/page.tsx`

- [ ] **Step 1: Update the content items query to include assignees**

In the admin query for `creative_content_items`, add the assignees relation:

```typescript
admin
  .from("creative_content_items")
  .select(
    `*,
    assigned_profile:profiles!assigned_to(id, first_name, last_name, avatar_url),
    creator_profile:profiles!created_by(id, first_name, last_name),
    assignees:content_item_assignees(
      user_id,
      profile:profiles!user_id(id, first_name, last_name, avatar_url)
    )`
  )
  .order("created_at", { ascending: false }),
```

- [ ] **Step 2: Update the profiles query to include avatar_url and department_id**

Ensure the profiles query (for the people picker) includes `avatar_url` and `department_id`:

```typescript
admin
  .from("profiles")
  .select("id, first_name, last_name, department_id, avatar_url")
  .eq("status", "active")
  .is("deleted_at", null)
  .order("first_name"),
```

- [ ] **Step 3: Pass currentDeptId to the view**

Add `currentDeptId={user.department_id ?? null}` to the TrackerView props.

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/creatives/tracker/page.tsx
git commit -m "feat(tracker): fetch assignees from junction table + pass dept context"
```

---

## Task 5: Tracker View — Week Grouping + Search

**Files:**
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`

- [ ] **Step 1: Add week grouping helpers**

At the top of the file, add date helpers:

```typescript
import { startOfWeek, endOfWeek, subWeeks, isWithinInterval, parseISO } from "date-fns";

function getWeekGroup(plannedWeekStart: string | null): "this_week" | "last_week" | "older" | "unscheduled" {
  if (!plannedWeekStart) return "unscheduled";
  const d = parseISO(plannedWeekStart);
  const now = new Date();
  const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
  const thisSunday = endOfWeek(now, { weekStartsOn: 1 });
  const lastMonday = subWeeks(thisMonday, 1);
  const lastSunday = subWeeks(thisSunday, 1);

  if (isWithinInterval(d, { start: thisMonday, end: thisSunday })) return "this_week";
  if (isWithinInterval(d, { start: lastMonday, end: lastSunday })) return "last_week";
  return "older";
}

const WEEK_GROUP_LABELS: Record<string, string> = {
  this_week: "This Week",
  last_week: "Last Week",
  older: "Older",
  unscheduled: "Unscheduled",
};

const WEEK_GROUP_ORDER = ["this_week", "last_week", "older", "unscheduled"];
```

- [ ] **Step 2: Add search state**

In the component, add search state (may already exist — check and reuse if so):

```typescript
const [search, setSearch] = useState("");
```

- [ ] **Step 3: Filter and group items by week**

Replace the current flat item list with grouped rendering:

```typescript
const q = search.toLowerCase();
const filtered = items.filter((i) => {
  if (q) {
    const name = profileName(i.assigned_profile);
    const haystack = `${i.title} ${name} ${i.campaign_label ?? ""} ${i.product_or_collection ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (statusFilter && i.status !== statusFilter) return false;
  if (groupFilter && i.group_label !== groupFilter) return false;
  return true;
});

const grouped = WEEK_GROUP_ORDER.map((key) => ({
  key,
  label: WEEK_GROUP_LABELS[key],
  items: filtered.filter((i) =>
    tab === "planned"
      ? PLANNED_STATUSES.includes(i.status) && getWeekGroup(i.planned_week_start) === key
      : PUBLISHED_STATUSES.includes(i.status) && getWeekGroup(i.planned_week_start) === key
  ),
})).filter((g) => g.items.length > 0);
```

- [ ] **Step 4: Add search bar UI**

Add above the tab bar / filters:

```tsx
<input
  type="text"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search by title, assignee, campaign..."
  className="w-full sm:w-72 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
/>
```

- [ ] **Step 5: Render grouped sections**

Replace the flat table with grouped sections, each with a collapsible header:

```tsx
{grouped.map((group) => (
  <div key={group.key} className="mb-6">
    <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2 flex items-center gap-2">
      {group.label}
      <span className="text-xs font-normal text-[var(--color-text-tertiary)]">({group.items.length})</span>
    </h3>
    {/* Existing table/card rendering for group.items */}
  </div>
))}
```

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/creatives/tracker/tracker-view.tsx
git commit -m "feat(tracker): week grouping (This Week/Last Week/Older) + search"
```

---

## Task 6: Tracker View — Assign to Live Post Modal

**Files:**
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`

- [ ] **Step 1: Add state for the post-linking modal**

```typescript
const [linkingItemId, setLinkingItemId] = useState<string | null>(null);
```

- [ ] **Step 2: Create the AssignPostModal component**

Add inside the file (or as a separate function):

```tsx
function AssignPostModal({
  posts,
  onSelect,
  onClose,
}: {
  posts: SmmPost[];
  onSelect: (postId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  const platforms = ["all", ...new Set(posts.map((p) => p.platform))];
  const filtered = posts.filter((p) => {
    if (tab !== "all" && p.platform !== tab) return false;
    if (search && !(p.caption ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-[var(--color-border-secondary)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Assign to Live Post</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by caption..."
            className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm"
          />
          <div className="flex gap-1 mt-2">
            {platforms.map((p) => (
              <button
                key={p}
                onClick={() => setTab(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                  tab === p ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">No posts found</p>
          )}
          {filtered.map((post) => (
            <button
              key={post.id}
              onClick={() => onSelect(post.id)}
              className="w-full text-left p-3 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)] flex items-start gap-3"
            >
              <span className="text-xs font-medium capitalize px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] flex-shrink-0">
                {post.platform}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-text-primary)] line-clamp-2">{post.caption ?? "(no caption)"}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  {post.published_at ? format(parseISO(post.published_at), "MMM d, yyyy") : "Not published"}
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-[var(--color-border-secondary)]">
          <button onClick={onClose} className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add "Assign Post" button to each row**

In the table row rendering, add a button after the status column:

```tsx
<button
  onClick={(e) => { e.stopPropagation(); setLinkingItemId(item.id); }}
  className="text-xs px-2 py-1 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
>
  {item.linked_post_id ? "Reassign Post" : "Assign Post"}
</button>
```

- [ ] **Step 4: Handle post selection**

```typescript
const handleAssignPost = useCallback(async (postId: string) => {
  if (!linkingItemId) return;
  setItems((prev) => prev.map((i) =>
    i.id === linkingItemId ? { ...i, linked_post_id: postId, transfer_link: null } : i
  ));
  await fetch("/api/creatives/content-items", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: linkingItemId, linked_post_id: postId, transfer_link: null }),
  });
  setLinkingItemId(null);
  setToast({ message: "Post assigned", type: "success" });
}, [linkingItemId, setToast]);
```

- [ ] **Step 5: Render modal**

At the bottom of the component return:

```tsx
{linkingItemId && (
  <AssignPostModal
    posts={posts}
    onSelect={handleAssignPost}
    onClose={() => setLinkingItemId(null)}
  />
)}
```

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/creatives/tracker/tracker-view.tsx
git commit -m "feat(tracker): assign-to-live-post modal with platform tabs"
```

---

## Task 7: Tracker View — Multi-Assignee with People Picker

**Files:**
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`

- [ ] **Step 1: Update ContentItem type**

Add assignees to the type:

```typescript
type Assignee = {
  user_id: string;
  profile: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
};

// In ContentItem type, add:
assignees?: Assignee[];
```

Update Props to include `currentDeptId`:

```typescript
type Props = {
  items: ContentItem[];
  profiles: (Profile & { avatar_url?: string | null })[];
  posts: SmmPost[];
  platforms: PlatformConnection[];
  currentUserId: string;
  currentDeptId: string | null;
  isManager: boolean;
};
```

- [ ] **Step 2: Import and use PeoplePicker in the ItemModal**

```typescript
import { PeoplePicker } from "@/components/ui/people-picker";
```

In the `ItemModal` component, replace the single-select assignee dropdown with the PeoplePicker:

```tsx
// Replace the existing assigned_to <select> with:
<label className="text-sm font-medium text-[var(--color-text-primary)]">Assignees</label>
<PeoplePicker
  value={assigneeIds}
  onChange={setAssigneeIds}
  allUsers={profiles}
  currentDeptId={currentDeptId}
  placeholder="Search and assign people..."
/>
```

Add state: `const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assignees?.map(a => a.user_id) ?? (initial?.assigned_to ? [initial.assigned_to] : []));`

In the save handler, send `assignee_ids` instead of `assigned_to`:

```typescript
const data = { ...otherFields, assignee_ids: assigneeIds };
```

- [ ] **Step 3: Show assignee avatars in table rows**

Replace the single assignee name in the table with avatar chips:

```tsx
<td className="px-4 py-3">
  <div className="flex -space-x-1">
    {(item.assignees ?? []).slice(0, 3).map((a) => (
      <span key={a.user_id} title={a.profile ? `${a.profile.first_name} ${a.profile.last_name}` : ""} className="w-6 h-6 rounded-full border-2 border-[var(--color-bg-primary)] overflow-hidden inline-block">
        {a.profile?.avatar_url ? (
          <img src={a.profile.avatar_url} className="w-full h-full object-cover" alt="" />
        ) : (
          <span className="w-full h-full bg-[var(--color-accent)] text-white flex items-center justify-center text-[9px] font-bold">
            {a.profile?.first_name?.[0]}{a.profile?.last_name?.[0]}
          </span>
        )}
      </span>
    ))}
    {(item.assignees?.length ?? 0) > 3 && (
      <span className="w-6 h-6 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] text-[9px] font-medium flex items-center justify-center border-2 border-[var(--color-bg-primary)]">
        +{(item.assignees?.length ?? 0) - 3}
      </span>
    )}
    {(!item.assignees || item.assignees.length === 0) && (
      <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
    )}
  </div>
</td>
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/creatives/tracker/tracker-view.tsx
git commit -m "feat(tracker): multi-assignee with PeoplePicker + avatar chips in rows"
```

---

## Task 8: Requests — Open to All Departments

**Files:**
- Modify: `src/app/(dashboard)/creatives/requests/page.tsx`
- Modify: `src/lib/permissions/nav.ts`

- [ ] **Step 1: Remove department gate from requests page**

In `page.tsx`, remove the department slug check that redirects non-creatives/ad-ops users. Keep only the auth check:

```typescript
export default async function CreativesRequestsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // Determine if current user is in creatives dept (for contextual UI)
  const userDeptSlug = currentUser.department?.slug ?? null;
  const isCreativesDept = ["creatives"].includes(userDeptSlug ?? "");
  const isOpsUser = isOps(currentUser);

  // Fetch creatives department members for assignee dropdown (managers/creatives only)
  const { data: creativesDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "creatives")
    .single();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("department_id", creativesDept?.id ?? "")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  const canManage = isCreativesDept || isOpsUser;

  return (
    <div className="max-w-5xl mx-auto">
      <CreativesRequestsView
        members={profiles ?? []}
        currentUserId={currentUser.id}
        canManage={canManage}
        isCreativesDept={isCreativesDept}
        isOps={isOpsUser}
      />
    </div>
  );
}
```

Add imports: `createAdminClient`, `isOps`.

- [ ] **Step 2: Make requests visible to all departments in nav**

In `src/lib/permissions/nav.ts`, the creatives group has `departments: ["creatives", "ad-ops", "marketing"]`. The requests item needs to be visible to everyone.

Add a standalone nav item visible to all, or add a `public: true` flag. Since the existing nav model uses department arrays, the cleanest approach is to add a new nav group called "Services" visible to all:

```typescript
{
  name: "Services",
  slug: "services",
  departments: [], // empty = visible to all
  items: [
    { name: "Request for Creatives", slug: "creatives-requests", route: "/creatives/requests" },
  ],
},
```

Then update `resolveNavigation()` to treat `departments: []` as "show to everyone" (check if the function already handles this — if not, add logic like: `if (group.departments.length === 0) return true;`).

**Alternatively**, if the nav resolver doesn't support empty departments, add a special keyword like `"_all"` that means all departments.

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/creatives/requests/page.tsx src/lib/permissions/nav.ts
git commit -m "feat(requests): open to all departments + visible in sidebar for everyone"
```

---

## Task 9: Requests — Contextual UI

**Files:**
- Modify: `src/app/(dashboard)/creatives/requests/requests-view.tsx`

- [ ] **Step 1: Update Props type**

```typescript
type Props = {
  members: Member[];
  currentUserId: string;
  canManage: boolean;
  isCreativesDept: boolean;
  isOps: boolean;
};
```

- [ ] **Step 2: Contextual page title**

```tsx
<h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
  {isCreativesDept || isOps ? "Submitted Creative Requests" : "Request for Creatives"}
</h2>
```

- [ ] **Step 3: Non-creatives view — show only own requests + submit form**

For non-creatives users, filter to only show their own requests:

```typescript
const visibleRequests = useMemo(() => {
  if (isCreativesDept || isOps) return requests; // see all
  return requests.filter((r) => r.requester?.id === currentUserId); // own only
}, [requests, isCreativesDept, isOps, currentUserId]);
```

Non-creatives users see a simplified view: their requests with status badges, plus a "New Request" form. They cannot change status or assign.

- [ ] **Step 4: Submit form for non-creatives**

Add a "New Request" section at the top for non-creatives:

```tsx
{!isCreativesDept && !isOps && (
  <div className="mb-6 p-4 rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
    <h3 className="text-sm font-semibold mb-3">Submit a New Request</h3>
    <form onSubmit={handleSubmitRequest} className="space-y-3">
      <input name="title" required placeholder="What do you need?" className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm" />
      <textarea name="brief" placeholder="Describe what you need..." rows={3} className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm" />
      <input name="target_date" type="date" className="rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm" />
      <button type="submit" className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white text-sm font-medium">Submit Request</button>
    </form>
  </div>
)}
```

Add the submit handler:

```typescript
async function handleSubmitRequest(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const res = await fetch("/api/ad-ops/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: form.get("title"),
      brief: form.get("brief") || null,
      target_date: form.get("target_date") || null,
      status: "submitted",
    }),
  });
  if (res.ok) {
    e.currentTarget.reset();
    await fetchRequests();
  }
}
```

Note: The existing POST API sets status to "draft" by default. The submit form should send `status: "submitted"` so creatives sees it immediately. Alternatively, update the API to accept status on POST, or change the default to "submitted".

- [ ] **Step 5: Creatives view — full fulfillment queue (existing)**

No changes to the existing fulfillment view — it stays as-is for creatives/OPS users. Just ensure the `canManage` prop gates the status transition buttons and assignee dropdown.

- [ ] **Step 6: Update the requests API to accept status on POST**

In `src/app/api/ad-ops/requests/route.ts`, the POST handler currently hardcodes `status: "draft"`. Change to accept status from the body, defaulting to "submitted":

```typescript
status: body.status ?? "submitted",
```

Also update the POST to use admin client so non-ad-ops users can insert (RLS now allows it, but the API also uses the user client internally):

```typescript
const admin = createAdminClient();
const { data, error } = await admin
  .from("ad_requests")
  .insert({ ... })
  .select()
  .single();
```

- [ ] **Step 7: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 8: Commit**

```bash
git add src/app/(dashboard)/creatives/requests/requests-view.tsx src/app/api/ad-ops/requests/route.ts
git commit -m "feat(requests): contextual UI for creatives vs non-creatives + submit form"
```

---

## Task 10: Requests — Bidirectional Kanban Sync

**Files:**
- Modify: `src/app/api/ad-ops/requests/route.ts`
- Modify: `src/app/(dashboard)/productivity/kanban/kanban-board.tsx`

- [ ] **Step 1: Auto-create kanban card when request is accepted**

In the PATCH handler of `requests/route.ts`, after the status update succeeds, check if the new status is `in_progress` and no card is linked yet:

```typescript
// After: const { data, error } = await supabase.from("ad_requests").update(body)...

if (data && body.status === "in_progress" && !data.linked_card_id) {
  const admin = createAdminClient();
  // Find creatives team board
  const { data: creativesDept } = await admin
    .from("departments").select("id").eq("slug", "creatives").single();

  if (creativesDept) {
    const { data: board } = await admin
      .from("kanban_boards")
      .select("id, kanban_columns(id, sort_order)")
      .eq("department_id", creativesDept.id)
      .eq("scope", "team")
      .limit(1)
      .single();

    if (board?.kanban_columns?.length) {
      const firstCol = [...board.kanban_columns].sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
      const { data: card } = await admin
        .from("kanban_cards")
        .insert({
          column_id: firstCol.id,
          title: `[Request] ${data.title}`,
          created_by: currentUser.id,
        })
        .select("id")
        .single();

      if (card) {
        await admin.from("ad_requests")
          .update({ linked_card_id: card.id })
          .eq("id", id);
      }
    }
  }
}
```

- [ ] **Step 2: Kanban → Request sync on card move**

In `kanban-board.tsx`, find where cards are moved between columns (drag-and-drop handler or column change). After the card move succeeds, check if the card has a linked request and update it:

```typescript
// After card column update succeeds:
// Check if this card is linked to a request
const { data: linkedRequest } = await supabase
  .from("ad_requests")
  .select("id, status")
  .eq("linked_card_id", cardId)
  .maybeSingle();

if (linkedRequest) {
  // Map column position to request status
  const cols = columns.sort((a, b) => a.sort_order - b.sort_order);
  const colIdx = cols.findIndex((c) => c.id === newColumnId);
  const totalCols = cols.length;

  let newStatus: string | null = null;
  if (colIdx === totalCols - 1) newStatus = "approved"; // last column = done
  else if (colIdx === totalCols - 2) newStatus = "review"; // second to last
  else if (colIdx >= 0) newStatus = "in_progress"; // any other

  if (newStatus && newStatus !== linkedRequest.status) {
    await fetch(`/api/ad-ops/requests?id=${linkedRequest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ad-ops/requests/route.ts src/app/(dashboard)/productivity/kanban/kanban-board.tsx
git commit -m "feat(requests): bidirectional kanban sync on accept + card move"
```

---

## Task 11: Analytics — Fix Data Pipeline

**Files:**
- Modify: `src/app/(dashboard)/creatives/analytics/page.tsx`
- Modify: `src/app/api/smm/analytics/route.ts`
- Modify: `src/app/api/smm/top-posts/route.ts` (if exists)

- [ ] **Step 1: Switch analytics page to admin client**

In `page.tsx`, use admin client for the groups query:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

// Inside the page:
const admin = createAdminClient();
const { data: groups } = await admin
  .from("smm_groups")
  .select(`id, name, smm_group_platforms(id, platform, page_name, is_active)`)
  .eq("is_active", true)
  .order("sort_order", { ascending: true });
```

- [ ] **Step 2: Fix analytics API to use admin client**

In `src/app/api/smm/analytics/route.ts`, the `guard()` function creates a user client. The GET handler uses it to query `smm_analytics`. Change to use admin client for the data query (keep the guard for auth):

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

// In GET handler, after guard():
const admin = createAdminClient();
// Replace supabase! with admin for the smm_analytics query
```

- [ ] **Step 3: Fix top-posts API similarly**

Check `src/app/api/smm/top-posts/route.ts` — if it exists and uses user client, switch data queries to admin.

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/creatives/analytics/page.tsx src/app/api/smm/analytics/route.ts src/app/api/smm/top-posts/route.ts
git commit -m "fix(analytics): switch to admin client for SMM data queries"
```

---

## Task 12: Analytics — Per-Content Detail Modal

**Files:**
- Modify: `src/app/(dashboard)/creatives/analytics/analytics-view.tsx`

- [ ] **Step 1: Add state for detail modal**

```typescript
const [selectedPost, setSelectedPost] = useState<TopPost | null>(null);
```

- [ ] **Step 2: Create PostDetailModal component**

```tsx
function PostDetailModal({ post, platform, onClose }: { post: TopPost; platform: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-md p-5">
        <button onClick={onClose} className="absolute top-3 right-3 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button>

        {post.thumbnail_url && (
          <img src={post.thumbnail_url} className="w-full h-48 object-cover rounded-[var(--radius-md)] mb-4" alt="" />
        )}

        <p className="text-sm text-[var(--color-text-primary)] mb-4 line-clamp-3">{post.caption_preview ?? "(no caption)"}</p>

        <div className="grid grid-cols-2 gap-3">
          {post.impressions != null && (
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">Impressions</p>
              <p className="text-lg font-semibold text-[var(--color-text-primary)]">{fmtK(post.impressions)}</p>
            </div>
          )}
          {post.reach != null && (
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">Reach</p>
              <p className="text-lg font-semibold text-[var(--color-text-primary)]">{fmtK(post.reach)}</p>
            </div>
          )}
          {post.engagements != null && (
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">Engagements</p>
              <p className="text-lg font-semibold text-[var(--color-text-primary)]">{fmtK(post.engagements)}</p>
            </div>
          )}
          {post.video_plays != null && (
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">{platform === "tiktok" ? "Views" : "Video Plays"}</p>
              <p className="text-lg font-semibold text-[var(--color-text-primary)]">{fmtK(post.video_plays)}</p>
            </div>
          )}
          {post.avg_play_time_secs != null && post.avg_play_time_secs > 0 && (
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
              <p className="text-xs text-[var(--color-text-tertiary)]">Avg Watch Time</p>
              <p className="text-lg font-semibold text-[var(--color-text-primary)]">{post.avg_play_time_secs.toFixed(1)}s</p>
            </div>
          )}
        </div>

        {post.published_at && (
          <p className="text-xs text-[var(--color-text-tertiary)] mt-4">
            Published {format(parseISO(post.published_at), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}

        {post.post_url && (
          <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-sm text-[var(--color-accent)] hover:underline">
            View on {PLATFORM_LABELS[platform] ?? platform} &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Make top post cards clickable**

Find where `topPosts` are rendered in the grid. Wrap each card with an `onClick`:

```tsx
onClick={() => setSelectedPost(post)}
className="cursor-pointer hover:ring-1 hover:ring-[var(--color-border-focus)] transition-shadow"
```

- [ ] **Step 4: Render the modal**

At the bottom of the component:

```tsx
{selectedPost && (
  <PostDetailModal
    post={selectedPost}
    platform={activePlatform?.platform ?? "facebook"}
    onClose={() => setSelectedPost(null)}
  />
)}
```

- [ ] **Step 5: Add per-platform error states**

In the data fetching, wrap each platform's data load in try/catch and show individual error messages:

```tsx
{syncState === "failed" && (
  <p className="text-sm text-[var(--color-error)]">Failed to load {PLATFORM_LABELS[platform]} data. The platform may need to be reconnected.</p>
)}
```

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/creatives/analytics/analytics-view.tsx
git commit -m "feat(analytics): per-content detail modal + platform error states"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| 1A. Assign to Live Post | Task 6 |
| 1B. Week Grouping | Task 5 |
| 1C. Search | Task 5 |
| 1D. Multiple Assignees | Tasks 3, 4, 7 |
| 1E. Smart People Picker | Task 2 |
| 2A. Open to All Depts | Task 1 (RLS), Task 8 |
| 2B. Nav Visibility | Task 8 |
| 2C. Contextual UI | Task 9 |
| 2D. Bidirectional Kanban Sync | Task 1 (column), Task 10 |
| 3A. Fix Data Pipeline | Task 11 |
| 3B. Per-Content Detail Modal | Task 12 |
| 3C. Multi-Platform Resilience | Task 12 |
