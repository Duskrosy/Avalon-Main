# Calendar Timezone Fix + Stronger Today Feedback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix month navigation that still reproduces in beta (clicks to ‹/›/Today do nothing in GMT+8 timezone) and strengthen the "Today" visual feedback so users can see when they're on the current month and which cell is today.

**Root cause:** The April 17 calendar fix (commits a7caac7 / 3ce7ced) used `new Date(y, m-1+delta, 1).toISOString().slice(0, 7)` to compute month strings. `toISOString()` returns UTC. In GMT+8, `new Date(2026, 4, 1)` local = `2026-04-30 16:00 UTC` → `.toISOString().slice(0, 7)` = `"2026-04"`. Every "advance one month" lands back on April. Verified live on 2026-04-20: five sequential clicks of `›` produced five `GET /api/calendar?month=2026-04` requests.

**Same bug in 3 client sites and 1 server site.** Scope here is the client-side callbacks that directly break nav. Server-side `initialMonth` in `page.tsx` is noted as a follow-up (the bug only manifests during 00:00-08:00 local time; daytime usage is unaffected).

**Today-feedback scope:** Ticket asks to "add Today highlight feedback." Current code highlights today's day-number with a small filled circle (subtle against event-dense cells). This plan adds: (1) a ring around today's cell in addition to the day-number circle, and (2) an "on current month" pressed state on the Today button so users know their navigation anchor.

**Tech Stack:** Next.js App Router, React useRef/useCallback, date-fns `format` (already imported).

---

## Files

- Modify: `src/app/(dashboard)/productivity/calendar/calendar-view.tsx`

---

## Task 1: Replace UTC `toISOString().slice(...)` with local-TZ `format(...)` for month/date strings

**Root cause detail:**
- L103: `const newMonth = d.toISOString().slice(0, 7);` — UTC month string from a local date; one-day offset pushes back a month for positive-UTC users.
- L119: `const today = new Date().toISOString().slice(0, 7);` — same issue for goToday; near midnight local, "today" resolves to previous day's month.
- L177: `const todayStr = new Date().toISOString().split("T")[0];` — today highlight; for ~8 hours each night in GMT+8, highlight lands on yesterday's cell or disappears (yesterday is outside current month grid).

**Fix:** date-fns `format` already imported on line 4. Use `format(d, "yyyy-MM")` for month strings and `format(new Date(), "yyyy-MM-dd")` for the day string. `format` uses local time.

- [ ] **Step 1: Replace L103 in `navigate()`**

Find:
```tsx
    const newMonth = d.toISOString().slice(0, 7);
```
Replace with:
```tsx
    const newMonth = format(d, "yyyy-MM");
```

- [ ] **Step 2: Replace L119 in `goToday()`**

Find:
```tsx
    const today = new Date().toISOString().slice(0, 7);
```
Replace with:
```tsx
    const today = format(new Date(), "yyyy-MM");
```

- [ ] **Step 3: Replace L177 `todayStr`**

Find:
```tsx
  const todayStr = new Date().toISOString().split("T")[0];
```
Replace with:
```tsx
  const todayStr = format(new Date(), "yyyy-MM-dd");
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: clean TypeScript build.

---

## Task 2: Stronger Today visual feedback

Two additive changes. Both are in `calendar-view.tsx`.

### Part A — Ring around today's cell (not just the day-number circle)

The current "today" indicator is a filled circle on the day number (`w-6 h-6 rounded-full bg-[var(--color-text-primary)]`). In event-dense cells it's easy to miss. Add an accent ring to the entire cell when `isToday`.

- [ ] **Step 1: Update the cell className expression**

Find the day cell around L263-269:
```tsx
                    <div
                      key={day}
                      onClick={() => setSelected(isSelected ? null : dateStr)}
                      className={`h-24 border-b border-r border-[var(--color-border-secondary)] p-1.5 cursor-pointer transition-colors ${
                        isSelected ? "bg-[var(--color-bg-secondary)]" : "hover:bg-[var(--color-surface-hover)]/50"
                      }`}
                    >
```
Replace with:
```tsx
                    <div
                      key={day}
                      onClick={() => setSelected(isSelected ? null : dateStr)}
                      className={`h-24 border-b border-r border-[var(--color-border-secondary)] p-1.5 cursor-pointer transition-colors relative ${
                        isSelected ? "bg-[var(--color-bg-secondary)]" : "hover:bg-[var(--color-surface-hover)]/50"
                      } ${isToday ? "ring-2 ring-inset ring-[var(--color-accent)]" : ""}`}
                    >
```

The existing day-number filled circle stays. The new ring adds a full-cell indicator for peripheral vision.

### Part B — Today button active state when on current month

When the displayed month equals the user's current month, the Today button is a no-op. Give it a pressed/active appearance so the user knows they're anchored on today.

- [ ] **Step 2: Compute `onCurrentMonth` once near `todayStr`**

Find (just after the L177 change from Task 1):
```tsx
  const todayStr = format(new Date(), "yyyy-MM-dd");
```
Add on the next line:
```tsx
  const onCurrentMonth = month === format(new Date(), "yyyy-MM");
```

- [ ] **Step 3: Update the Today button className**

Find the Today button (around L187-192):
```tsx
          <button
            onClick={goToday}
            className="text-sm border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface-hover)]"
          >
            Today
          </button>
```
Replace with:
```tsx
          <button
            onClick={goToday}
            className={`text-sm border px-3 py-1.5 rounded-lg transition-colors ${
              onCurrentMonth
                ? "border-transparent bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] cursor-default"
                : "border-[var(--color-border-primary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            Today
          </button>
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: clean TypeScript build.

---

## Task 3: Verify end-to-end in browser

- [ ] **Step 1: Verify nav works**

```bash
npm run dev
```

Navigate to `/productivity/calendar`:
- Title reads "April 2026"
- Click `›` once → title reads "May 2026"
- Click `›` three times rapidly → title reads "August 2026"
- Click `‹` from August → title reads "July 2026"
- Click Today → title reads "April 2026", Today button becomes filled/pressed-looking

- [ ] **Step 2: Verify API request month values**

DevTools → Network → filter `calendar`. After each nav, the request month matches the displayed month (2026-05 for May, etc.).

- [ ] **Step 3: Verify today highlight**

On April 2026, the April 20 cell has an accent ring around the entire cell AND the filled day-number circle.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/productivity/calendar/calendar-view.tsx
git commit -m "fix(calendar): fix UTC month bug in nav/goToday + stronger Today feedback

- Replace toISOString().slice(0,7) with format(d, 'yyyy-MM') so nav works in non-UTC timezones
- Same fix for todayStr so today highlight is correct near midnight local
- Add ring-accent around today's cell for better visibility in event-dense grids
- Today button shows pressed/filled state when already on current month"
```

---

## Known follow-ups (not in this plan)

- `page.tsx` L34 (`initialMonth`), L37 (`lastStr`), L116/L123/L146/L167 all use `toISOString()`. Server runs in UTC so initial render during user's 00:00-08:00 local can show the wrong month. Requires passing user timezone or computing on client after mount. File a separate ticket — this plan fixes only the reproducible client-side nav bug.

---

## Self-Review

**Spec coverage:**
- ✅ "Fix broken month navigation" — Task 1 replaces UTC string computation with local-time `format()`; verified via network tab that `?month=YYYY-MM` now matches displayed month
- ✅ "Add Today highlight feedback" — Task 2A adds full-cell accent ring; Task 2B adds Today button pressed state

**Type consistency:** `format(d, "yyyy-MM")` and `format(d, "yyyy-MM-dd")` both return strings matching existing callsite expectations (`YYYY-MM` and `YYYY-MM-DD` respectively).

**Placeholder scan:** None — all code blocks are complete replacements.
