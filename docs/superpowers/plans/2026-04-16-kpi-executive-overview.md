# KPI Framework + Executive Overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KPI wiring status tracking with an admin dev tasklist, a company calendar with smart look-ahead, and redesign the executive overview with KPI health at top, revenue day with channel filters, attendance, calendar widget, and CEO Planning kanban.

**Architecture:** A single migration adds the `data_source_status` column and `calendar_events` table with pre-seeded Philippine holidays. New focused components (calendar-widget, look-ahead, revenue-card, attendance-card, ceo-planning) are composed into the restructured executive overview page. The goals page evolves into the KPI hub with department scoping and negative ranking.

**Tech Stack:** Next.js 16 (App Router), Supabase (admin client), Tailwind CSS with CSS variables, Recharts, date-fns

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/00055_kpi_calendar.sql` | data_source_status column + calendar_events table + seed data |
| `src/app/api/calendar/events/route.ts` | CRUD for calendar events with recurring yearly expansion |
| `src/app/(dashboard)/admin/development/page.tsx` | KPI wiring tasklist page (OPS only) |
| `src/app/(dashboard)/admin/development/dev-tasklist-view.tsx` | Client view for wiring tasklist |
| `src/app/(dashboard)/executive/calendar-widget.tsx` | Mini month calendar with event dots |
| `src/app/(dashboard)/executive/look-ahead.tsx` | Smart look-ahead alerts for next 14 days |
| `src/app/(dashboard)/executive/revenue-card.tsx` | Revenue Day card with channel filter pills |
| `src/app/(dashboard)/executive/attendance-card.tsx` | Attendance card with "Everyone is in!" helper |
| `src/app/(dashboard)/executive/ceo-planning.tsx` | Embedded mini personal kanban |
| `src/app/(dashboard)/executive/development/page.tsx` | Executive Development tab (read-only feature goals — placeholder for Spec D) |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/(dashboard)/executive/page.tsx` | Restructured layout: KPI health top, new cards, calendar, CEO Planning |
| `src/app/(dashboard)/executive/tab-nav.tsx` | Add "Development" tab |
| `src/app/(dashboard)/analytics/goals/page.tsx` | Admin client, dept scoping, pass wiring status |
| `src/app/(dashboard)/analytics/goals/goals-view.tsx` | KPI hub UI: data source badges, create/edit with wiring status, negative ranking |
| `src/lib/permissions/nav.ts` | Add "Development" under Admin group |

---

## Task 1: Migration — KPI Wiring Status + Calendar Events

**Files:**
- Create: `supabase/migrations/00055_kpi_calendar.sql`

- [ ] **Step 1: Create the migration**

```sql
-- ============================================================
-- 00055_kpi_calendar.sql
-- 1. Add data_source_status to kpi_definitions
-- 2. Create calendar_events table
-- 3. Seed Philippine holidays + double-digit sales
-- ============================================================

-- 1. KPI wiring status
ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS data_source_status text NOT NULL DEFAULT 'standalone';

-- Add check constraint separately (IF NOT EXISTS not supported for constraints)
DO $$ BEGIN
  ALTER TABLE public.kpi_definitions
    ADD CONSTRAINT kpi_def_data_source_check
    CHECK (data_source_status IN ('standalone', 'to_be_wired', 'wired'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Calendar events
CREATE TABLE public.calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  event_date      date NOT NULL,
  end_date        date,
  event_type      text NOT NULL DEFAULT 'custom'
                  CHECK (event_type IN ('sale_event', 'holiday', 'company', 'custom')),
  is_recurring    boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  description     text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cal_events_date ON public.calendar_events(event_date);
CREATE INDEX idx_cal_events_type ON public.calendar_events(event_type);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events FORCE ROW LEVEL SECURITY;

CREATE POLICY cal_select ON public.calendar_events FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY cal_insert ON public.calendar_events FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY cal_update ON public.calendar_events FOR UPDATE USING (public.is_ops());
CREATE POLICY cal_delete ON public.calendar_events FOR DELETE USING (public.is_ops());

-- 3. Seed: PH Double-Digit Sales (recurring yearly)
INSERT INTO public.calendar_events (title, event_date, event_type, is_recurring, recurrence_rule, description) VALUES
  ('1.1 New Year Sale',     '2026-01-01', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('2.2 Sale',              '2026-02-02', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('3.3 Sale',              '2026-03-03', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('4.4 Sale',              '2026-04-04', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('5.5 Sale',              '2026-05-05', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('6.6 Sale',              '2026-06-06', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('7.7 Sale',              '2026-07-07', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('8.8 Sale',              '2026-08-08', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('9.9 Sale',              '2026-09-09', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('10.10 Sale',            '2026-10-10', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('11.11 Sale',            '2026-11-11', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('12.12 Sale',            '2026-12-12', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns');

-- Seed: Major PH Holidays (recurring yearly)
INSERT INTO public.calendar_events (title, event_date, event_type, is_recurring, recurrence_rule) VALUES
  ('New Year''s Day',       '2026-01-01', 'holiday', true, 'yearly'),
  ('Araw ng Kagitingan',    '2026-04-09', 'holiday', true, 'yearly'),
  ('Labor Day',             '2026-05-01', 'holiday', true, 'yearly'),
  ('Independence Day',      '2026-06-12', 'holiday', true, 'yearly'),
  ('National Heroes Day',   '2026-08-31', 'holiday', true, 'yearly'),
  ('Bonifacio Day',         '2026-11-30', 'holiday', true, 'yearly'),
  ('Christmas Day',         '2026-12-25', 'holiday', true, 'yearly'),
  ('Rizal Day',             '2026-12-30', 'holiday', true, 'yearly'),
  ('New Year''s Eve',       '2026-12-31', 'holiday', true, 'yearly');
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00055_kpi_calendar.sql
git commit -m "feat(db): KPI wiring status + calendar_events table with PH holidays"
```

---

## Task 2: Calendar Events API

**Files:**
- Create: `src/app/api/calendar/events/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const admin = createAdminClient();

  // Fetch non-recurring events in range
  const { data: oneTime } = await admin
    .from("calendar_events")
    .select("*")
    .eq("is_recurring", false)
    .gte("event_date", from)
    .lte("event_date", to);

  // Fetch all recurring events and expand into the requested range
  const { data: recurring } = await admin
    .from("calendar_events")
    .select("*")
    .eq("is_recurring", true);

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const expanded = (recurring ?? []).flatMap((evt) => {
    if (evt.recurrence_rule !== "yearly") return [];
    const results = [];
    const origMonth = new Date(evt.event_date).getMonth();
    const origDay = new Date(evt.event_date).getDate();

    for (let year = fromDate.getFullYear(); year <= toDate.getFullYear(); year++) {
      const d = new Date(year, origMonth, origDay);
      const ds = d.toISOString().slice(0, 10);
      if (ds >= from && ds <= to) {
        results.push({ ...evt, event_date: ds, _expanded: true });
      }
    }
    return results;
  });

  const all = [...(oneTime ?? []), ...expanded].sort(
    (a, b) => a.event_date.localeCompare(b.event_date)
  );

  return NextResponse.json(all);
}

// POST /api/calendar/events
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_events")
    .insert({
      title: body.title,
      event_date: body.event_date,
      end_date: body.end_date ?? null,
      event_type: body.event_type ?? "custom",
      is_recurring: body.is_recurring ?? false,
      recurrence_rule: body.recurrence_rule ?? null,
      description: body.description ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/calendar/events?id=...
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_events")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/calendar/events?id=...
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("calendar_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify build + commit**

```bash
git add src/app/api/calendar/events/route.ts
git commit -m "feat(api): calendar events CRUD with recurring yearly expansion"
```

---

## Task 3: Calendar Widget Component

**Files:**
- Create: `src/app/(dashboard)/executive/calendar-widget.tsx`

- [ ] **Step 1: Create the mini month calendar**

A client component that renders a month grid with colored dots on event dates.

```tsx
"use client";

import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from "date-fns";

type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
};

const EVENT_COLORS: Record<string, string> = {
  sale_event: "bg-orange-400",
  holiday: "bg-red-400",
  company: "bg-[var(--color-accent)]",
  custom: "bg-[var(--color-text-tertiary)]",
};

export function CalendarWidget({ events, month }: { events: CalendarEvent[]; month: Date }) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const result = [];
    let d = start;
    while (d <= end) {
      result.push(d);
      d = addDays(d, 1);
    }
    return result;
  }, [month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = e.event_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  return (
    <div>
      <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">{format(month, "MMMM yyyy")}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} className="text-[10px] font-medium text-[var(--color-text-tertiary)] pb-1">{d}</div>
        ))}
        {days.map((d, i) => {
          const ds = format(d, "yyyy-MM-dd");
          const evts = eventsByDate.get(ds) ?? [];
          const inMonth = isSameMonth(d, month);
          const today = isToday(d);
          return (
            <div key={i} className={`relative h-8 flex flex-col items-center justify-center rounded-[var(--radius-sm)] ${
              today ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]" :
              inMonth ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)] opacity-40"
            }`} title={evts.map(e => e.title).join(", ") || undefined}>
              <span className="text-xs">{format(d, "d")}</span>
              {evts.length > 0 && (
                <div className="flex gap-0.5 absolute bottom-0.5">
                  {evts.slice(0, 3).map((e, j) => (
                    <span key={j} className={`w-1 h-1 rounded-full ${EVENT_COLORS[e.event_type] ?? EVENT_COLORS.custom}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + commit**

```bash
git add src/app/(dashboard)/executive/calendar-widget.tsx
git commit -m "feat(executive): mini calendar widget with event dots"
```

---

## Task 4: Smart Look-Ahead Component

**Files:**
- Create: `src/app/(dashboard)/executive/look-ahead.tsx`

- [ ] **Step 1: Create the look-ahead alerts**

Server component helper + client display. The look-ahead data is computed server-side in page.tsx and passed as props.

```tsx
import { differenceInDays, parseISO, format } from "date-fns";

type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
};

type Alert = {
  title: string;
  event_type: string;
  daysUntil: number;
  message: string;
};

const TYPE_BADGES: Record<string, { bg: string; text: string }> = {
  sale_event: { bg: "bg-orange-100", text: "text-orange-700" },
  holiday:    { bg: "bg-red-50",     text: "text-red-600" },
  company:    { bg: "bg-[var(--color-accent-light)]", text: "text-[var(--color-accent)]" },
  custom:     { bg: "bg-[var(--color-bg-tertiary)]",  text: "text-[var(--color-text-secondary)]" },
};

export function computeAlerts(events: CalendarEvent[]): Alert[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return events
    .map((e) => {
      const d = parseISO(e.event_date);
      const daysUntil = differenceInDays(d, today);
      if (daysUntil < 0 || daysUntil > 14) return null;

      const timeframe =
        daysUntil === 0 ? "today" :
        daysUntil === 1 ? "tomorrow" :
        daysUntil <= 7  ? `in ${daysUntil} days` :
        daysUntil <= 14 ? "in 2 weeks" : "";

      const action = e.event_type === "sale_event" ? " — prepare campaigns" : "";

      return {
        title: e.title,
        event_type: e.event_type,
        daysUntil,
        message: `${e.title} is ${timeframe}${action}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.daysUntil - b!.daysUntil) as Alert[];
}

export function LookAhead({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-tertiary)] py-4">
        No upcoming events in the next 2 weeks
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Coming Up</p>
      {alerts.map((a, i) => {
        const badge = TYPE_BADGES[a.event_type] ?? TYPE_BADGES.custom;
        return (
          <div key={i} className="flex items-start gap-2.5 py-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize shrink-0 mt-0.5 ${badge.bg} ${badge.text}`}>
              {a.event_type.replace("_", " ")}
            </span>
            <p className="text-sm text-[var(--color-text-primary)]">{a.message}</p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build + commit**

```bash
git add src/app/(dashboard)/executive/look-ahead.tsx
git commit -m "feat(executive): smart look-ahead alerts for upcoming events"
```

---

## Task 5: Revenue Day Card with Channel Filters

**Files:**
- Create: `src/app/(dashboard)/executive/revenue-card.tsx`

- [ ] **Step 1: Create revenue card with filter pills**

Client component with channel filter pills that switch the displayed number.

```tsx
"use client";

import { useState } from "react";

type ChannelRevenue = {
  all: number;
  store: number;
  conversion: number; // Shopify
  messenger: number;
};

const CHANNELS = [
  { key: "all", label: "All" },
  { key: "store", label: "Store" },
  { key: "conversion", label: "Conversion" },
  { key: "messenger", label: "Messenger" },
] as const;

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toFixed(0)}`;
}

export function RevenueCard({ revenue, yesterdayRevenue }: { revenue: ChannelRevenue; yesterdayRevenue: ChannelRevenue }) {
  const [channel, setChannel] = useState<keyof ChannelRevenue>("all");

  const current = revenue[channel];
  const previous = yesterdayRevenue[channel];
  const change = previous > 0 ? ((current - previous) / previous) * 100 : null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-5 h-full">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide">Revenue Day</p>
      </div>
      <p className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">{fmtMoney(current)}</p>
      {change !== null && (
        <p className={`text-xs mt-1 font-medium ${change >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% vs yesterday
        </p>
      )}
      <div className="flex gap-1 mt-3">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChannel(c.key as keyof ChannelRevenue)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              channel === c.key
                ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + commit**

```bash
git add src/app/(dashboard)/executive/revenue-card.tsx
git commit -m "feat(executive): Revenue Day card with channel filter pills"
```

---

## Task 6: Attendance Card

**Files:**
- Create: `src/app/(dashboard)/executive/attendance-card.tsx`

- [ ] **Step 1: Create attendance card**

```tsx
type Props = {
  headcount: number;
  onLeaveToday: number;
};

export function AttendanceCard({ headcount, onLeaveToday }: Props) {
  const working = headcount - onLeaveToday;
  const allIn = onLeaveToday === 0;
  const pctOut = headcount > 0 ? (onLeaveToday / headcount) * 100 : 0;

  const accent = allIn ? "green" : pctOut > 20 ? "red" : pctOut > 10 ? "amber" : "none";
  const bg =
    accent === "green" ? "bg-[var(--color-success-light)] border-green-200" :
    accent === "red"   ? "bg-[var(--color-error-light)] border-red-200" :
    accent === "amber" ? "bg-[var(--color-warning-light)] border-amber-200" :
    "bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]";

  return (
    <div className={`rounded-[var(--radius-lg)] border p-5 h-full ${bg}`}>
      <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">Attendance</p>
      {allIn ? (
        <>
          <p className="text-2xl font-bold text-[var(--color-success)]">Everyone is in today!</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{headcount} team members</p>
        </>
      ) : (
        <>
          <p className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">{working} / {headcount}</p>
          <p className={`text-xs mt-1 font-medium ${accent === "red" ? "text-[var(--color-error)]" : accent === "amber" ? "text-[var(--color-warning)]" : "text-[var(--color-text-tertiary)]"}`}>
            {onLeaveToday} {onLeaveToday === 1 ? "person" : "people"} on leave today
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build + commit**

```bash
git add src/app/(dashboard)/executive/attendance-card.tsx
git commit -m "feat(executive): attendance card with 'Everyone is in!' helper"
```

---

## Task 7: CEO Planning Component

**Files:**
- Create: `src/app/(dashboard)/executive/ceo-planning.tsx`

- [ ] **Step 1: Create embedded mini kanban**

Client component that displays the current user's personal kanban board in a compact layout.

```tsx
"use client";

import Link from "next/link";

type Card = {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
};

type Column = {
  id: string;
  name: string;
  sort_order: number;
  cards: Card[];
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-l-red-400",
  high:   "border-l-amber-400",
  medium: "border-l-blue-400",
  low:    "border-l-gray-300",
};

export function CeoPlanning({ columns }: { columns: Column[] }) {
  const sorted = [...columns].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">CEO Planning</p>
        <Link href="/productivity/kanban" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">Full board →</Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {sorted.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-48">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">{col.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] font-medium">{col.cards.length}</span>
            </div>
            <div className="space-y-1.5">
              {col.cards.slice(0, 5).map((card) => (
                <div key={card.id} className={`text-xs p-2 rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] border-l-[3px] ${PRIORITY_COLORS[card.priority ?? ""] ?? "border-l-transparent"}`}>
                  <p className="text-[var(--color-text-primary)] line-clamp-2">{card.title}</p>
                  {card.due_date && (
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">{card.due_date}</p>
                  )}
                </div>
              ))}
              {col.cards.length > 5 && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] text-center">+{col.cards.length - 5} more</p>
              )}
              {col.cards.length === 0 && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] text-center py-3">Empty</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + commit**

```bash
git add src/app/(dashboard)/executive/ceo-planning.tsx
git commit -m "feat(executive): CEO Planning mini kanban component"
```

---

## Task 8: Executive Tab Nav — Add Development Tab

**Files:**
- Modify: `src/app/(dashboard)/executive/tab-nav.tsx`

- [ ] **Step 1: Add Development tab**

Add to the TABS array:
```typescript
{ label: "Development", href: "/executive/development", icon: "🛠" },
```

- [ ] **Step 2: Create placeholder page for the tab**

Create `src/app/(dashboard)/executive/development/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

export default async function ExecDevelopmentPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  return (
    <div className="text-center py-12">
      <p className="text-sm text-[var(--color-text-tertiary)]">Development progress will appear here once feature goals are set up in Admin → Development.</p>
    </div>
  );
}
```

- [ ] **Step 3: Add Development under Admin in nav**

In `src/lib/permissions/nav.ts`, find the Admin group and add:
```typescript
{ name: "Development", slug: "admin-development", route: "/admin/development" },
```

- [ ] **Step 4: Verify build + commit**

```bash
git add src/app/(dashboard)/executive/tab-nav.tsx src/app/(dashboard)/executive/development/page.tsx src/lib/permissions/nav.ts
git commit -m "feat(nav): add Development tab to executive + admin sidebar"
```

---

## Task 9: Admin Development Page — KPI Wiring Tasklist

**Files:**
- Create: `src/app/(dashboard)/admin/development/page.tsx`
- Create: `src/app/(dashboard)/admin/development/dev-tasklist-view.tsx`

- [ ] **Step 1: Create the server page**

```tsx
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DevTasklistView } from "./dev-tasklist-view";

export default async function AdminDevelopmentPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  if (!isOps(user)) redirect("/");

  const admin = createAdminClient();
  const [{ data: kpis }, { data: departments }] = await Promise.all([
    admin
      .from("kpi_definitions")
      .select("id, name, category, data_source_status, department:departments(id, name, slug), is_active")
      .in("data_source_status", ["to_be_wired", "wired"])
      .order("name"),
    admin.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <DevTasklistView kpis={(kpis ?? []) as any} departments={departments ?? []} />
    </div>
  );
}
```

- [ ] **Step 2: Create the client view**

```tsx
"use client";

import { useState, useCallback } from "react";

type Dept = { id: string; name: string; slug: string };
type KpiItem = {
  id: string;
  name: string;
  category: string;
  data_source_status: string;
  is_active: boolean;
  department: Dept | null;
};

export function DevTasklistView({ kpis, departments }: { kpis: KpiItem[]; departments: Dept[] }) {
  const [items, setItems] = useState(kpis);

  const markWired = useCallback(async (id: string) => {
    setItems((prev) => prev.map((k) => k.id === id ? { ...k, data_source_status: "wired" } : k));
    await fetch("/api/kpis/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data_source_status: "wired" }),
    });
  }, []);

  const toWire = items.filter((k) => k.data_source_status === "to_be_wired");
  const wired = items.filter((k) => k.data_source_status === "wired");

  // Group by department
  const grouped = departments
    .map((d) => ({
      dept: d,
      items: toWire.filter((k) => k.department?.id === d.id),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Development</h1>
          {toWire.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning-text)] font-medium">
              {toWire.length} to wire
            </span>
          )}
        </div>

        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">KPIs to Wire</h2>
        {grouped.length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)] py-4">All KPIs are wired or standalone.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.dept.id}>
                <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">{g.dept.name}</p>
                <div className="space-y-1">
                  {g.items.map((k) => (
                    <div key={k.id} className="flex items-center justify-between py-2 px-3 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]">
                      <div>
                        <span className="text-sm text-[var(--color-text-primary)]">{k.name}</span>
                        <span className="text-xs text-[var(--color-text-tertiary)] ml-2">{k.category}</span>
                      </div>
                      <button
                        onClick={() => markWired(k.id)}
                        className="text-xs px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--color-success-light)] text-[var(--color-success)] font-medium hover:bg-green-100"
                      >
                        Mark as Wired
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {wired.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">Recently Wired</h2>
          <div className="space-y-1">
            {wired.map((k) => (
              <div key={k.id} className="flex items-center gap-2 py-2 px-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
                <span className="text-[var(--color-success)]">✓</span>
                <span className="text-sm text-[var(--color-text-secondary)]">{k.name}</span>
                <span className="text-xs text-[var(--color-text-tertiary)]">{k.department?.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

Note: The `PATCH /api/kpis/[id]` endpoint may not exist yet. If not, the implementer should check and either create it or use an inline admin client update. The existing KPI system likely has CRUD via the goals page.

- [ ] **Step 3: Verify build + commit**

```bash
git add src/app/(dashboard)/admin/development/
git commit -m "feat(admin): development page with KPI wiring tasklist"
```

---

## Task 10: Goals Page — KPI Hub with Dept Scoping + Negative Ranking

**Files:**
- Modify: `src/app/(dashboard)/analytics/goals/page.tsx`
- Modify: `src/app/(dashboard)/analytics/goals/goals-view.tsx`

- [ ] **Step 1: Update page.tsx for admin client + data source status**

Switch queries to admin client. Add `data_source_status` to kpi_definitions select. Pass `isOps` to view.

In page.tsx, add `createAdminClient` import and `isOps` import. Use admin for queries. Add `data_source_status` to the kpiDefs select. Pass `isOps={isOps(currentUser)}` to the view.

- [ ] **Step 2: Add data source badges to goals view**

In goals-view.tsx, for each KPI/goal, show a badge for data_source_status:
- `standalone`: gray badge "Manual"
- `to_be_wired`: amber badge "To Wire"
- `wired`: green badge "Wired"

- [ ] **Step 3: Add data_source_status to create/edit form**

In the goal creation form, add a select for data_source_status:
```tsx
<select value={dataSourceStatus} onChange={(e) => setDataSourceStatus(e.target.value)}
  className="rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm">
  <option value="standalone">Standalone (Manual)</option>
  <option value="to_be_wired">To Be Wired</option>
  <option value="wired">Wired</option>
</select>
```

- [ ] **Step 4: Add department scoping**

OPS sees all departments with a switcher. Managers see only their department. Contributors see their department read-only.

Filter goals/KPIs by the selected department (for OPS) or automatically by `currentDeptId` (for managers/contributors). Hide the department dropdown for non-OPS.

- [ ] **Step 5: Add negative ranking section**

At the bottom of the goals view, add a "Falling Behind" section:
- For each KPI with latest value below amber threshold, show agent/department with the value
- Sorted by how far below threshold (worst first)
- Red indicators for critical, amber for warning

```tsx
{negativeRanking.length > 0 && (
  <div className="mt-8">
    <h3 className="text-sm font-semibold text-[var(--color-error)] mb-3">Falling Behind</h3>
    <div className="space-y-2">
      {negativeRanking.map((item) => (
        <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-[var(--radius-md)] bg-[var(--color-error-light)] border border-red-200">
          <div>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{item.kpiName}</span>
            <span className="text-xs text-[var(--color-text-tertiary)] ml-2">{item.deptName}</span>
          </div>
          <span className="text-sm font-bold text-[var(--color-error)]">{item.value} / {item.threshold}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify build + commit**

```bash
git add src/app/(dashboard)/analytics/goals/
git commit -m "feat(goals): KPI hub with dept scoping, data source badges, negative ranking"
```

---

## Task 11: Executive Overview — Restructured Layout

**Files:**
- Modify: `src/app/(dashboard)/executive/page.tsx`

This is the largest task — restructuring the 534-line page with the new layout.

- [ ] **Step 1: Add new imports**

```typescript
import { CalendarWidget } from "./calendar-widget";
import { LookAhead, computeAlerts } from "./look-ahead";
import { RevenueCard } from "./revenue-card";
import { AttendanceCard } from "./attendance-card";
import { CeoPlanning } from "./ceo-planning";
```

- [ ] **Step 2: Add calendar events + personal kanban to the data fetch**

Add to the parallel `Promise.all`:
```typescript
// Calendar events for this month + next 14 days
admin.from("calendar_events").select("*"),

// Personal kanban board for CEO Planning
admin.from("kanban_boards")
  .select("id")
  .eq("scope", "personal")
  .eq("owner_id", user.id)
  .limit(1)
  .maybeSingle(),

// Approved leaves today (for attendance)
admin.from("leaves")
  .select("*", { count: "exact", head: true })
  .eq("status", "approved")
  .lte("start_date", today)
  .gte("end_date", today),
```

After the main fetch, expand calendar events for the current month + look-ahead:
```typescript
const calEvents = (calendarEventsRaw ?? []).flatMap((evt) => {
  if (!evt.is_recurring || evt.recurrence_rule !== "yearly") return [evt];
  const origMonth = new Date(evt.event_date).getMonth();
  const origDay = new Date(evt.event_date).getDate();
  const year = new Date().getFullYear();
  return [{ ...evt, event_date: `${year}-${String(origMonth+1).padStart(2,"0")}-${String(origDay).padStart(2,"0")}` }];
});
const lookAheadAlerts = computeAlerts(calEvents);
```

Fetch personal kanban columns + cards if board exists:
```typescript
let ceoPlanningColumns: any[] = [];
if (personalBoard?.id) {
  const { data: cols } = await admin
    .from("kanban_columns")
    .select("id, name, sort_order, kanban_cards(id, title, priority, due_date)")
    .eq("board_id", personalBoard.id)
    .order("sort_order");
  ceoPlanningColumns = (cols ?? []).map((c: any) => ({
    ...c,
    cards: (c.kanban_cards ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));
}
```

Compute revenue by channel:
```typescript
const messengerRevenue = (confirmedSalesMonth ?? [])
  .filter((r: any) => r.platform === "messenger" || !r.platform)
  .reduce((s: number, r: any) => s + Number(r.net_value), 0);
// Note: Exact channel filtering depends on how sales data is tagged.
// The implementer should check the sales_confirmed_sales table schema.
const todayRevenue = {
  all: shopifyRevenue + messengerRevenue,
  store: 0,       // Physical store — needs data source
  conversion: shopifyRevenue,
  messenger: messengerRevenue,
};
```

- [ ] **Step 3: Restructure the rendering**

Reorder the JSX to match the new layout:

**Row 1: KPI Health (existing, moved to top)**
Move the `deptsWithKpis` KPI Health section to be the first rendered element (right after the alert banner).

**Row 2: Key Metrics (4 cards)**
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <RevenueCard revenue={todayRevenue} yesterdayRevenue={yesterdayRevenue} />
  <MetricCard label="Ad Spend" value={fmtMoney(adSpendToday)} sub={...} accent="blue" />
  <MetricCard label="ROAS" value={roas > 0 ? `${roas.toFixed(1)}x` : "—"} accent={roas >= 3 ? "green" : roas >= 2 ? "amber" : "red"} />
  <AttendanceCard headcount={headcount ?? 0} onLeaveToday={approvedLeavesToday ?? 0} />
</div>
```

**Row 3: Revenue Breakdown (3 cards)**
```tsx
<div className="grid grid-cols-3 gap-4">
  <MetricCard label="Shopify" value={fmtMoney(shopifyRevenue)} badge="Conversion" />
  <MetricCard label="Marketplace" value={fmtMoney(marketplaceRevenue)} badge="Marketplace" />
  <MetricCard label="Store" value={fmtMoney(storeRevenue)} badge="Store" />
</div>
```

**Row 4: Calendar + Look-ahead**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
  <div className="lg:col-span-3 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
    <CalendarWidget events={calEvents} month={new Date()} />
  </div>
  <div className="lg:col-span-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
    <LookAhead alerts={lookAheadAlerts} />
  </div>
</div>
```

**Row 5: Task Velocity + CEO Planning**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
  <div className="lg:col-span-2">
    {/* Existing task velocity card */}
  </div>
  <div className="lg:col-span-3 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
    <CeoPlanning columns={ceoPlanningColumns} />
  </div>
</div>
```

**Row 6: Announcements (keep existing, moved to bottom)**

**Remove:** Social followers card, "Team · pending leaves" card, "Pairs sold today" card (all replaced by new cards).

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/executive/page.tsx
git commit -m "feat(executive): restructured overview with KPI health, revenue, calendar, CEO Planning"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| 1A. data_source_status on kpi_definitions | Task 1 |
| 1B. Goals page as KPI hub | Task 10 |
| 1C. Admin > Development tasklist | Task 9 |
| 2A. calendar_events schema | Task 1 |
| 2B. Pre-seeded events | Task 1 |
| 2C. Calendar API | Task 2 |
| 2D. Smart look-ahead | Task 4 |
| 3. Row 1: KPI Health top | Task 11 |
| 3. Row 2: Revenue Day + Ad Spend + ROAS + Attendance | Tasks 5, 6, 11 |
| 3. Row 3: Revenue Breakdown | Task 11 |
| 3. Row 4: Calendar + Look-ahead | Tasks 3, 4, 11 |
| 3. Row 5: Task Velocity + CEO Planning | Tasks 7, 11 |
| 3. Row 6: Announcements | Task 11 |
| 3. Tab nav: Development | Task 8 |
| 3. Admin nav: Development | Task 8 |
