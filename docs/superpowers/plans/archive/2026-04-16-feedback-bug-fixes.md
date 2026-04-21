# Feedback Bug Fix Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all actionable bugs from the 2026-04-16 feedback export — 15 tasks across People, Kanban, Room Booking, Creatives, Ad-Ops, Knowledgebase, News Feed, Learning, Sales-Ops, Communications, and Announcements modules.

**Architecture:** Most visibility bugs share a root cause: RLS policies that are too restrictive for an internal company app. The primary fix is a migration to broaden `profiles_select` RLS. API routes that need cross-department data switch to admin client. UI fixes address room booking mobile responsiveness, kanban defaults, reaction viewers, and form improvements.

**Tech Stack:** Next.js 16 (App Router), Supabase (RLS + admin client), Tailwind CSS, TypeScript

---

## Task 1: Migration — Broaden Profiles RLS

**Files:**
- Create: `supabase/migrations/00053_fix_profiles_rls.sql`

**Root Cause:** `profiles_select` in `00001_foundation.sql` restricts contributors to own row, managers to same department. Internal company app — all employees should see full directory, birthdays, team dashboards.

- [ ] **Step 1: Create migration**

```sql
-- ============================================================
-- 00053_fix_profiles_rls.sql
-- Fix: Directory, Birthdays, Creatives Dashboard, Sales-Ops agents
-- invisible to contributors/managers across departments.
--
-- Root cause: profiles_select only allows own row for contributors.
-- Fix: all authenticated users can SELECT profiles (internal app).
-- UPDATE/DELETE policies unchanged — still restricted.
-- ============================================================

DROP POLICY IF EXISTS profiles_select ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00053_fix_profiles_rls.sql
git commit -m "fix(rls): broaden profiles SELECT to all authenticated users

Contributors could only see their own profile, breaking directory,
birthdays, creatives dashboard, and sales-ops agents list."
```

---

## Task 2: Mobile Nav — Fix "My Dept" 404

**Files:**
- Modify: `src/components/layout/mobile-nav.tsx`

**Root Cause:** The "My Dept" button in the mobile bottom nav links to `/<dept-slug>` (e.g., `/marketing`) but the actual route is `/dashboard/<dept-slug>`. Results in 404 for everyone.

- [ ] **Step 1: Find the "My Dept" link in mobile-nav.tsx**

Search for the department link. It's likely constructing a URL like `/${deptSlug}`. Change it to `/dashboard/${deptSlug}`.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/mobile-nav.tsx
git commit -m "fix(mobile-nav): fix My Dept link to /dashboard/<slug>

Was linking to /<slug> which returns 404. Correct route is
/dashboard/<slug>."
```

---

## Task 3: Directory — Own Department First + Verify Search

**Files:**
- Modify: `src/app/(dashboard)/people/directory/page.tsx`
- Modify: `src/app/(dashboard)/people/directory/directory-view.tsx`

**User requirement:** After RLS fix, directory shows everyone. But own department members should appear first at the top, then everyone else below. Search should work across all users.

- [ ] **Step 1: Sort profiles with own department first in page.tsx**

After fetching profiles, sort so current user's department appears first:

```typescript
const sorted = [...(profiles ?? [])].sort((a, b) => {
  const aMyDept = a.department?.id === currentUser.department_id ? 0 : 1;
  const bMyDept = b.department?.id === currentUser.department_id ? 0 : 1;
  if (aMyDept !== bMyDept) return aMyDept - bMyDept;
  return (a.first_name ?? "").localeCompare(b.first_name ?? "");
});
```

Pass sorted profiles to DirectoryView.

- [ ] **Step 2: Add "My Department" section header in directory-view.tsx**

In the view, if not filtering by a specific department, show a section header "My Department" before own-department profiles, and "Everyone Else" before the rest.

- [ ] **Step 3: Verify search still works across all users**

Existing search should filter across the full sorted list. Verify this works.

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/people/directory/page.tsx src/app/(dashboard)/people/directory/directory-view.tsx
git commit -m "fix(directory): show own department first, everyone else below

Own department members appear at top with section header, then
all other departments. Search works across everyone."
```

---

## Task 4: Birthdays — Own Department First + Search

**Files:**
- Modify: `src/app/(dashboard)/people/birthdays/page.tsx`
- Modify: `src/app/(dashboard)/people/birthdays/birthdays-view.tsx`

**User requirement:** Same as directory — own department's birthdays appear first. Add search by name. Keep the existing bucket grouping (Today, This Week, This Month, Past, Upcoming) but within each bucket, own department first.

- [ ] **Step 1: Pass department info to birthdays view**

In page.tsx, pass `currentDeptId={currentUser.department_id}` to BirthdaysView.

- [ ] **Step 2: Sort each bucket with own dept first**

In each bucket (todayPeople, thisWeek, thisMonth, etc.), sort so own-department people come first:

```typescript
function deptFirstSort(people: BirthdayPerson[], myDeptName: string | null) {
  return [...people].sort((a, b) => {
    const aMatch = a.department?.name === myDeptName ? 0 : 1;
    const bMatch = b.department?.name === myDeptName ? 0 : 1;
    return aMatch - bMatch;
  });
}
```

- [ ] **Step 3: Add search bar to birthdays-view.tsx**

Add a search input at the top that filters across all buckets by first_name/last_name.

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/people/birthdays/page.tsx src/app/(dashboard)/people/birthdays/birthdays-view.tsx
git commit -m "fix(birthdays): own department first in each section + search

Own department members shown first within each time bucket.
Added search bar to filter by name across all sections."
```

---

## Task 5: Kanban — Fix Visibility + Team Board Default

**Files:**
- Modify: `src/app/(dashboard)/productivity/kanban/page.tsx`
- Modify: `src/app/(dashboard)/productivity/kanban/kanban-multi-board.tsx`
- Modify: `src/app/api/creatives/content-items/route.ts` (auto-card targeting)

**Root Cause:** Board data fetched via user client (RLS filters cards). Auto-created cards from Tracker may land in wrong board. Team board may not be expanded by default.

- [ ] **Step 1: Switch kanban page to admin client for board data**

In page.tsx, import `createAdminClient` and use admin for the boards query and `fetchBoardData`. Keep the user client only for auth/permission checks.

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

// Inside page function:
const admin = createAdminClient();

// Use admin for boards query
const { data: boards } = await admin
  .from("kanban_boards")
  .select("id, name, scope, owner_id, department_id")
  .or(`scope.eq.global,and(scope.eq.team,department_id.eq.${departmentId ?? ""}),and(scope.eq.personal,owner_id.eq.${currentUser.id})`);

// Use admin inside fetchBoardData for columns and cards
```

- [ ] **Step 2: Fix auto-card creation to target team board**

In `src/app/api/creatives/content-items/route.ts`, in the POST handler's auto-kanban-card section, add `.eq("scope", "team")` to the board query so cards always go to the team board.

- [ ] **Step 3: Default team board expanded, personal/global collapsed**

In `kanban-multi-board.tsx`, find the expanded state and set team board to expanded by default:

```typescript
const [expanded, setExpanded] = useState<Record<string, boolean>>({
  team: true,
  personal: false,
  global: false,
});
```

- [ ] **Step 4: Verify global board works**

Ensure the global board query (`scope.eq.global`) has no department filter and admin client fetches all global cards.

- [ ] **Step 5: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/productivity/kanban/page.tsx src/app/(dashboard)/productivity/kanban/kanban-multi-board.tsx src/app/api/creatives/content-items/route.ts
git commit -m "fix(kanban): show all team/global cards, team board expanded by default

- Admin client for board data (bypasses card RLS filtering)
- Auto-created cards from Tracker target team board specifically
- Team board expanded by default, personal/global collapsed
- Global board works for all users"
```

---

## Task 6: Room Booking — Full Mobile Responsive + UI Fixes

**Files:**
- Modify: `src/app/(dashboard)/scheduling/rooms/room-booking-view.tsx`

**5 sub-fixes:**

- [ ] **Step 1: Show time ranges on slot labels (not just start time)**

Find slot rendering. Change from showing just `minutesToLabel(slot.startMin)` to showing the full range: `minutesToLabel(slot.startMin) – minutesToLabel(slot.endMin)`. Add a "Room closes at X" label at bottom.

- [ ] **Step 2: Gray out past time slots on today's date**

Add logic to detect if a slot is in the past:
```typescript
const now = new Date();
const currentMinutes = now.getHours() * 60 + now.getMinutes();
const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
// Per slot:
const isPastSlot = isToday && slot.endMin <= currentMinutes;
```
Apply `opacity-40 cursor-not-allowed pointer-events-none` to past slots.

- [ ] **Step 3: Fix sticky bar size + z-index above PostHog**

Increase the sticky action bar padding to `py-3 px-4`, set `z-[60]` (PostHog widget is typically z-50). Increase font size slightly for mobile readability.

- [ ] **Step 4: Full mobile responsive layout**

- Room sidebar + timeline: `flex flex-col lg:flex-row` (stack on mobile)
- Room list: horizontal scroll on mobile `flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible`
- Timeline grid: full width on mobile, scrollable if needed
- Booking modal: `max-h-[90vh] overflow-y-auto` to fit on mobile screens, full-width on small screens
- Multiselect toggle: ensure it's visible and tappable on mobile
- Sticky book button: full width on mobile

- [ ] **Step 5: Check if multiselect persistence is already fixed**

Check if `multiSelect` state already persists in localStorage. If not, add:
```typescript
const [multiSelect, setMultiSelect] = useState(() => {
  if (typeof window !== "undefined") return localStorage.getItem("room-multiselect") === "true";
  return false;
});
useEffect(() => { localStorage.setItem("room-multiselect", String(multiSelect)); }, [multiSelect]);
```

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/scheduling/rooms/room-booking-view.tsx
git commit -m "fix(rooms): mobile responsive overhaul + time ranges + past slot graying

- Slot labels show start–end time range (not just start)
- Past slots grayed out on today's date
- Sticky bar larger with higher z-index (above PostHog)
- Full mobile responsive: stacked layout, scrollable rooms, modal fits
- Multiselect toggle works on mobile"
```

---

## Task 7: Creatives Status — All Dept Members Can Change

**Files:**
- Modify: `src/app/api/creatives/content-items/route.ts`

**Root Cause:** PATCH uses user client which goes through `cci_update` RLS. Even though `is_ad_ops_access()` should allow creatives members, it may fail for some users. Fix: use admin client for PATCH (auth already validated).

- [ ] **Step 1: Switch PATCH handler to admin client**

In the PATCH handler, after auth check, use admin client for the update:

```typescript
const admin = createAdminClient();
const { error } = await admin
  .from("creative_content_items")
  .update(updates)
  .eq("id", id);
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/creatives/content-items/route.ts
git commit -m "fix(creatives): allow all dept members to change content status

PATCH uses admin client — RLS was blocking non-manager members."
```

---

## Task 8: Ad-Ops — Restrict Pause/Budget to Ad-Ops + Marketing + OPS

**Files:**
- Modify: `src/app/api/ad-ops/live-ads/route.ts`
- Modify: `src/app/api/ad-ops/live-ads/ad/route.ts`
- Modify: `src/app/api/ad-ops/live-ads/adset/route.ts`

**User requirement:** Only ad-ops + marketing departments (and OPS) can pause/resume/set budgets. Everyone else is view-only with sync.

- [ ] **Step 1: Add department guard to all three routes**

In each route file, after the existing `isManagerOrAbove` check, add:

```typescript
// Check department — only ad-ops + marketing can modify
if (!isOps(user!)) {
  const { data: dept } = await supabase
    .from("departments")
    .select("slug")
    .eq("id", user!.department_id)
    .maybeSingle();
  if (!["ad-ops", "marketing"].includes(dept?.slug ?? "")) {
    return NextResponse.json({ error: "Only ad-ops and marketing can modify live ads" }, { status: 403 });
  }
}
```

Add `isOps` to imports in each file.

Apply to:
- `route.ts` POST handler
- `ad/route.ts` POST handler
- `adset/route.ts` POST and PATCH handlers

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ad-ops/live-ads/route.ts src/app/api/ad-ops/live-ads/ad/route.ts src/app/api/ad-ops/live-ads/adset/route.ts
git commit -m "fix(ad-ops): restrict pause/budget to ad-ops + marketing depts

Only ad-ops, marketing, and OPS users can pause/resume campaigns
or set spend caps. Everyone else is view-only."
```

---

## Task 9: KOP Creation — Fix Constraint + Dropdown Categories

**Files:**
- Modify: `src/app/api/kops/route.ts`
- Modify: `src/app/(dashboard)/knowledgebase/kops/kops-view.tsx`

### 9A: Fix creation constraint violation

- [ ] **Step 1: Switch POST to admin client for inserts**

In `src/app/api/kops/route.ts`, use admin client for KOP + version inserts:

```typescript
const admin = createAdminClient();

// KOP insert
const { data: kop, error: kopErr } = await admin
  .from("kops")
  .insert({ ... })
  .select("id")
  .single();

// Version insert
const { error: versionErr } = await admin
  .from("kop_versions")
  .insert({ ... });

// Cleanup on upload failure
await admin.from("kops").delete().eq("id", kop.id);
```

### 9B: Category dropdown with predetermined list

- [ ] **Step 2: Replace freetext category with dropdown in kops-view.tsx**

Find the category input field in the create/edit form. Replace the text input with a select dropdown:

```tsx
const KOP_CATEGORIES = [
  "BAU",
  "Tools",
  "Process",
  "Guidelines",
  "Installation",
  "Troubleshooting",
  "Reference",
] as const;

// In the form:
<select
  value={category}
  onChange={(e) => setCategory(e.target.value)}
  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
>
  <option value="">Select category</option>
  {KOP_CATEGORIES.map((c) => (
    <option key={c} value={c}>{c}</option>
  ))}
</select>
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kops/route.ts src/app/(dashboard)/knowledgebase/kops/kops-view.tsx
git commit -m "fix(kops): fix creation error + category dropdown

- Admin client for KOP + version inserts (fixes constraint violation)
- Category is now a dropdown: BAU, Tools, Process, Guidelines,
  Installation, Troubleshooting, Reference"
```

---

## Task 10: News Feed — Reddit RSS + Auto-Fetch + Helper Text

**Files:**
- Modify: `src/app/api/smm/news/fetch/route.ts`
- Modify: `src/app/(dashboard)/marketing/news/news-view.tsx`

- [ ] **Step 1: Fix Reddit User-Agent + add Atom feed parsing**

In `fetch/route.ts`:

1. Detect Reddit URLs and use browser-compatible User-Agent:
```typescript
const isReddit = source.url.includes("reddit.com");
const headers: Record<string, string> = {
  "User-Agent": isReddit
    ? "Mozilla/5.0 (compatible; Avalon/1.0; +https://finncotton.com)"
    : "AvalonRSSBot/1.0",
};
```

2. Add Atom entry extraction for Reddit feeds:
```typescript
function extractAtomEntries(xml: string): RssItem[] {
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  return entries.map((entry) => ({
    title: extractBetween(entry, "title"),
    link: entry.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? "",
    description: (extractBetween(entry, "content") || extractBetween(entry, "summary"))
      .replace(/<[^>]+>/g, "").slice(0, 500),
    pubDate: extractBetween(entry, "updated") || extractBetween(entry, "published"),
    imageUrl: entry.match(/href="([^"]+\.(?:jpg|jpeg|png|gif|webp))"/i)?.[1] ?? null,
  }));
}
```

3. In the fetch loop, fall back to Atom parsing:
```typescript
let items = extractItems(xml);
if (items.length === 0) items = extractAtomEntries(xml);
```

- [ ] **Step 2: Auto-fetch after adding source + helper text**

In `news-view.tsx`:

1. In `handleAddSource`, after successful POST, trigger a fetch and reload:
```typescript
if (res.ok) {
  // ... existing success handling ...
  // Auto-fetch items from all sources (including the new one)
  await fetch("/api/smm/news/fetch", { method: "POST" });
  await loadNews(); // reload the news list
}
```

2. Add helper text above the URL input in the add source form:
```tsx
<p className="text-xs text-[var(--color-text-tertiary)]">
  Be sure to add the RSS feed link (e.g. .../feed or .../rss), not just the site URL
</p>
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/smm/news/fetch/route.ts src/app/(dashboard)/marketing/news/news-view.tsx
git commit -m "fix(news): Reddit RSS support + auto-fetch on source add

- Browser-compatible User-Agent for Reddit feeds
- Atom feed parsing fallback (Reddit uses Atom, not RSS)
- Auto-fetch items after adding a new source
- Helper text on form: use RSS link, not site URL"
```

---

## Task 11: Announcements — Profile Pic + Reaction Viewer

**Files:**
- Modify: `src/app/(dashboard)/communications/announcements/announcements-view.tsx`

**User requirements:**
1. Profile pictures not showing correctly on announcements
2. Long-press on a reaction emoji shows a mini popover listing who reacted with that emoji
3. Same behavior on birthday card reactions (Task 12)

- [ ] **Step 1: Fix profile picture display**

Check if `avatar_url` is being fetched and rendered for announcement authors and reactors. If the avatar component is using a different field or not falling back properly, fix it.

- [ ] **Step 2: Add reaction viewer popover**

For each reaction group (emoji + count), add an `onMouseDown`/long-press handler that shows a popover with the list of users who reacted:

```tsx
function ReactionBadge({ emoji, users }: { emoji: string; users: { name: string }[] }) {
  const [showWho, setShowWho] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  return (
    <span
      className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-sm cursor-pointer"
      onMouseDown={() => { timerRef.current = setTimeout(() => setShowWho(true), 400); }}
      onMouseUp={() => clearTimeout(timerRef.current)}
      onMouseLeave={() => { clearTimeout(timerRef.current); setShowWho(false); }}
      onTouchStart={() => { timerRef.current = setTimeout(() => setShowWho(true), 400); }}
      onTouchEnd={() => clearTimeout(timerRef.current)}
    >
      {emoji} {users.length}
      {showWho && (
        <div className="absolute bottom-full left-0 mb-1 p-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] z-50 min-w-[140px]">
          {users.map((u, i) => (
            <div key={i} className="text-xs text-[var(--color-text-secondary)] py-0.5">{u.name}</div>
          ))}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/communications/announcements/announcements-view.tsx
git commit -m "fix(announcements): profile pics + long-press reaction viewer

- Fix avatar display on announcements
- Long-press any reaction emoji to see who reacted"
```

---

## Task 12: Birthday Modal — Reaction Viewer

**Files:**
- Modify: `src/app/(dashboard)/people/birthdays/birthdays-view.tsx`

**Same pattern as Task 11** — add long-press reaction popover to birthday card message reactions.

- [ ] **Step 1: Add ReactionBadge component to birthdays-view.tsx**

Use the same `ReactionBadge` pattern from Task 11. Apply to emoji reactions on birthday card messages.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/people/birthdays/birthdays-view.tsx
git commit -m "fix(birthdays): long-press reaction viewer on birthday cards

Long-press any reaction emoji to see who reacted."
```

---

## Task 13: Learning — Preview Fix, Progress Views, Dept Scope, Assign

**Files:**
- Modify: `src/app/(dashboard)/knowledgebase/learning/page.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/learning/learning-tabs.tsx` (or learning-view.tsx)
- Possibly: `next.config.ts` (CSP headers)

**User requirements:**
1. Preview blocked by CSP ("Content is blocked, contact site admin") — fix iframe/embed CSP
2. Show tracking stats visibly (time spent, completion status)
3. **Contributors:** "Your Progress" — checklist of all materials (completed / not completed)
4. **Managers:** "Team Progress" — click on team member → see their checklist
5. **Managers with set dept:** auto-scope to own department, no department selector
6. **OPS+:** "Assign" button with smart people picker (dept-first, search expands)

- [ ] **Step 1: Fix CSP for PDF/doc previews**

Check `next.config.ts` for Content-Security-Policy headers. The `frame-src` directive may be blocking Supabase storage URLs. Add the Supabase storage domain to allowed frame sources:

```typescript
// In next.config.ts headers:
"frame-src 'self' https://*.supabase.co https://*.supabase.in"
```

- [ ] **Step 2: Use admin client for completions/views**

In page.tsx, change completions and views queries to use admin client (already imported):

```typescript
admin.from("learning_completions").select("material_id").eq("user_id", currentUser.id),
admin.from("learning_views").select("material_id, viewed_at, duration_s").eq("user_id", currentUser.id),
```

- [ ] **Step 3: Fetch team progress for managers**

For managers, also fetch all completions and active user count for team progress:

```typescript
const isManager = isManagerOrAbove(currentUser);
let teamData: { completions: any[]; users: any[] } = { completions: [], users: [] };
if (isManager) {
  const deptFilter = isOps(currentUser) ? {} : { department_id: currentUser.department_id };
  const [tc, tu] = await Promise.all([
    admin.from("learning_completions").select("user_id, material_id, completed_at"),
    admin.from("profiles").select("id, first_name, last_name, avatar_url")
      .eq("status", "active").is("deleted_at", null)
      .match(deptFilter),
  ]);
  teamData = { completions: tc.data ?? [], users: tu.data ?? [] };
}
```

Pass `isManager`, `isOps`, `teamData` to the view component.

- [ ] **Step 4: Add "Your Progress" section for contributors**

In the view, show a checklist of all materials with completed/not-completed status and view duration.

- [ ] **Step 5: Add "Team Progress" section for managers**

Click on a team member → shows their checklist. For managers with a department, hide the department selector (auto-scoped). For OPS, show all departments.

- [ ] **Step 6: Add "Assign" button for OPS+**

For OPS and above, add an assign button on each material that opens the smart people picker (department members first, search expands to all). Assigns material to selected users via a new or existing API.

- [ ] **Step 7: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 8: Commit**

```bash
git add src/app/(dashboard)/knowledgebase/learning/ next.config.ts
git commit -m "fix(learning): preview CSP fix, progress views, dept scope, assign

- Fix CSP to allow Supabase storage iframes for previews
- Your Progress checklist for contributors
- Team Progress with per-member checklist for managers
- Auto-scope to own department for managers (no dept selector)
- Assign button for OPS+ with smart people picker"
```

---

## Task 14: Creatives Dashboard — Team Visibility Fix

**Files:**
- Modify: `src/app/(dashboard)/creatives/dashboard/page.tsx`

**Root Cause:** Contributors only see themselves on the creatives dashboard (RLS). Cross-department visitors (OPS/marketing) may see their own department instead of creatives. Fix: always show creatives department members.

- [ ] **Step 1: Use admin client for department members fetch**

In page.tsx, fetch creatives department members via admin client, filtered by creatives department:

```typescript
const admin = createAdminClient();
const { data: creativesDept } = await admin
  .from("departments")
  .select("id")
  .eq("slug", "creatives")
  .single();

const { data: teamMembers } = await admin
  .from("profiles")
  .select("id, first_name, last_name, avatar_url")
  .eq("department_id", creativesDept?.id ?? "")
  .eq("status", "active")
  .is("deleted_at", null)
  .order("first_name");
```

Pass `teamMembers` to the view instead of the RLS-filtered query.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/creatives/dashboard/page.tsx
git commit -m "fix(creatives-dashboard): always show full creatives team

Contributors see all creatives members, not just themselves.
Cross-department visitors also see creatives team only."
```

---

## Task 15: Sales-Ops — Agents Visibility Fix

**Files:**
- Modify: `src/app/(dashboard)/sales-ops/weekly-agent-report/page.tsx`
- Modify: `src/app/(dashboard)/sales-ops/incentive-payouts/page.tsx`

**Root Cause:** Both pages fetch sales agents via user client. RLS blocks non-managers from seeing other agents. Fix: admin client.

- [ ] **Step 1: Weekly report — admin client for agents**

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

const admin = createAdminClient();
const { data: salesDept } = await admin
  .from("departments").select("id").eq("slug", "sales").single();

const { data: agents } = salesDept
  ? await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("department_id", salesDept.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name")
  : { data: [] };
```

- [ ] **Step 2: Incentive payouts — admin client for agents**

Same pattern as step 1 in the payouts page.

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/sales-ops/weekly-agent-report/page.tsx src/app/(dashboard)/sales-ops/incentive-payouts/page.tsx
git commit -m "fix(sales-ops): admin client for agents list

Agents dropdown was empty for non-managers due to profiles RLS."
```

---

## Deferred Feature Requests — Need Separate Plans

### Creatives Overhaul
- Tracker: "Assign to Live Post" button → picker from connected platforms (replaces transfer link)
- Tracker: week grouping (This Week / Last Week / Older) + search
- Tracker: multiple assignees + smart people picker (dept-first, search all)
- Tracker: week date selector = week range only (Mon-Sun)
- Requests: open to all departments (not just creatives/marketing)
- Requests: contextual tab name ("Request for Creatives" / "Submitted Creative Requests")
- Requests: bidirectional sync with Kanban (accept → create card, status syncs)
- Analytics: fix stats + content display on all platforms + per-content detail modal

### Executive & Analytics
- Overview: KPI Health at top, Revenue Day, Ad Spend, ROAS, attendance, # orders, channel revenue breakdown, calendar + look-ahead, CEO + Dev kanban
- Ad-Ops dashboard: CPLV/CPA/CPP/CPMR priority, Conversion | Messenger | Overall tabs, gender demographic spend per campaign, wire demographics into Live Campaigns page
- Sales dashboard: channel separation (Chat | Shopify | Marketplace | Store | Overall) + sidebar nav reorg
- Goals: KPI hub with "to be wired" / "standalone" tagging, dept scoping, negative ranking, dev progress tasklist

### Infrastructure
- Calendar system: static holidays (PH double-digit sales, local holidays, company events), shown on exec overview, smart look-ahead alerts
- Admin > Development: roadmap page, Pulse ticket → feature goal linking, progress tracking
- Leave workflow: 2-stage approval (approve → notify to file form → final sign-off), re-notify button
- Kanban redesign: visual polish, predetermined columns (can't delete), "Done" = KPI truth source
- Campaign metrics: Shopify-style delta arrows (green up / red down vs yesterday) on all metrics, contextual labels (conversion vs messenger)
