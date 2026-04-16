# KPI Framework + Executive Overview — Design Spec

**Date:** 2026-04-16
**Author:** Gavril (requirements) + Claude (design)
**Status:** Approved

## Goal

Restructure the KPI system to support wiring status tracking and department-scoped management, add a company calendar with smart look-ahead alerts, and redesign the executive overview to surface KPI health, daily revenue with channel filters, attendance, calendar events, and an embedded CEO Planning kanban.

---

## 1. KPI Framework

### 1A. Wiring Status on KPI Definitions

New column on `kpi_definitions`:

```sql
ALTER TABLE public.kpi_definitions
  ADD COLUMN data_source_status text NOT NULL DEFAULT 'standalone'
  CHECK (data_source_status IN ('standalone', 'to_be_wired', 'wired'));
```

- `standalone` — manually entered values (default for all existing KPIs)
- `to_be_wired` — needs automated data pipeline, tracked in Admin > Development
- `wired` — connected to automated data source

### 1B. Goals Page → KPI Hub

The existing `/analytics/goals` page evolves into the central KPI management interface.

**What it shows:**
- All active KPI definitions grouped by department
- Per KPI: name, latest value (from most recent `kpi_entries` row), RAG status (green/amber/red based on thresholds), data source status badge (`standalone` / `to_be_wired` / `wired`), frequency
- Sparkline trend (last 8 entries) per KPI

**Department scoping:**
- OPS users see all departments with a department switcher
- Managers see only their own department's KPIs
- Contributors see their department's KPIs (read-only)

**Management (managers + OPS):**
- Create new KPI: name, category, unit, direction, frequency, thresholds (green/amber), data_source_status
- Edit existing KPIs (own department for managers, any for OPS)
- Log a new KPI entry (value + notes + optional agent/profile_id)

**Negative ranking section:**
- At the bottom of the page
- Shows agents/departments ranked by worst KPI performance
- Sorted by how far below green threshold each KPI is
- Highlights who's falling behind with red indicators

### 1C. Admin > Development Page

New page at `/admin/development` (OPS only).

**Purpose:** Track which KPIs still need data pipeline wiring.

**What it shows:**
- All KPIs where `data_source_status = 'to_be_wired'`, grouped by department
- Each item: KPI name, department, category, who created it, created date
- Action button: "Mark as Wired" → changes status to `wired`
- Count badge in header: "X KPIs to wire"

**Nav:** Added under the existing Admin group in the sidebar.

---

## 2. Calendar System

### 2A. Schema

New table:

```sql
CREATE TABLE public.calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  event_date      date NOT NULL,
  end_date        date,                -- nullable, for multi-day events
  event_type      text NOT NULL DEFAULT 'custom'
                  CHECK (event_type IN ('sale_event', 'holiday', 'company', 'custom')),
  is_recurring    boolean NOT NULL DEFAULT false,
  recurrence_rule text,                -- e.g., 'yearly'
  description     text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cal_events_date ON public.calendar_events(event_date);
CREATE INDEX idx_cal_events_type ON public.calendar_events(event_type);
```

RLS: All authenticated users can SELECT. OPS can INSERT/UPDATE/DELETE.

### 2B. Pre-seeded Events

The migration seeds recurring events:

**PH Double-Digit Sales** (type: `sale_event`, recurring yearly):
- 1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9, 10.10, 11.11, 12.12

**Major PH Holidays** (type: `holiday`, recurring yearly):
- New Year's Day (Jan 1)
- Araw ng Kagitingan (Apr 9)
- Labor Day (May 1)
- Independence Day (Jun 12)
- National Heroes Day (Aug last Mon — approximate as Aug 26)
- Bonifacio Day (Nov 30)
- Christmas (Dec 25)
- Rizal Day (Dec 30)
- New Year's Eve (Dec 31)

### 2C. Calendar API

New route at `/api/calendar/events`:
- `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD` — fetch events in range (handles recurring by expanding yearly events into the requested range)
- `POST` — create event (OPS only)
- `PATCH ?id=` — update event (OPS only)
- `DELETE ?id=` — delete event (OPS only)

### 2D. Smart Look-Ahead

Server-side helper function that:
1. Fetches events for the next 14 days
2. Generates alert objects: `{ title, daysUntil, event_type, message }`
3. Message templates:
   - Sale events: "{title} is {timeframe} — prepare campaigns"
   - Holidays: "{title} is {timeframe}"
   - Company: "{title} is {timeframe}"
4. Timeframe wording: "tomorrow", "in X days", "next week", "in 2 weeks"
5. Sorted by nearest first

---

## 3. Executive Overview Redesign

### Layout (top to bottom)

**Row 1: KPI Health Bar**
- Moved to the very top of the page
- Cross-department RAG status: colored segments per department showing green/amber/red KPI counts
- Click a department segment → links to `/analytics/goals` filtered by that department

**Row 2: Key Metrics Cards** (4 cards in a row, responsive to 2x2 on mobile)

| Card | Data Source | Display |
|------|-------------|---------|
| Revenue Day | Shopify orders + chat sales + marketplace sales for today | Currency formatted, mini filter pills: **All** (default) \| Store \| Conversion (Shopify) \| Messenger. Filters the displayed number by channel. |
| Ad Spend | Meta API — today's total spend across all accounts | Currency formatted, comparison vs yesterday |
| ROAS | Revenue Day (all) / Ad Spend | Ratio formatted (e.g., "3.2x"), green if above target |
| Attendance | Headcount minus approved leaves today | "X / Y working today". When 0 on leave: "Everyone is in today!" with a green accent. When people are out, emphasize the count out with amber/red based on percentage. |

**Row 3: Revenue Breakdown** (3 cards)

| Card | Source |
|------|--------|
| Shopify Revenue | `shopify_orders` total for today |
| Marketplace Revenue | Chat sales tagged as marketplace channels (Shopee, Lazada, TikTok Shop) |
| Store Revenue | Chat sales tagged as store/walk-in |

Each card shows today's value and a comparison arrow vs yesterday.

**Row 4: Calendar + Look-ahead** (side by side, 60/40 split)
- **Left (60%):** Mini calendar widget — current month grid with colored dots on event dates (sale=orange, holiday=red, company=blue, custom=gray)
- **Right (40%):** Smart look-ahead alerts — list of upcoming events in next 14 days with contextual messages and event type badges

**Row 5: Task Velocity + CEO Planning** (side by side, 40/60 split)
- **Left (40%):** Task velocity card — tasks completed vs overdue this week (existing data, keep current design)
- **Right (60%):** "CEO Planning" — embedded mini kanban of the current user's personal board. Shows column headers with card counts, and the first 3-5 cards per column. Clickable to go to full `/productivity/kanban`.

**Row 6: Recent Announcements** (keep existing, moved to bottom)
- Last 4 non-expired announcements (existing behavior)

### Removed from current page:
- Social media followers section → replaced by Revenue Breakdown
- Leaves count card → replaced by Attendance card
- "Number of pairs" metric → replaced by Revenue Day (which covers total orders/revenue)

### Data fetching:
- Admin client for all queries (consistent with existing pattern)
- Calendar events fetched for current month + next 14 days
- Personal kanban board fetched for current user (scope: personal, owner_id: currentUser.id)
- Revenue Day needs to aggregate from multiple sources — new API route or compute server-side

---

## 4. New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/00055_kpi_calendar_exec.sql` | kpi_definitions.data_source_status + calendar_events table + seed data |
| `src/app/api/calendar/events/route.ts` | CRUD for calendar events with recurring expansion |
| `src/app/(dashboard)/admin/development/page.tsx` | KPI wiring tasklist (OPS only) |
| `src/app/(dashboard)/admin/development/dev-tasklist-view.tsx` | Client view for the dev tasklist |
| `src/app/(dashboard)/executive/calendar-widget.tsx` | Mini calendar month grid component |
| `src/app/(dashboard)/executive/look-ahead.tsx` | Smart look-ahead alerts component |
| `src/app/(dashboard)/executive/ceo-planning.tsx` | Embedded personal kanban mini-view |
| `src/app/(dashboard)/executive/revenue-card.tsx` | Revenue Day card with channel filter pills |
| `src/app/(dashboard)/executive/attendance-card.tsx` | Attendance card with helpers |

## 5. Modified Files

| File | Changes |
|------|---------|
| `src/app/(dashboard)/executive/page.tsx` | Restructured layout, new data fetches (calendar events, personal kanban, revenue aggregation) |
| `src/app/(dashboard)/analytics/goals/page.tsx` | KPI hub: department scoping, management UI, negative ranking |
| `src/app/(dashboard)/analytics/goals/goals-view.tsx` | KPI list with RAG status, sparklines, data source badges, create/edit forms |
| `src/lib/permissions/nav.ts` | Add "Development" under Admin group |

---

## 6. Revenue Day Data Sources

Revenue Day aggregates from existing tables:
- **Shopify (Conversion):** `shopify_orders` table — sum of `total_price` where `created_at` is today
- **Messenger:** `sales_confirmed` or equivalent chat sales table — sum where channel = messenger and date = today
- **Store:** Same sales table — sum where channel = store/walk-in and date = today
- **All:** Sum of all three

The exact table names and column names need to be verified during implementation — the Shopify integration exists and chat sales data comes from the Sales-Ops module. The filter pills switch which sum is displayed.

---

## 7. Future Enhancements (Not in this spec)

- Clock-in/clock-out attendance system (attendance option B)
- Admin > Roadmap page with Pulse ticket linking (separate spec)
- KPI auto-wiring implementation (each "to_be_wired" KPI gets its own data pipeline task)
- Calendar event notifications
