# Sprint G — Creatives Surface Restructure

**Date:** 2026-04-20
**Tickets:** #5 (Creatives Dashboard → true landing page), #3 (Analytics → Live / Recent / Historical + Posted Content split), #15 (Ads vs Organic separation), #21 (Assign Post flow integration in Tracker)
**Status:** Heavy lift — ship after Sprints A–F stabilize. Highest blast radius.

## Context

Current creatives routes:
- `/creatives/dashboard` (`dashboard-view.tsx`, 651 lines)
- `/creatives/analytics` (`analytics-view.tsx`, 959 lines — mixed live/recent/historical, ads + organic conflated)
- `/creatives/content` (`content-view.tsx` — content item browse)
- `/creatives/tracker` (`tracker-view.tsx`, 1305 lines — kanban-like assignment view)
- `/creatives/requests` (intake form + requests board)

Foundation shipped:
- `creative_type` taxonomy (migrations 00063/00064)
- `CREATIVE_GROUPS` constant in `src/lib/constants.ts`
- `smm_posts` table with scheduled/published lifecycle
- Kanban auto-card creation on ad-request accept
- Multi-assignee junction table (from Sprint A)

## Workstream principles (from brainstorm summary)

- **Dashboard** = mission control / weekly pulse
- **Analytics** = data / performance
- **Posted Content** = content-level performance browsing
- **Tracker** = operational assignment flow
- **Requests** = intake + state management

Don't let one page do everything. Each page has one job.

---

## Phase 1 — #5 Creatives Dashboard rework

### Task 1 — Strip analytics bloat from dashboard

**File:** `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx`

Audit current sections. Keep only:
- Team roster + avatars (the avatar sync target from Sprint A)
- This week's scheduled content (count + list)
- Requests in flight (count + list, linked to `/creatives/requests`)
- Tracker snapshot: counts per funnel stage, "my assignments" quick view
- Quick actions: "New request", "Open Tracker", "Open Analytics"

Move out (to Analytics / Posted Content):
- Performance charts
- Historical comparisons
- Per-platform engagement heatmaps

Target: under 350 lines, no Supabase-heavy fetches beyond counts.

### Task 2 — Mission-control layout

- Top hero: "Week of [date range]" + 3 KPI tiles (content published this week, scheduled next 7 days, overdue requests).
- Body grid: team roster left, in-flight requests center, tracker snapshot right.
- Footer: announcements specific to creatives department.

---

## Phase 2 — #3 Analytics restructure + Posted Content split

### Task 3 — New Analytics IA

**Files:** rename or split `src/app/(dashboard)/creatives/analytics/` into tabs.

New structure inside `/creatives/analytics`:
- Tab 1: **Live** — currently-running ads (from `smm_posts` where status='published' AND has associated live ad) + active scheduled posts in next 48h
- Tab 2: **Recent** — last 30 days of published content with engagement summary
- Tab 3: **Historical** — full archive with date-range selector, cohort comparisons

**Split Posted Content out entirely:**
- Move content-item performance browser (individual post metrics table) to `src/app/(dashboard)/creatives/posted-content/page.tsx` — deep-link from Analytics "see item detail".

### Task 4 — Tab navigation + URL state

Use `?tab=live|recent|historical` with default to `live`. Server-component page.tsx dispatches based on tab param.

### Task 5 — Extract shared metric widgets

Current `analytics-view.tsx` at 959 lines has duplicate chart/table rendering. Extract:
- `<EngagementSummaryCard>`
- `<PlatformBreakdownChart>`
- `<PostsTable>` (filter by date range + platform + type)

Place in `src/app/(dashboard)/creatives/_components/`. Tabs compose these.

---

## Phase 3 — #15 Ads vs Organic separation

### Task 6 — Content type filter built into every analytics view

Every analytics tab gets a top-level filter: `All | Ads | Organic`.

Data model:
- A post is "Ads" if it has an associated `ad_requests` row or `ads_campaign_id`.
- Otherwise "Organic".

Filter logic:
```sql
-- Ads
SELECT sp.* FROM smm_posts sp
JOIN ad_requests ar ON ar.linked_post_id = sp.id
WHERE <range>

-- Organic
SELECT sp.* FROM smm_posts sp
LEFT JOIN ad_requests ar ON ar.linked_post_id = sp.id
WHERE ar.id IS NULL AND <range>
```

### Task 7 — Dedicated "Live Ads" sub-view under Live tab

Within Analytics → Live tab, split into two collapsible panels:
- **Live Ads** — pulls from the existing Live Ads panel (migration 00057 demographics). Reuse `<LiveAdsPanel>` component.
- **Live Organic** — posts currently live/scheduled in next 48h, no ad association.

### Task 8 — Posted Content page respects the filter

On `/creatives/posted-content`: same `All | Ads | Organic` filter. Persist via URL.

---

## Phase 4 — #21 Assign Post flow integration in Tracker

Remaining scope per brainstorm: "post-gathering integration + assignment restructure". The tracker already has `linked_post_id` + multi-assignee — what's missing is making assignment drive post gathering.

### Task 9 — "Gather post" action per tracker card

**File:** `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`

For tracker rows in `scheduled` or `published` stage with `linked_post_id IS NULL`:
- Show a "Gather post" button.
- Opens a modal listing recent `smm_posts` (last 14 days) filtered by platform + assignee.
- User selects a post → PATCH the content item with `linked_post_id`.
- Once linked: row shows post thumbnail + engagement pill (likes / comments / reach).

### Task 10 — Assignment drives post expectation

When a content item is assigned and moves to `in_production` or later:
- Show a "Post status" column: Awaiting → Gathered ✓
- Awaiting means no `linked_post_id` yet
- Gathered means linked + engagement pulled

### Task 11 — Restructure assignment logic

Current: `assigned_to` single column + new `assignees[]` junction.
After Sprint A, multi-assignee works. Now:
- Deprecate the `assigned_to` single column (keep for backward-compat reads, stop writing).
- All new assignments write to the junction table only.
- Tracker filter by assignee uses junction.
- Update `dashboard-view.tsx` "my assignments" to query junction.

### Task 12 — Auto-gather for ad requests

When an ad request moves to `published` status (from the existing flow) and already has a `linked_post_id` on the kanban side, auto-populate that same `linked_post_id` on the tracker content item. Saves manual gather step.

---

## Migration

**File:** `supabase/migrations/00068_creatives_restructure.sql` (adjust number)

```sql
-- Track when a content item's linked post was gathered (UX: show "just linked" pulse)
ALTER TABLE public.content_items
  ADD COLUMN linked_post_gathered_at timestamptz;

-- Index for assignee junction lookups
CREATE INDEX IF NOT EXISTS content_item_assignees_assignee_idx
  ON public.content_item_assignees(assignee_id);

-- If assignees junction doesn't exist yet (depends on Sprint A naming), create it:
-- (Check Sprint A's ad_request_assignees — we may need a separate content_item_assignees)
CREATE TABLE IF NOT EXISTS public.content_item_assignees (
  content_item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  assignee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_item_id, assignee_id)
);

ALTER TABLE public.content_item_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY cia_sel ON public.content_item_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY cia_ins ON public.content_item_assignees FOR INSERT TO authenticated WITH CHECK (public.is_ops() OR public.is_manager_or_above(auth.uid()));
CREATE POLICY cia_del ON public.content_item_assignees FOR DELETE TO authenticated USING (public.is_ops() OR public.is_manager_or_above(auth.uid()));
```

Confirm `is_manager_or_above` function exists before using (or substitute the correct helper).

---

## Verification

**Phase 1:**
1. `/creatives/dashboard` loads fast, no chart renders. Shows roster, requests, tracker snapshot.
2. Lines in `dashboard-view.tsx` drop significantly (~350 or less).

**Phase 2:**
1. `/creatives/analytics?tab=live` shows only live/upcoming content.
2. `?tab=recent` → last 30 days.
3. `?tab=historical` → date-range selector works.
4. `/creatives/posted-content` exists as standalone, deep-linked from Analytics row click.

**Phase 3:**
1. `All | Ads | Organic` filter works on all three analytics tabs and posted-content page.
2. Live tab Ads panel pulls from existing Live Ads component.

**Phase 4:**
1. Tracker row without `linked_post_id` shows "Gather post" button.
2. Modal lets user pick from recent posts. Link saves.
3. Assignee filter in Tracker uses junction table.
4. Ad request published → tracker row auto-populates `linked_post_id`.

## Risk + ship strategy

- Do NOT ship this as one PR. Split into:
  - **PR 1** — Phase 1 (dashboard rework, least blast radius)
  - **PR 2** — Phase 2 (analytics IA + posted content split)
  - **PR 3** — Phase 3 (ads/organic filter)
  - **PR 4** — Phase 4 + migration (assign post flow)
- Run `gitnexus_impact` on `analytics-view.tsx`, `tracker-view.tsx`, `dashboard-view.tsx` before editing each — all three are likely to be touched by other plans.
- Check callers of `CREATIVE_GROUPS` and `content_items` before changing their shapes.

## Out of scope

- Cross-department content sharing (e.g. marketing embedding creatives analytics).
- Automated post-gather (e.g. cron that pulls from Meta every hour) — manual gather stays.
- New chart types. Reuse what exists.
- Rethinking Requests intake form (covered separately).
- Mobile re-layout of tracker (kanban already handles it).
