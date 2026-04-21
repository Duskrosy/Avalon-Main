# Calendar Navigation Fix + Holidays & Look-Ahead

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken month navigation on /productivity/calendar, and add holidays/sales events to the calendar grid plus a look-ahead widget showing upcoming events in the next 14 days.

**Architecture:** Two separate problems. (1) Navigation bug: `navigate()` captures `[year, mon]` in a stale closure — rapid clicks all operate on the same month; `goToday()` passes delta=0 which reloads current month data but never changes the displayed month. Fix with a `monthRef` (useRef) that always reflects current month without recreating the callback. (2) Holidays gap: `calendar_events` table has 9 PH holidays + 12 double-digit sale events, but `/api/calendar/route.ts` ignores it. Extend the API to return them, update `CalendarView` types/filters, and render the existing `LookAhead` component (from executive dashboard) on the calendar page.

**Tech Stack:** Next.js App Router, React useRef, Supabase, date-fns

---

## Files

- Modify: `src/app/(dashboard)/productivity/calendar/calendar-view.tsx`
- Modify: `src/app/api/calendar/route.ts`
- Modify: `src/app/(dashboard)/productivity/calendar/page.tsx`

---

## Task 1: Fix month navigation stale closure + broken goToday

**Files:**
- Modify: `src/app/(dashboard)/productivity/calendar/calendar-view.tsx`

**Root cause detail:**
- `navigate(delta)` has `[year, mon]` as its `useCallback` dependency array. These values come from splitting `month` state at render time. If the user clicks ›  ›  ›  rapidly, React batches state updates — the closure never gets the updated month between clicks. All three clicks compute from the same starting month.
- `goToday()` calls `navigate(0)`. Delta 0 means: `new Date(year, mon - 1 + 0, 1)` = same month. It refetches the same month's events but never changes `month` state to today.

**Fix strategy:** A `useRef` always holds the current value without being a dependency. Read `monthRef.current` inside navigate instead of the closure-captured `year/mon`. Add `AbortController` so rapid clicks cancel previous in-flight fetches.

- [ ] **Step 1: Add `useRef` to the React import**

Find line 1 of `calendar-view.tsx`:
```tsx
import { useState, useCallback } from "react";
```
Replace with:
```tsx
import { useState, useCallback, useRef } from "react";
```

- [ ] **Step 2: Add refs after the state declarations**

Find the block of `useState` calls in `CalendarView`. After the last one (`const [saving, setSaving] = useState(false);`), add:

```tsx
  const monthRef = useRef(month);
  monthRef.current = month;
  const abortRef = useRef<AbortController | null>(null);
```

- [ ] **Step 3: Replace navigate()**

Find and replace the existing `navigate` useCallback (currently has `[year, mon]` dependency):

```tsx
  const navigate = useCallback(async (delta: number) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const [y, m] = monthRef.current.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const newMonth = d.toISOString().slice(0, 7);
    setMonth(newMonth);
    setSelected(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?month=${newMonth}`, {
        signal: abortRef.current.signal,
      });
      if (res.ok) setEvents(await res.json());
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
    }
    setLoading(false);
  }, []);
```

- [ ] **Step 4: Replace goToday()**

Find and replace the existing `goToday` function:

```tsx
  const goToday = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 7);
    if (today === monthRef.current) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setMonth(today);
    setSelected(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?month=${today}`, {
        signal: abortRef.current.signal,
      });
      if (res.ok) setEvents(await res.json());
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
    }
    setLoading(false);
  }, []);
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 6: Smoke test**

```bash
npm run dev
```

Navigate to /productivity/calendar:
- Click ‹ three times rapidly → calendar moves exactly 3 months back (not 1)
- Click "Today" from any month → jumps directly to current month
- Network tab shows cancelled requests when navigating quickly (status: cancelled)

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/productivity/calendar/calendar-view.tsx
git commit -m "fix(calendar): fix stale closure in navigate(), fix goToday() not navigating"
```

---

## Task 2: Extend calendar API to include holidays and sale events

**Files:**
- Modify: `src/app/api/calendar/route.ts`

The `calendar_events` table is seeded with 9 PH holidays and 12 double-digit sale events (1.1–12.12), all marked `is_recurring = true, recurrence_rule = 'yearly'` with 2026 dates. The API must project recurring events to the requested year.

- [ ] **Step 1: Extend the CalendarEvent type**

Find the `CalendarEvent` type near the top of `route.ts`:
```ts
export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  end_date?: string;
  type: "leave" | "booking" | "birthday" | "task" | "post";
  color: string;
  meta?: string;
};
```
Replace with:
```ts
export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  end_date?: string;
  type: "leave" | "booking" | "birthday" | "task" | "post" | "holiday" | "sale_event";
  color: string;
  meta?: string;
};
```

- [ ] **Step 2: Add calendar_events fetch block**

Just before the final `return NextResponse.json(events);`, add:

```ts
  // --- CALENDAR EVENTS (holidays, sale events) ---
  const { data: calEvents } = await supabase
    .from("calendar_events")
    .select("id, title, event_date, end_date, event_type, is_recurring, recurrence_rule");

  for (const ce of calEvents ?? []) {
    const parts = (ce.event_date as string).split("-");
    const eventDate =
      ce.is_recurring && ce.recurrence_rule === "yearly"
        ? `${year}-${parts[1]}-${parts[2]}`
        : (ce.event_date as string);

    if (eventDate < firstStr || eventDate > lastStr) continue;

    const endDate = ce.end_date
      ? ce.is_recurring && ce.recurrence_rule === "yearly"
        ? (() => {
            const ep = (ce.end_date as string).split("-");
            return `${year}-${ep[1]}-${ep[2]}`;
          })()
        : (ce.end_date as string)
      : undefined;

    events.push({
      id: `cal-${ce.id}`,
      title: ce.title as string,
      date: eventDate,
      ...(endDate ? { end_date: endDate } : {}),
      type: ce.event_type as "holiday" | "sale_event",
      color: ce.event_type === "sale_event" ? "#f97316" : "#ef4444",
    });
  }
```

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Clean TypeScript build.

- [ ] **Step 4: Verify API response**

```bash
npm run dev
```

Open DevTools → Network. Navigate to /productivity/calendar. Find the `GET /api/calendar?month=YYYY-MM` request. Check response JSON — navigate to May to see `{ type: "sale_event", title: "5.5 Sale", date: "2026-05-05" }`. Navigate to December to see Christmas.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calendar/route.ts
git commit -m "feat(calendar): include holidays and sale events from calendar_events in API"
```

---

## Task 3: Display holidays/sales in CalendarView + add Look-Ahead panel

**Files:**
- Modify: `src/app/(dashboard)/productivity/calendar/calendar-view.tsx`
- Modify: `src/app/(dashboard)/productivity/calendar/page.tsx`

### Part A — CalendarView: add filter types

- [ ] **Step 1: Extend CalendarEvent type in calendar-view.tsx**

Find the local `CalendarEvent` type:
```tsx
  type: "leave" | "booking" | "birthday" | "task" | "post";
```
Replace with:
```tsx
  type: "leave" | "booking" | "birthday" | "task" | "post" | "holiday" | "sale_event";
```

- [ ] **Step 2: Extend Filter type**

Replace:
```tsx
type Filter = { leave: boolean; booking: boolean; birthday: boolean; task: boolean; post: boolean };
```
With:
```tsx
type Filter = { leave: boolean; booking: boolean; birthday: boolean; task: boolean; post: boolean; holiday: boolean; sale_event: boolean };
```

- [ ] **Step 3: Add to TYPE_LABELS**

Find `const TYPE_LABELS = { ... }` and add two entries:
```tsx
const TYPE_LABELS = {
  leave:      "Leaves",
  booking:    "Room bookings",
  birthday:   "Birthdays",
  task:       "Tasks",
  post:       "SMM Posts",
  holiday:    "Holidays",
  sale_event: "Sale Events",
};
```

- [ ] **Step 4: Add to TYPE_COLORS**

Find `const TYPE_COLORS = { ... }` and add:
```tsx
const TYPE_COLORS = {
  leave:      "bg-amber-400",
  booking:    "bg-[var(--color-accent)]",
  birthday:   "bg-pink-400",
  task:       "bg-purple-500",
  post:       "bg-gray-700",
  holiday:    "bg-red-500",
  sale_event: "bg-orange-500",
};
```

- [ ] **Step 5: Update initial filters state**

Find the `useState<Filter>` initialization. Add the two new keys with default `true`:
```tsx
  const [filters, setFilters] = useState<Filter>({
    leave:      settings.show_leaves,
    booking:    settings.show_rooms,
    birthday:   settings.show_birthdays,
    task:       settings.show_tasks,
    post:       settings.show_posts,
    holiday:    true,
    sale_event: true,
  });
```

- [ ] **Step 6: Update setFilters inside saveSettings**

Find the `setFilters({...})` call inside `saveSettings()` and add the two new keys:
```tsx
    setFilters({
      leave:      settingsForm.show_leaves,
      booking:    settingsForm.show_rooms,
      birthday:   settingsForm.show_birthdays,
      task:       settingsForm.show_tasks,
      post:       settingsForm.show_posts,
      holiday:    true,
      sale_event: true,
    });
```

- [ ] **Step 7: Build check**

```bash
npm run build
```

Expected: Clean build. The calendar grid already uses `e.color` and `e.type` from the event, so holiday/sale_event dots will render automatically with their colors.

### Part B — page.tsx: add Look-Ahead panel

- [ ] **Step 8: Import LookAhead and computeAlerts**

At the top of `page.tsx`, add:
```ts
import { LookAhead, computeAlerts } from "@/app/(dashboard)/executive/look-ahead";
```

- [ ] **Step 9: Fetch calendar_events and compute alerts**

Inside `CalendarPage()`, after the existing queries and before the `return`, add:
```ts
  // Look-ahead: upcoming holidays and sales in the next 14 days
  const { data: upcomingCalEvents } = await supabase
    .from("calendar_events")
    .select("id, title, event_date, event_type, is_recurring, recurrence_rule");

  const thisYear = new Date().getFullYear();
  const expandedForLookAhead = (upcomingCalEvents ?? []).map((e) => {
    if (e.is_recurring && e.recurrence_rule === "yearly") {
      const [, mm, dd] = (e.event_date as string).split("-");
      return { ...e, event_date: `${thisYear}-${mm}-${dd}` };
    }
    return e;
  });

  const lookAheadAlerts = computeAlerts(expandedForLookAhead);
```

- [ ] **Step 10: Render LookAhead above CalendarView**

Find the `return (...)` in `CalendarPage`. Wrap the existing `<CalendarView ... />` with a container and render the look-ahead panel above it:

```tsx
  return (
    <div>
      {lookAheadAlerts.length > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <LookAhead alerts={lookAheadAlerts} />
        </div>
      )}
      <CalendarView
        {/* existing props unchanged */}
      />
    </div>
  );
```

**Important:** Do not change the `<CalendarView ... />` props — just wrap both elements in a `<div>`.

- [ ] **Step 11: Build check**

```bash
npm run build
```

Expected: Clean build.

- [ ] **Step 12: Verify in browser**

```bash
npm run dev
```

Navigate to /productivity/calendar:
- Look-ahead panel appears above the calendar if any holidays/sales are within 14 days (try mid-April → should show upcoming events if any)
- Navigate to May → "5.5 Sale" dot appears on May 5 in orange
- Navigate to December → Christmas dot appears in red on Dec 25
- Settings panel shows "Holidays" and "Sale Events" toggles
- Toggling them shows/hides the dots

- [ ] **Step 13: Commit**

```bash
git add src/app/(dashboard)/productivity/calendar/calendar-view.tsx
git add src/app/(dashboard)/productivity/calendar/page.tsx
git commit -m "feat(calendar): add holidays/sale events display and look-ahead widget"
```

---

## Self-Review

**Spec coverage:**
- ✅ "Moving through months is super broken" — Task 1 fixes stale closure, rapid navigation works correctly
- ✅ "Doesn't come back to today" — Task 1 rewrites goToday() to navigate to actual current month
- ✅ "Missing look ahead from the dashboard" — Task 3B adds LookAhead panel above calendar
- ✅ "Missing holidays from the dashboard" — Tasks 2 + 3A add holidays to API response and calendar grid filters
- ✅ Sale events included (seeded alongside holidays, same table)

**Placeholder scan:** None — all code blocks are complete with exact implementations.

**Type consistency:** `CalendarEvent.type` union extended identically in both `route.ts` (Task 2) and `calendar-view.tsx` (Task 3). `Filter` type keys match `TYPE_LABELS` and `TYPE_COLORS` keys exactly.
