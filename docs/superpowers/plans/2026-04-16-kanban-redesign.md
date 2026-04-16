# Kanban Redesign — Implementation Plan

**Date:** 2026-04-16
**Branch:** `feat/kanban-redesign`
**Scope:** Visual polish, predetermined default columns, Done = completion truth

---

## File Structure

```
supabase/migrations/
  00055_kanban_default_columns.sql          ← Task 1

src/app/api/kanban/
  columns/
    route.ts                                ← Task 2 (POST guard + DELETE guard)
    [id]/
      route.ts                              ← Task 2 (PATCH rename guard)

src/app/(dashboard)/productivity/kanban/
  kanban-board.tsx                          ← Tasks 3 + 4
  kanban-multi-board.tsx                    ← Task 5
```

---

## Task 1 — Migration: `is_default` column + seed defaults

**File:** `supabase/migrations/00055_kanban_default_columns.sql`

### What to do
- Add `is_default BOOLEAN NOT NULL DEFAULT false` to `kanban_columns`
- For every existing board, insert the four default columns if they don't exist, or mark matching names as default
- Matching is case-insensitive on name: `To Do`, `In Progress`, `Review`, `Done`

### SQL

```sql
-- 1. Add is_default column
ALTER TABLE kanban_columns
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- 2. Mark existing columns whose name matches a default name
UPDATE kanban_columns
SET is_default = true
WHERE lower(trim(name)) IN ('to do', 'in progress', 'review', 'done');

-- 3. For boards that are still missing one or more default columns, insert them
-- Uses a VALUES list joined against boards to find gaps
WITH defaults(name, sort_order) AS (
  VALUES
    ('To Do',      10),
    ('In Progress',20),
    ('Review',     30),
    ('Done',       40)
),
boards AS (
  SELECT id AS board_id FROM kanban_boards
),
existing AS (
  SELECT board_id, lower(trim(name)) AS lname
  FROM kanban_columns
  WHERE is_default = true
),
missing AS (
  SELECT b.board_id, d.name, d.sort_order
  FROM boards b
  CROSS JOIN defaults d
  WHERE NOT EXISTS (
    SELECT 1 FROM existing e
    WHERE e.board_id = b.board_id
      AND e.lname = lower(d.name)
  )
)
INSERT INTO kanban_columns (board_id, name, sort_order, is_default)
SELECT board_id, name, sort_order, true
FROM missing;
```

### Checklist
- [ ] Write migration file
- [ ] Run `supabase db push` locally and verify columns appear in Studio
- [ ] Confirm all four defaults exist on every existing board
- [ ] Verify `is_default = false` on all pre-existing custom columns

---

## Task 2 — Column API: guard default columns from delete/rename

### Files
- `src/app/api/kanban/columns/route.ts` — DELETE handler
- `src/app/api/kanban/columns/[id]/route.ts` — PATCH handler (rename)

### DELETE guard (columns/route.ts)

After fetching the column by id, check `is_default` before deleting:

```ts
// After auth checks, before delete:
const { data: col, error: fetchErr } = await supabase
  .from("kanban_columns")
  .select("is_default")
  .eq("id", id)
  .single();

if (fetchErr || !col) return NextResponse.json({ error: "Not found" }, { status: 404 });
if (col.is_default) return NextResponse.json({ error: "Default columns cannot be deleted" }, { status: 403 });
```

### PATCH guard (columns/[id]/route.ts)

If the PATCH payload includes a `name` field, reject if `is_default`:

```ts
// After auth checks, before update:
if (body.name !== undefined) {
  const { data: col } = await supabase
    .from("kanban_columns")
    .select("is_default")
    .eq("id", params.id)
    .single();
  if (col?.is_default) {
    return NextResponse.json({ error: "Default columns cannot be renamed" }, { status: 403 });
  }
}
```

### Checklist
- [ ] Add `is_default` fetch + 403 guard to DELETE handler in `columns/route.ts`
- [ ] Add `is_default` fetch + 403 guard to PATCH handler in `columns/[id]/route.ts`
- [ ] Confirm the `[id]/route.ts` file exists; if not, create it with PATCH + DELETE by-id support
- [ ] Manual test: attempt delete and rename of a default column → expect 403

---

## Task 3 — Kanban board: visual redesign

**File:** `src/app/(dashboard)/productivity/kanban/kanban-board.tsx`

### Card redesign

| Before | After |
|--------|-------|
| `p-3` padding | `p-2` padding |
| Background color tint by status | White/surface only (`bg-white dark:bg-zinc-900`) |
| No left border accent | 4px left border by priority (see below) |
| Assignee avatar full-size | `w-5 h-5` avatars, bottom-right |
| No due date display | `text-xs` due date bottom-left, `text-red-500` if overdue |

**Priority border colors:**

```ts
const priorityBorder: Record<string, string> = {
  low:    "border-l-4 border-l-zinc-300",
  medium: "border-l-4 border-l-blue-500",
  high:   "border-l-4 border-l-amber-500",
  urgent: "border-l-4 border-l-red-500",
};
```

**Card layout (new):**

```tsx
<div className={cn(
  "rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 shadow-sm",
  priorityBorder[card.priority ?? "low"]
)}>
  {/* Title — prominent */}
  <p className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100 mb-2">
    {card.title}
  </p>

  {/* Footer row */}
  <div className="flex items-end justify-between">
    {/* Due date — bottom left */}
    {card.due_date && (
      <span className={cn(
        "text-xs",
        isPast(new Date(card.due_date)) && !card.completed_at
          ? "text-red-500"
          : "text-zinc-400"
      )}>
        {format(new Date(card.due_date), "MMM d")}
      </span>
    )}
    {/* Assignee avatars — bottom right */}
    <div className="flex -space-x-1 ml-auto">
      {card.assignees?.map((a) => (
        <Avatar key={a.id} className="w-5 h-5 border border-white">
          <AvatarImage src={a.avatar_url} />
          <AvatarFallback className="text-[9px]">{a.initials}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  </div>
</div>
```

### Column redesign

- Fixed width: `w-[280px] flex-shrink-0`
- Horizontal scroll on board container: `flex gap-3 overflow-x-auto pb-4`
- Column header shows name + card count badge
- Default columns show a lock icon (`LockIcon` from lucide, `w-3 h-3 text-zinc-400`) next to name; rename/delete controls hidden when `column.is_default === true`

**Column header (new):**

```tsx
<div className="flex items-center justify-between mb-2 px-1">
  <div className="flex items-center gap-1.5">
    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
      {column.name}
    </span>
    {column.is_default && (
      <LockIcon className="w-3 h-3 text-zinc-400" />
    )}
    <span className="text-xs text-zinc-400 ml-1">
      {column.cards.length}
    </span>
  </div>
  {/* Only show controls for non-default columns */}
  {!column.is_default && <ColumnMenu column={column} />}
</div>
```

### Board container (new)

```tsx
<div className="flex gap-3 overflow-x-auto pb-4 items-start">
  {columns.map((col) => (
    <div key={col.id} className="w-[280px] flex-shrink-0">
      {/* column header + cards */}
    </div>
  ))}
</div>
```

### Checklist
- [ ] Extract a `KanbanCard` sub-component with new layout
- [ ] Add `priorityBorder` map and apply as className
- [ ] Add `isPast` due-date check (use `date-fns/isPast` — already a project dep)
- [ ] Resize assignee avatars to `w-5 h-5`
- [ ] Update column container to `w-[280px] flex-shrink-0`
- [ ] Update board wrapper to `flex gap-3 overflow-x-auto pb-4`
- [ ] Add `LockIcon` import; show on default columns; hide rename/delete controls
- [ ] Include `is_default` in column data fetched from `/api/kanban/boards` (or columns query)

---

## Task 4 — Kanban board: Done column completion sync

**File:** `src/app/(dashboard)/productivity/kanban/kanban-board.tsx`
**API:** `src/app/api/kanban/cards/[id]/route.ts` (PATCH handler)

### Logic

When a card is dropped into any column, the board calls PATCH `/api/kanban/cards/:id` with `{ column_id, sort_order }`.

Extend this PATCH handler to also:

1. Detect whether the destination column is a `Done` default column
2. Set `completed_at = now()` if moving **into** Done
3. Set `completed_at = null` if moving **out of** Done
4. After updating `completed_at`, check for linked items and sync their status

### PATCH handler additions (`cards/[id]/route.ts`)

```ts
// After updating the card's column_id / sort_order:

// Fetch destination column to check is_default + name
const { data: destCol } = await supabase
  .from("kanban_columns")
  .select("name, is_default")
  .eq("id", body.column_id)
  .single();

const movingToDone =
  destCol?.is_default && destCol.name.toLowerCase() === "done";

// 1. Update completed_at
const completedAt = movingToDone ? new Date().toISOString() : null;
await supabase
  .from("kanban_cards")
  .update({ completed_at: completedAt })
  .eq("id", params.id);

// 2. Sync linked creative_content_items
if (movingToDone) {
  await supabase
    .from("creative_content_items")
    .update({ status: "published" })   // or "approved" — confirm with schema
    .eq("linked_card_id", params.id);
} else {
  await supabase
    .from("creative_content_items")
    .update({ status: "in_progress" })
    .eq("linked_card_id", params.id);
}

// 3. Sync linked ad_requests
if (movingToDone) {
  await supabase
    .from("ad_requests")
    .update({ status: "approved" })
    .eq("linked_card_id", params.id);
} else {
  await supabase
    .from("ad_requests")
    .update({ status: "in_progress" })
    .eq("linked_card_id", params.id);
}
```

> **Note on content status value:** Verify the exact `status` enum on `creative_content_items` before using `"published"` — it may be `"completed"` or `"approved"`. Check `00048_creative_content_items.sql` or `00054_creatives_overhaul.sql`.

### Checklist
- [ ] Confirm `creative_content_items.status` valid values in migration 00048 / 00054
- [ ] Confirm `ad_requests.status` valid values in migration 00054
- [ ] Add destination-column lookup in PATCH card handler
- [ ] Write `completed_at` update (set / null) after column move
- [ ] Write `creative_content_items` status sync
- [ ] Write `ad_requests` status sync
- [ ] Test: move card to Done → `completed_at` set, linked items updated
- [ ] Test: move card out of Done → `completed_at` null, linked items reverted

---

## Task 5 — Multi-board: updated card rendering

**File:** `src/app/(dashboard)/productivity/kanban/kanban-multi-board.tsx`

### What to do
- Extract the new `KanbanCard` component (built in Task 3) into a shared file, e.g. `kanban-card.tsx` in the same directory
- Replace the existing inline card rendering in `kanban-multi-board.tsx` with `<KanbanCard card={card} />`
- Ensure `is_default` is passed through to column headers in multi-board view so lock icons display correctly
- Column width in multi-board stays `w-[280px] flex-shrink-0` (same as single-board)

### Checklist
- [ ] Extract `KanbanCard` into `src/app/(dashboard)/productivity/kanban/kanban-card.tsx`
- [ ] Import and use `KanbanCard` in `kanban-board.tsx`
- [ ] Import and use `KanbanCard` in `kanban-multi-board.tsx`
- [ ] Confirm multi-board column headers show lock icon on default columns
- [ ] Visual check: multi-board cards match single-board card design

---

## Commit Sequence

```bash
# 1 — Migration
git add supabase/migrations/00055_kanban_default_columns.sql
git commit -m "feat(kanban): add is_default column + seed default columns for all boards

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

# 2 — Column API guards
git add src/app/api/kanban/columns/route.ts src/app/api/kanban/columns/[id]/route.ts
git commit -m "feat(kanban): prevent delete/rename of default columns in API

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

# 3 — Visual redesign
git add src/app/(dashboard)/productivity/kanban/kanban-card.tsx \
        src/app/(dashboard)/productivity/kanban/kanban-board.tsx
git commit -m "feat(kanban): visual redesign — priority borders, compact cards, fixed-width columns

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

# 4 — Done completion sync
git add src/app/api/kanban/cards/[id]/route.ts
git commit -m "feat(kanban): Done column sets completed_at and syncs linked content/request status

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

# 5 — Multi-board updated rendering
git add src/app/(dashboard)/productivity/kanban/kanban-multi-board.tsx
git commit -m "feat(kanban): multi-board uses shared KanbanCard component

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Build Verification

After all tasks, run:

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5
```

Expected: zero type errors, zero build failures.

---

## Open Questions (resolve before executing)

1. **`creative_content_items.status` enum** — confirm whether `"published"`, `"completed"`, or `"approved"` is the correct terminal value. Check `supabase/migrations/00048_creative_content_items.sql`.
2. **`ad_requests.status` revert value** — confirm whether reverting out of Done should use `"in_progress"` or `"pending"`. Check `supabase/migrations/00054_creatives_overhaul.sql`.
3. **Card move API surface** — confirm whether `kanban-board.tsx` calls PATCH `/api/kanban/cards/[id]` or a different endpoint when a card is dragged between columns. If it's a different route, apply the completion-sync logic there instead.
4. **`is_default` in board data response** — confirm that the boards/columns fetch returns `is_default` (may need to add it to the SELECT in `/api/kanban/boards/route.ts` and the boards/[id] route).
