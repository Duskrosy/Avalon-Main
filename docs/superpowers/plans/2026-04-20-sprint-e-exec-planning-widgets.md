# Sprint E — Executive: CEO Planning Tab + Widget Pinning

**Date:** 2026-04-20
**Tickets:** #19 (CEO Planning tab — move planning widgets out of Overview), #20 (per-user widget pinning with iOS-style tile layout)
**Status:** Ready to implement

## Context

Current executive tabs (`src/app/(dashboard)/executive/tab-nav.tsx`):
- Overview, Sales, Ad Operations, Creatives, Marketing, People, Development

Current Overview (`page.tsx` ~560 lines):
- KPI summary cards, revenue, RAG signals, attendance card, calendar widget, look-ahead, CEO Planning embed (from `ceo-planning.tsx`), announcements, live ads panel

Component files already there: `ceo-planning.tsx`, `calendar-widget.tsx`, `attendance-card.tsx`, `date-range-bar.tsx`, `live-ads-panel.tsx`, `look-ahead.tsx`, `revenue-card.tsx`.

## Tickets

- **#19** — Move personal planning widgets (CEO Planning kanban, Calendar, Look-Ahead, Attendance) into a new **CEO Planning** tab. Overview stays high-level signals only.
- **#20** — Per-user widget pinning + rearrangement. iOS-inspired tile model: fixed grid of cells, widgets declare size (1x1, 1x2, 2x2), users drag to reposition, pin/unpin.

## Phase 1 — CEO Planning tab (ship first, low risk)

### Task 1 — Route + nav

**New file:** `src/app/(dashboard)/executive/planning/page.tsx` — server component.

**Edit:** `src/app/(dashboard)/executive/tab-nav.tsx` — add tab between Overview and Sales:
```ts
{ label: "Planning", href: "/executive/planning", icon: "🗓" },
```

Gate behind the same executive permission the other tabs use (check existing guard pattern in other tab pages).

### Task 2 — Move widgets into Planning page

**File:** `src/app/(dashboard)/executive/planning/page.tsx`

Compose:
- CeoPlanning (kanban summary) — full-width at top, wider than the cramped overview version.
- Calendar widget + LookAhead side-by-side below.
- AttendanceCard below that (personal daily attendance-like surface).
- DateRangeBar at top if the widgets use date filtering.

Fetch the same data that `page.tsx` currently fetches for these sections (copy the relevant queries — `ceoPlanningColumns`, `attendanceToday`, calendar events, look-ahead computation).

### Task 3 — Strip planning widgets from Overview

**File:** `src/app/(dashboard)/executive/page.tsx`

- Remove `<CeoPlanning />`, `<CalendarWidget />`, `<LookAhead />`, `<AttendanceCard />` sections.
- Remove their data fetches.
- Keep KPI summary, revenue, RAG signals, announcements, live ads panel — Overview becomes the executive "pulse" view, not the "workspace".
- Add a "View Planning →" link in the header.

### Task 4 — Persist a preference flag (optional soft landing)

Some users may prefer the old layout. Low-cost escape hatch: add a per-user toggle `show_planning_in_overview` (default false) via `user_preferences` table. Skip this if migrations 00050 already covers something similar — check `user_preferences` shape first. Punt if it adds too much scope.

## Phase 2 — Widget pinning + iOS tile layout (#20)

### Migration

**File:** `supabase/migrations/00067_dashboard_widget_layout.sql` (adjust number to follow sprints actually shipped)

```sql
CREATE TABLE public.dashboard_widget_layouts (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dashboard   text NOT NULL,  -- 'executive_overview' | 'executive_planning' | 'creatives_dashboard' ...
  widget_key  text NOT NULL,  -- stable identifier e.g. 'ceo_planning', 'calendar', 'revenue_card'
  pinned      boolean NOT NULL DEFAULT true,
  grid_x      integer NOT NULL DEFAULT 0,
  grid_y      integer NOT NULL DEFAULT 0,
  size_w      integer NOT NULL DEFAULT 1 CHECK (size_w IN (1, 2, 3, 4)),
  size_h      integer NOT NULL DEFAULT 1 CHECK (size_h IN (1, 2, 3)),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dashboard, widget_key)
);

ALTER TABLE public.dashboard_widget_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY dwl_sel ON public.dashboard_widget_layouts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY dwl_ins ON public.dashboard_widget_layouts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY dwl_upd ON public.dashboard_widget_layouts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY dwl_del ON public.dashboard_widget_layouts FOR DELETE TO authenticated USING (user_id = auth.uid());
```

### Task 5 — Widget registry + layout engine

**New file:** `src/lib/dashboards/widget-registry.ts`

```ts
export type WidgetDefinition = {
  key: string;
  label: string;
  default_size: { w: number; h: number };
  default_pinned: boolean;
  render: (props: WidgetProps) => ReactNode; // lazy-loaded component
};

export const EXEC_PLANNING_WIDGETS: WidgetDefinition[] = [
  { key: 'ceo_planning',  label: 'CEO Planning',  default_size: { w: 4, h: 2 }, default_pinned: true, render: ... },
  { key: 'calendar',      label: 'Calendar',       default_size: { w: 2, h: 2 }, default_pinned: true, render: ... },
  { key: 'look_ahead',    label: 'Look Ahead',     default_size: { w: 2, h: 1 }, default_pinned: true, render: ... },
  { key: 'attendance',    label: 'Attendance',     default_size: { w: 2, h: 1 }, default_pinned: true, render: ... },
];
```

**New file:** `src/components/dashboards/tile-grid.tsx` (client component)

- CSS grid: `grid-template-columns: repeat(4, 1fr)`, fixed row height ~180px, gap.
- Each widget renders inside a `<TileCell>` that reads its x/y/w/h from a layout prop.
- Uses `@dnd-kit/core` for drag-to-rearrange (project already uses dnd-kit for kanban — check package.json). On drop: optimistic state update + PATCH to `/api/dashboard-layout`.
- Long-press / edit-mode toggle reveals pin/unpin + resize handles (iOS home-screen pattern: "jiggle mode").
- Unpinned widgets are available in a "Widget drawer" (bottom sheet) users drag back in.

### Task 6 — API route

**New file:** `src/app/api/dashboard-layout/route.ts`

- `GET ?dashboard=executive_planning` — returns this user's overrides merged with defaults: `{ widgets: [{ key, pinned, x, y, w, h }] }`.
- `PATCH` body: `{ dashboard, updates: [{ widget_key, pinned?, grid_x?, grid_y?, size_w?, size_h? }] }` — upsert per widget_key via `onConflict: 'user_id,dashboard,widget_key'`.

### Task 7 — Wire Planning page to tile grid

**File:** `src/app/(dashboard)/executive/planning/page.tsx`

- Server-fetch current user's layout for `dashboard='executive_planning'`.
- Merge with `EXEC_PLANNING_WIDGETS` defaults.
- Pass to `<TileGrid widgets={merged} dashboard="executive_planning" />`.
- Render an "Edit layout" toggle in the header (enters jiggle mode).

### Task 8 — Reset + drawer UX

- "Reset to default" button in edit mode → DELETE all rows for this user+dashboard.
- Widget drawer lists default + any unpinned widgets users want back.

## Verification

**Phase 1:**
1. New `/executive/planning` tab visible. Overview no longer shows CEO Planning / Calendar / Look-Ahead / Attendance.
2. Planning page shows all 4 widgets with live data.
3. Non-executive users hitting `/executive/planning` are redirected/blocked same as other exec tabs.

**Phase 2:**
1. On `/executive/planning`, click "Edit layout". Widgets jiggle.
2. Drag CEO Planning to a different grid slot. Reload page — position persists.
3. Unpin Look-Ahead. It disappears from grid and appears in drawer.
4. Drag it back from drawer. Confirms re-pins.
5. Resize a widget from 2x1 to 4x1. Persists.
6. "Reset to default" restores original layout.
7. Second user sees their own layout (not first user's).

## Out of scope

- Applying layout engine to Creatives/Sales/other dashboards (wire same engine later — registry is ready).
- Mobile drag-resize (phase 2 can ship desktop-first; tablets OK).
- Sharing/exporting layouts between users.
- "Hide widget entirely" vs just "unpin" (treat them the same for now).
