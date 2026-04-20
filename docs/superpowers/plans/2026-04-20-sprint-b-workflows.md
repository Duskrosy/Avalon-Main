# Sprint B — Workflow Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two workflow-quality tickets — OPS-managed company holidays on the calendar, and SmartPerson filter + today-first default on the Observability Activity tab.

**Architecture:** Neither task requires new tables. `calendar_events` already exists (migration 00055) with `event_type = 'holiday'` support and the calendar page already renders holidays. This sprint adds the OPS CRUD UI and API for holidays, and swaps the native actor dropdown in Activity for the existing `PeoplePicker` component.

**Tech Stack:** Next.js 16 App Router, Supabase (admin client for writes, server client for reads), TypeScript, Tailwind CSS with CSS variables, existing `PeoplePicker` (`src/components/ui/people-picker.tsx`), `date-fns`.

**Tickets covered:**
- #1 Add OPS-managed company holidays via Calendar settings
- #6 Use SmartPerson search/filter in Observability Activity and default to today-first sorting

**Not covered (already shipped):**
- #17 Auto-create and sync Kanban card on creative request accept — fully implemented in `src/app/api/ad-ops/requests/route.ts` (lines 96-130). Status flip to `in_progress` creates a card in the Creatives team board's first column and writes the id back to `ad_requests.linked_card_id`. Verify during QA pass.

---

## Existing State

**Calendar events (`supabase/migrations/00055_kpi_calendar.sql`):**
- Table `calendar_events` with columns: `id, title, event_date, end_date, event_type, is_recurring, recurrence_rule, created_at`
- Supported `event_type` values include `'holiday'` and `'sale_event'`
- RLS: all authenticated users can SELECT; `public.is_ops()` required to INSERT
- Calendar page (`src/app/(dashboard)/productivity/calendar/page.tsx`) already reads holidays with yearly-recurrence expansion — see lines 162-196

**Calendar UI (`src/app/(dashboard)/productivity/calendar/calendar-view.tsx`):**
- Has settings form for show/hide toggles (tasks/leaves/rooms/birthdays/posts)
- No CRUD surface for editing `calendar_events` rows
- Current settings persist via `POST /api/calendar/settings` (user-scoped toggles only)

**Observability Activity (`src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx` — 479 lines):**
- State includes `selectedUser: string` (actor filter), `days: number = 30`, `moduleFilter`, `typeFilter`
- Actor filter is almost certainly a native `<select>` — needs grep to confirm shape
- Default sort is `sortCol = "time"` and `sortDir = "desc"` → newest first, which is implicitly today-first
- "Default to today-first sorting" from the ticket most likely means **default `days = 1`** not `30`, so a fresh load of the tab shows today's activity only
- Sortable headers (time/user/page/module) already shipped via `observability-upgrades` plan

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/app/api/calendar/events/route.ts` | `GET` (list holidays + sale events) + `POST` (OPS create) |
| `src/app/api/calendar/events/[id]/route.ts` | `PATCH` (OPS update) + `DELETE` (OPS remove) |
| `src/app/(dashboard)/admin/calendar-events/page.tsx` | OPS-only server page — fetch + pass to view |
| `src/app/(dashboard)/admin/calendar-events/events-view.tsx` | Client component — table + create/edit modal for holidays and sale events |

### Modified files

| File | Changes |
|------|---------|
| `src/lib/permissions/nav.ts` | Add "Calendar Events" entry under the Admin section (OPS only) |
| `src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx` | Swap actor `<select>` for `<PeoplePicker single>`; change default `days` state from `30` to `1`; pre-fetch users for picker |
| `src/app/api/obs/activity/route.ts` | Verify returns `users[]` with shape compatible with `PickerUser` (`id`, `first_name`, `last_name`, `avatar_url`, `department_id`) — add fields if missing |

### No changes required

| File | Reason |
|------|--------|
| `supabase/migrations/*` | `calendar_events` table already exists with holiday support |
| `src/app/(dashboard)/productivity/calendar/page.tsx` | Already queries and renders holidays |
| `src/app/api/ad-ops/requests/route.ts` | Kanban sync on accept already live |

---

## Tasks

### Task 1 — #1.1 Calendar events API

**Why:** The `calendar_events` table is already live and the calendar page already consumes it, but there's no HTTP surface for creating or editing holidays. OPS currently has to write SQL.

**Files:**
- Create: `src/app/api/calendar/events/route.ts`
- Create: `src/app/api/calendar/events/[id]/route.ts`

- [ ] **Step 1: Define the zod schema**

In a shared spot near the top of `route.ts`:

```ts
import { z } from "zod";

const calendarEventSchema = z.object({
  title: z.string().min(1).max(200),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  event_type: z.enum(["holiday", "sale_event"]),
  is_recurring: z.boolean().default(false),
  recurrence_rule: z.enum(["yearly"]).optional().nullable(),
});
```

- [ ] **Step 2: `GET /api/calendar/events`**

List all rows. All authenticated users can read (RLS allows it). No query params needed for v1 — UI filters client-side.

```ts
const { data, error } = await supabase
  .from("calendar_events")
  .select("id, title, event_date, end_date, event_type, is_recurring, recurrence_rule, created_at")
  .order("event_date", { ascending: true });
```

- [ ] **Step 3: `POST /api/calendar/events` — OPS only**

Validate with zod, check `isOps(user)` explicitly in the handler (RLS also enforces it, but early check gives a cleaner 403).

```ts
if (!isOps(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

const parsed = calendarEventSchema.safeParse(await req.json());
if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

const { data, error } = await createAdminClient()
  .from("calendar_events")
  .insert(parsed.data)
  .select()
  .single();
```

- [ ] **Step 4: `PATCH /api/calendar/events/[id]` — OPS only**

Partial update using `calendarEventSchema.partial()`. Use admin client.

- [ ] **Step 5: `DELETE /api/calendar/events/[id]` — OPS only**

Hard delete. No soft-delete — holidays are cheap to recreate.

- [ ] **Step 6: Manual test**

`curl` each endpoint as OPS and non-OPS user. Non-OPS must get 403 on POST/PATCH/DELETE.

---

### Task 2 — #1.2 OPS Calendar Events admin page

**Why:** OPS needs a CRUD surface to manage holidays and sale events without writing SQL. Lives under `/admin/calendar-events` so it's discoverable from the admin nav.

**Files:**
- Create: `src/app/(dashboard)/admin/calendar-events/page.tsx`
- Create: `src/app/(dashboard)/admin/calendar-events/events-view.tsx`
- Modify: `src/lib/permissions/nav.ts`

- [ ] **Step 1: Server page.tsx**

```tsx
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { EventsView } from "./events-view";

export default async function CalendarEventsAdminPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  if (!isOps(user)) redirect("/");

  const { data: events } = await supabase
    .from("calendar_events")
    .select("id, title, event_date, end_date, event_type, is_recurring, recurrence_rule, created_at")
    .order("event_date", { ascending: true });

  return <EventsView initialEvents={events ?? []} />;
}
```

- [ ] **Step 2: `events-view.tsx` — table + modal**

Client component with:
- Filter chips: `All`, `Holidays`, `Sale events`
- Table columns: Title, Date (+ end_date if range), Type, Recurring?, Actions (Edit / Delete)
- "Add event" button opens modal
- Modal fields: title (required), event_type (select: holiday / sale_event), event_date (required), end_date (optional), is_recurring (checkbox — when checked, shows `recurrence_rule` select with `yearly` as only option)
- Submit via `fetch('/api/calendar/events', ...)` with optimistic local state update

Follow the existing UX pattern from `src/app/(dashboard)/admin/observability/obs-dashboard.tsx` (CSS-variable theming, `rounded-[var(--radius-lg)]`, etc.).

- [ ] **Step 3: Wire nav entry**

In `src/lib/permissions/nav.ts`, find the existing Admin section and add:

```ts
{ href: "/admin/calendar-events", label: "Calendar Events", opsOnly: true }
```

(Use whatever shape the existing entries follow — copy from a nearby entry.)

- [ ] **Step 4: Manual test**

Load as OPS. Add a holiday dated today. Visit `/productivity/calendar` — it should appear on today's cell in red (holiday color). Edit its title. Delete it. Confirm it vanishes from the calendar.

---

### Task 3 — #6 SmartPerson filter + today-first default in Activity

**Why:** Current actor filter is a native `<select>` dropdown. When the team is 50+ people the list is unsearchable. `PeoplePicker` already exists and is used elsewhere (Creatives Requests assign, Kanban card assign). Also the tab loads 30 days of activity on first visit — the ticket wants today-first default so the fresh view is lean.

**Files:**
- Modify: `src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx`
- Verify: `src/app/api/obs/activity/route.ts`

- [ ] **Step 1: Verify API returns picker-compatible users**

Open `src/app/api/obs/activity/route.ts`. The response includes a `users: [...]` array — confirm each row has `id`, `first_name`, `last_name`. Add `avatar_url` and `department_id` to the select if missing. The `PickerUser` type in `people-picker.tsx`:

```ts
type PickerUser = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  department_id?: string | null;
};
```

- [ ] **Step 2: Change default `days` from 30 to 1**

In `activity-tab.tsx` line ~136:

```ts
const [days, setDays] = useState<number>(1); // was 30
```

Keep the days selector UI — user can still expand the window.

- [ ] **Step 3: Swap actor `<select>` for `PeoplePicker`**

Find the existing user filter (grep `selectedUser` in the JSX). Replace with:

```tsx
import { PeoplePicker } from "@/components/ui/people-picker";

<PeoplePicker
  value={selectedUser ? [selectedUser] : []}
  onChange={(ids) => setSelectedUser(ids[0] ?? "")}
  allUsers={data.users}
  currentDeptId={currentUser.department_id ?? null}
  placeholder="Filter by person…"
  single
/>
```

`currentUser` isn't currently passed into the tab — add it as a prop from `obs-dashboard.tsx` (the parent) which already has access to the current user from its server page.

- [ ] **Step 4: Clear button**

Next to the picker, render a small "Clear" button when `selectedUser` is set, which calls `setSelectedUser("")`.

- [ ] **Step 5: Manual test**

Load `/admin/observability` → Activity tab. Confirm:
- Only today's events visible on first load
- PeoplePicker dropdown shows same-dept users first, then others
- Search narrows the list
- Selecting a user filters the feed
- Clearing resets
- Expanding `days` selector back to 7 / 30 still works

---

## Verification Checklist

- [ ] OPS can add/edit/delete calendar events from `/admin/calendar-events`
- [ ] Non-OPS user gets 403 on POST/PATCH/DELETE to `/api/calendar/events`
- [ ] Non-OPS user does not see "Calendar Events" in the nav
- [ ] New holiday appears on the calendar grid for all users immediately (after page reload)
- [ ] Observability Activity tab defaults to today-only on fresh load
- [ ] PeoplePicker replaces the actor dropdown, supports search, same-dept-first ordering
- [ ] #17 verification: mark a creative request as `in_progress` and confirm a card appears in the Creatives team board's first column

## Commit hygiene

One commit per task:
- `feat(calendar): api for OPS-managed calendar events (holidays, sale events)`
- `feat(admin): /admin/calendar-events CRUD page for OPS`
- `feat(obs): SmartPerson filter and today-first default on Activity tab`

## Post-ship

Archive this plan to `docs/superpowers/plans/archive/` once shipped. Update the Obsidian execution report's "Shipped Since 2026-04-15" section with the new commits. Ticket #17 can be moved into the "Shipped" section with a note that it was already live before Sprint B.
