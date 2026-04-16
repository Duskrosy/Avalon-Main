# Creatives Module Overhaul — Design Spec

**Date:** 2026-04-16
**Author:** Gavril (requirements) + Claude (design)
**Status:** Approved

## Goal

Overhaul the Creatives module based on user feedback: enhance the Tracker with week grouping, live post linking, and multi-assignee support; open creative requests to all departments with bidirectional kanban sync; fix the analytics page data pipeline and add per-content detail modals.

---

## 1. Tracker Enhancement

### 1A. Assign to Live Post

**What:** Each content item row gets an "Assign Post" button. Clicking opens a picker modal showing recent published posts from connected platforms.

**Data flow:**
- Posts already fetched by `page.tsx` from `smm_posts` (published, last 100, ordered by published_at desc)
- Picker modal groups posts by platform (Facebook | Instagram | TikTok | YouTube)
- Each post shows: platform icon, caption preview (truncated ~80 chars), publish date
- Selecting a post calls `PATCH /api/creatives/content-items` with `{ id, linked_post_id: postId }`
- This also clears `transfer_link` on the item (replaced by the direct link)
- `transfer_link` field moves out of the inline row into the edit modal as a fallback for external URLs

**UI:** Button at the end of each row labeled "Assign Post" (or a link icon). Opens a modal with platform tabs and a search/filter within each tab.

### 1B. Week Grouping

**What:** The tracker view groups items into collapsible sections based on `planned_week_start`.

**Sections:**
- "This Week" — `planned_week_start` falls in current Mon–Sun range
- "Last Week" — previous Mon–Sun
- "Older" — everything before last week
- "Unscheduled" — items where `planned_week_start` is null

**Week picker:** The `planned_week_start` date input in create/edit form becomes a week-range picker. Selecting any day in a week sets the value to that week's Monday. Display shows "Mon DD – Sun DD" format.

**Sorting:** Within each section, items sorted by status (in-progress first, then by created_at desc).

### 1C. Search

**What:** Search bar at the top of the tracker that filters across:
- `title`
- Assignee name(s)
- `campaign_label`
- `product_or_collection`

Case-insensitive substring match. Filters across all week sections simultaneously.

### 1D. Multiple Assignees

**Schema change:** New migration creates a junction table:

```sql
CREATE TABLE public.content_item_assignees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES public.creative_content_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);

CREATE INDEX idx_cia_item ON public.content_item_assignees(item_id);
CREATE INDEX idx_cia_user ON public.content_item_assignees(user_id);
```

RLS: `is_ad_ops_access()` for SELECT/INSERT/DELETE.

**Migration strategy:** Keep existing `assigned_to` column for backward compatibility. On first load, if an item has `assigned_to` set but no rows in the junction table, auto-populate. New creates/edits write to the junction table. The `assigned_to` column is deprecated but not removed.

**API changes:**
- `GET`: Include `assignees:content_item_assignees(user_id, profile:profiles!user_id(id, first_name, last_name, avatar_url))` in the select
- `POST/PATCH`: Accept `assignee_ids: string[]`. After insert/update, sync the junction table (delete removed, insert added)

### 1E. Smart People Picker (Reusable Component)

**What:** A multi-select people picker component used in Tracker, Kanban, and future assign buttons.

**File:** `src/components/ui/people-picker.tsx`

**Behavior:**
- Props: `value: string[]`, `onChange: (ids: string[]) => void`, `departmentId?: string`, `allUsers: User[]`
- Default view: shows users from `departmentId` first (with avatars + names)
- Search input: typing filters across ALL users (first_name + last_name), not just department
- Selected users shown as avatar chips above the dropdown
- Click to add/remove
- Accessible: keyboard navigation, focus management

**Used in:**
- Tracker create/edit modal (assignees)
- Kanban card assignee picker (replace existing picker)
- Future: learning assign, request assignee

---

## 2. Requests Overhaul

### 2A. Open to All Departments

**RLS migration:**
```sql
-- Allow all authenticated users to view and submit requests
DROP POLICY IF EXISTS ar_select ON public.ad_requests;
DROP POLICY IF EXISTS ar_insert ON public.ad_requests;

CREATE POLICY ar_select ON public.ad_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY ar_insert ON public.ad_requests
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE stays restricted: only creatives/marketing/ad-ops can manage
-- DELETE stays restricted: manager+ only
```

### 2B. Nav Visibility

Add "Request for Creatives" as a nav item visible to ALL departments. Place it in a location accessible from the sidebar regardless of department. Options:
- Add to every department's nav group (noisy)
- Add as a top-level "Services" item (cleaner)
- Keep under creatives group but make it visible to all via permission override

**Decision:** Keep under Creatives group in nav but override the permission check for this specific item so all authenticated users can see it. The route `/creatives/requests` stays the same.

### 2C. Contextual UI

**Non-creatives visitors:**
- Page title: "Request for Creatives"
- See only: their own submitted requests + a "New Request" button
- Submit form: title, description, target_date, attachments
- Can view status of their requests (read-only)

**Creatives department:**
- Page title: "Submitted Creative Requests"
- See: ALL requests (full queue)
- Can change status, assign to team members, add notes
- Fulfillment transitions: submitted → in_progress → review → approved/rejected

### 2D. Bidirectional Kanban Sync

**New column on ad_requests:**
```sql
ALTER TABLE public.ad_requests ADD COLUMN linked_card_id uuid REFERENCES public.kanban_cards(id) ON DELETE SET NULL;
```

**Request → Kanban (on accept):**
- When a creatives member changes status to `in_progress`, auto-create a kanban card on the creatives team board (first column)
- Card title: `[Request] {request.title}`
- Store `linked_card_id` on the request row

**Status mapping:**
| Request Status | Kanban Column |
|---------------|---------------|
| in_progress | First column (To Do / Backlog) |
| review | Second-to-last column (Review) |
| approved | Last column (Done) |

**Kanban → Request (on card move):**
- When a linked kanban card moves to a new column, determine the target status from the column position and update the request
- This requires the kanban card move handler to check for a linked request and call `PATCH /api/ad-ops/requests`

**Edge cases:**
- If the kanban card is deleted, `linked_card_id` is SET NULL (FK constraint handles this)
- If the request is cancelled/rejected, the linked kanban card stays (user can clean up manually)

---

## 3. Analytics Fix

### 3A. Data Pipeline Debug

**Root cause investigation:**
- Analytics page uses user client for `smm_groups` query — RLS may filter for non-ad-ops users
- `AnalyticsView` likely fetches data client-side from `/api/smm/analytics` or similar
- API routes may use user client which goes through RLS

**Fix:**
- Switch `page.tsx` groups query to admin client
- Check all API routes used by analytics-view.tsx and ensure they use admin client for data that should be visible to authorized users
- The page already restricts access to creatives/marketing/ad-ops/OPS — so admin client for data fetching is safe

### 3B. Per-Content Detail Modal

**What:** Clicking any post/content in the analytics grid opens a modal with platform-specific stats.

**Data source:** `smm_analytics` table filtered by post ID, or direct Meta/TikTok API call for fresh data.

**Stats by platform:**
- **Facebook:** Reach, Impressions, Engagement (likes + comments + shares), Link clicks, Video views
- **Instagram:** Reach, Impressions, Likes, Comments, Saves, Shares
- **TikTok:** Views, Likes, Comments, Shares, Average watch time
- **YouTube:** Views, Likes, Comments, Watch time, Subscribers gained

**Modal layout:** Platform icon + post caption at top, stats in a clean grid below, chart showing engagement over time if historical data available.

### 3C. Multi-Platform Resilience

- Each platform's data loads independently — one failing doesn't hide others
- Show per-platform error/loading states
- TikTok: verify token refresh at `/api/tiktok/connect` works
- Instagram: data comes through Meta API (same as Facebook)

---

## Schema Changes Summary

**New migration `00054_creatives_overhaul.sql`:**
1. `content_item_assignees` junction table with RLS
2. `ad_requests.linked_card_id` column (nullable FK to kanban_cards)
3. Broaden `ar_select` and `ar_insert` RLS to all authenticated users

**No breaking changes** — existing `assigned_to` column stays, new junction table is additive.

---

## Files Affected

### New
- `src/components/ui/people-picker.tsx` — Reusable smart people picker
- `supabase/migrations/00054_creatives_overhaul.sql` — Schema changes

### Modified
- `src/app/(dashboard)/creatives/tracker/page.tsx` — Fetch assignees from junction table
- `src/app/(dashboard)/creatives/tracker/tracker-view.tsx` — Week grouping, search, assign-to-post modal, multi-assignee UI, people picker
- `src/app/api/creatives/content-items/route.ts` — Handle assignee_ids in POST/PATCH, include assignees in GET
- `src/app/(dashboard)/creatives/requests/page.tsx` — Contextual title, open to all depts
- `src/app/(dashboard)/creatives/requests/requests-view.tsx` (or inline) — Contextual UI for creatives vs non-creatives
- `src/app/api/ad-ops/requests/route.ts` — Auto-create kanban card on accept, handle linked_card_id
- `src/lib/permissions/nav.ts` — Make requests page visible to all
- `src/app/(dashboard)/creatives/analytics/page.tsx` — Admin client for groups
- `src/app/(dashboard)/creatives/analytics/analytics-view.tsx` — Per-content detail modal, error states per platform
- `src/app/(dashboard)/productivity/kanban/kanban-board.tsx` — On card move, sync linked request status
