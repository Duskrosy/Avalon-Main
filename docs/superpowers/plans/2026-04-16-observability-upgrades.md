# Observability Upgrades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV/MD export to the Pulse tab, enhance the Activity tab with page name display and sorting, and build a reusable item-level activity timeline component for Operations/Inventory.

**Architecture:** Pulse export is pure client-side — format the current `feedback[]` state as CSV or Markdown and trigger a download via `Blob` + `URL.createObjectURL`. Activity tab upgrades add a `page_url` column derived from app event `properties.page` and audit log context, with sortable column headers. The inventory timeline queries `obs_audit_logs` filtered by `table_name` + `record_id` to reconstruct a per-item action history, plus `inventory_movements` for the domain-specific trail.

**Tech Stack:** Next.js App Router, Supabase, date-fns, Tailwind CSS with CSS variable theming

---

## File Structure

### New files
- `src/lib/export/format.ts` — Reusable CSV/MD formatters (used by Pulse, reusable anywhere)
- `src/app/api/obs/item-timeline/route.ts` — API route for per-item audit + movement history
- `src/app/(dashboard)/operations/inventory/item-timeline.tsx` — Reusable timeline component for inventory items

### Modified files
- `src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx` — Add export buttons + download logic
- `src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx` — Add page name column, sortable headers, better user attribution
- `src/app/api/obs/activity/route.ts` — Include `properties` field in the events SELECT (currently excluded from audit display)
- `src/app/(dashboard)/operations/inventory/inventory-view.tsx` — Add "History" button per row that opens the timeline

---

## Task 1: Create Export Formatters

**Files:**
- Create: `src/lib/export/format.ts`

A utility module with functions to convert structured data into CSV and Markdown strings, plus a `downloadFile` helper that triggers a browser download.

- [ ] **Step 1: Create the export utility**

```typescript
// src/lib/export/format.ts

/**
 * Convert an array of objects to a CSV string.
 * Keys from the first row become headers.
 */
export function toCSV(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  if (rows.length === 0) return "";

  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => `"${c.label}"`).join(",");

  const body = rows.map((row) =>
    cols
      .map((c) => {
        const val = row[c.key];
        if (val == null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(",")
  );

  return [header, ...body].join("\n");
}

/**
 * Convert an array of objects to a Markdown table string.
 */
export function toMarkdown(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  if (rows.length === 0) return "_No data_";

  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const header = `| ${cols.map((c) => c.label).join(" | ")} |`;
  const divider = `| ${cols.map(() => "---").join(" | ")} |`;

  const body = rows.map(
    (row) =>
      `| ${cols
        .map((c) => {
          const val = row[c.key];
          if (val == null) return "-";
          return String(val).replace(/\|/g, "\\|").replace(/\n/g, " ");
        })
        .join(" | ")} |`
  );

  return [header, divider, ...body].join("\n");
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/export/format.ts
git commit -m "feat(export): add reusable CSV/Markdown formatters and downloadFile helper"
```

---

## Task 2: Add CSV/MD Export to Pulse Tab

**Files:**
- Modify: `src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx` (338 lines)

Add two export buttons ("Export CSV" and "Export MD") to the filter bar. They format the current `feedback` state (respecting active filters) and trigger a download.

- [ ] **Step 1: Add import**

At the top of `pulse-tab.tsx`, after the existing imports (line 4), add:

```typescript
import { toCSV, toMarkdown, downloadFile } from "@/lib/export/format";
```

- [ ] **Step 2: Add the export function inside PulseTab**

Inside the `PulseTab` component (after the `updateStatus` function, around line 97), add:

```typescript
function exportData(fmt: "csv" | "md") {
  const columns = [
    { key: "from", label: "From" },
    { key: "email", label: "Email" },
    { key: "department", label: "Department" },
    { key: "category", label: "Category" },
    { key: "body", label: "Feedback" },
    { key: "page_url", label: "Page" },
    { key: "status", label: "Status" },
    { key: "date", label: "Date" },
  ];

  const rows = feedback.map((f) => ({
    from: f.profiles ? `${f.profiles.first_name} ${f.profiles.last_name}` : "Unknown",
    email: f.profiles?.email ?? "",
    department: f.department?.name ?? "",
    category: CATEGORY_LABELS[f.category] ?? f.category,
    body: f.body,
    page_url: f.page_url ?? "",
    status: f.status,
    date: f.created_at ? format(parseISO(f.created_at), "yyyy-MM-dd HH:mm") : "",
  }));

  const timestamp = format(new Date(), "yyyy-MM-dd");
  if (fmt === "csv") {
    downloadFile(toCSV(rows, columns), `feedback-${timestamp}.csv`, "text/csv;charset=utf-8;");
  } else {
    const md = `# Feedback Export — ${timestamp}\n\n${toMarkdown(rows, columns)}`;
    downloadFile(md, `feedback-${timestamp}.md`, "text/markdown;charset=utf-8;");
  }
}
```

- [ ] **Step 3: Add export buttons to the filter bar**

In the filter bar section (around line 152-157), after the "Refresh" button, add two export buttons:

```tsx
<div className="ml-auto flex gap-2">
  <button
    onClick={() => exportData("csv")}
    disabled={feedback.length === 0}
    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] disabled:opacity-50 transition-colors"
  >
    Export CSV
  </button>
  <button
    onClick={() => exportData("md")}
    disabled={feedback.length === 0}
    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] disabled:opacity-50 transition-colors"
  >
    Export MD
  </button>
</div>
```

The filter bar's parent `<div>` (line 128) should have its className updated to include `flex-wrap` if not already present to handle the extra buttons on narrow screens.

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx
git commit -m "feat(pulse): add CSV and Markdown export for feedback data"
```

---

## Task 3: Upgrade Activity Tab — Page Name, Sorting, Better Attribution

**Files:**
- Modify: `src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx` (376 lines)
- Modify: `src/app/api/obs/activity/route.ts` (119 lines)

### Part A: Include properties in API response

The activity API currently selects `properties` for events but doesn't include it in the audit response. We need to make sure `properties` comes through so the Activity tab can extract `page` from it.

In `src/app/api/obs/activity/route.ts`, the events query at line 57 already selects `properties`. Good — no API change needed for events.

For audit entries at line 74, the query selects `id, actor_id, action, table_name, record_id, created_at`. Add `old_values, new_values` so we can show what changed:

Change line 74 from:
```typescript
    .select("id, actor_id, action, table_name, record_id, created_at")
```
To:
```typescript
    .select("id, actor_id, action, table_name, record_id, old_values, new_values, created_at")
```

### Part B: Upgrade activity-tab.tsx

**1. Update AuditEntry type (around line 19) to include the new fields:**
```typescript
type AuditEntry = {
  id: string;
  actor_id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};
```

**2. Add sort state and sort column type.** Inside `ActivityTab` (after `displayLimit` state, around line 93), add:

```typescript
const [sortCol, setSortCol] = useState<"time" | "user" | "page" | "module">("time");
const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
```

**3. Add a `getPage` helper** (near the other helpers, around line 82):

```typescript
function getPage(item: TimelineItem): string {
  if (item.kind === "event") {
    const props = item.data.properties;
    if (props && typeof props === "object" && "page" in props) {
      return String(props.page);
    }
    return item.data.module || "-";
  }
  // For audit entries, derive page from table_name
  const TABLE_TO_PAGE: Record<string, string> = {
    profiles: "People",
    departments: "People",
    leaves: "Leaves",
    kanban_boards: "Kanban",
    kanban_columns: "Kanban",
    kanban_cards: "Kanban",
    kops: "KOP Library",
    learning_materials: "Learning",
    memos: "Memos",
    smm_posts: "Content",
    smm_groups: "Content",
    creative_content_items: "Tracker",
    ad_assets: "Ad Ops",
    ad_requests: "Ad Ops",
    meta_campaigns: "Ad Ops",
    feedback: "Pulse",
    inventory_records: "Inventory",
    inventory_movements: "Inventory",
    catalog_items: "Catalog",
    ops_orders: "Orders",
    dispatch_queue: "Dispatch",
    confirmed_sales: "Sales",
    daily_volumes: "Sales",
    room_bookings: "Rooms",
  };
  return TABLE_TO_PAGE[item.data.table_name] ?? item.data.table_name;
}
```

**4. Add a `getChangeSummary` helper** for better "who did what" attribution:

```typescript
function getChangeSummary(item: TimelineItem): string {
  if (item.kind === "event") {
    return item.data.event_name;
  }
  const a = item.data;
  if (a.action === "INSERT") {
    const name = a.new_values?.title ?? a.new_values?.name ?? a.new_values?.product_name ?? a.new_values?.campaign_name ?? "";
    return name ? `Created "${name}"` : `Created record`;
  }
  if (a.action === "DELETE") {
    const name = a.old_values?.title ?? a.old_values?.name ?? a.old_values?.product_name ?? "";
    return name ? `Deleted "${name}"` : `Deleted record`;
  }
  // UPDATE — show changed fields
  if (a.old_values && a.new_values) {
    const changed = Object.keys(a.new_values).filter(
      (k) => !["updated_at", "created_at", "id"].includes(k) && JSON.stringify(a.old_values![k]) !== JSON.stringify(a.new_values![k])
    );
    if (changed.length <= 3) return `Updated ${changed.join(", ")}`;
    return `Updated ${changed.length} fields`;
  }
  return `${a.action} on ${a.table_name}`;
}
```

**5. Update the `timeline` memo to support sorting by column** (replace existing timeline memo around line 128):

```typescript
const timeline = useMemo<TimelineItem[]>(() => {
  const items: TimelineItem[] = [];

  if (typeFilter !== "audit") {
    data.events.forEach((e) => items.push({ kind: "event", data: e, created_at: e.created_at }));
  }
  if (typeFilter !== "events") {
    data.audit.forEach((a) => items.push({ kind: "audit", data: a, created_at: a.created_at }));
  }

  // Sort
  const dir = sortDir === "asc" ? 1 : -1;
  items.sort((a, b) => {
    if (sortCol === "time") {
      return dir * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    if (sortCol === "user") {
      return dir * userName(data.users, a.kind === "event" ? a.data.actor_id : a.data.actor_id)
        .localeCompare(userName(data.users, b.kind === "event" ? b.data.actor_id : b.data.actor_id));
    }
    if (sortCol === "page") {
      return dir * getPage(a).localeCompare(getPage(b));
    }
    if (sortCol === "module") {
      const am = a.kind === "event" ? a.data.module : a.data.table_name;
      const bm = b.kind === "event" ? b.data.module : b.data.table_name;
      return dir * am.localeCompare(bm);
    }
    return 0;
  });

  return items;
}, [data.events, data.audit, typeFilter, sortCol, sortDir]);
```

**6. Add a sortable header helper function** (near the other helpers):

```typescript
function SortHeader({ label, col, sortCol: sc, sortDir: sd, onSort }: {
  label: string;
  col: typeof sortCol;
  sortCol: typeof sortCol;
  sortDir: "asc" | "desc";
  onSort: (col: typeof sortCol) => void;
}) {
  const active = sc === col;
  return (
    <button
      onClick={() => onSort(col)}
      className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1 ${
        active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]"
      }`}
    >
      {label}
      {active && <span className="text-[10px]">{sd === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}
```

Note: `SortHeader` needs to be defined outside the component or accept the sort state as props. Since it references the sort state types, define it as an inline sub-component outside `ActivityTab`.

**7. Add a sort toggle handler** inside `ActivityTab`:

```typescript
function toggleSort(col: typeof sortCol) {
  if (sortCol === col) {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  } else {
    setSortCol(col);
    setSortDir("desc");
  }
}
```

**8. Add a sortable column header row before the timeline.** After the summary cards section (around line 256), before the timeline rendering, add:

```tsx
{/* Sortable headers */}
{!loading && timeline.length > 0 && (
  <div className="flex items-center gap-3 py-2 px-1 mb-2 border-b border-[var(--color-border-primary)]">
    <div className="w-24 shrink-0">
      <SortHeader label="Time" col="time" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
    </div>
    <div className="flex-1">
      <SortHeader label="Action" col="module" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
    </div>
    <div className="w-28 shrink-0">
      <SortHeader label="Page" col="page" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
    </div>
    <div className="w-32 shrink-0">
      <SortHeader label="User" col="user" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
    </div>
  </div>
)}
```

**9. Update the TimelineRow component to show page name and better attribution.** Replace the existing `TimelineRow` function (around line 322) with:

For the event row, add a page badge after the module badge:
```tsx
<span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium shrink-0">
  {getPage(item)}
</span>
```

For the audit row, replace the bare `{a.action} on {a.table_name}` text with the `getChangeSummary` output and add a page badge:
```tsx
<span className="text-sm text-[var(--color-text-primary)] truncate">
  {getChangeSummary(item)}
</span>
<span className="text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded font-medium shrink-0">
  {item.data.table_name}
</span>
<span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium shrink-0">
  {getPage(item)}
</span>
```

Also add the user's department in parentheses after their name:
```tsx
<span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
  {userName(data.users, actorId)}
  {(() => {
    const u = data.users.find((p) => p.id === actorId);
    return u?.departments?.name ? ` (${u.departments.name})` : "";
  })()}
</span>
```

Note: The `TimelineRow` component needs `users` passed to it (already the case) and access to the `getPage`/`getChangeSummary` helpers (they're in the same file scope).

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/api/obs/activity/route.ts src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx
git commit -m "feat(activity): add page name, sorting, and better action summaries to Activity tab"
```

---

## Task 4: Build Item Timeline API Route

**Files:**
- Create: `src/app/api/obs/item-timeline/route.ts`

A generic API that returns the audit history for a specific database record, plus domain-specific movement data for inventory items.

- [ ] **Step 1: Create the API route**

```typescript
// src/app/api/obs/item-timeline/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

// GET /api/obs/item-timeline?table=inventory_records&id=xxx&limit=100
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require at least manager access
  if (!isOps(currentUser) && !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tableName = searchParams.get("table");
  const recordId = searchParams.get("id");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100") || 100, 500);

  if (!tableName || !recordId) {
    return NextResponse.json({ error: "table and id are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Audit log entries for this record
  const { data: auditEntries, error: auditErr } = await admin
    .from("obs_audit_logs")
    .select("id, actor_id, action, table_name, record_id, old_values, new_values, created_at")
    .eq("table_name", tableName)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (auditErr) {
    return NextResponse.json({ error: auditErr.message }, { status: 500 });
  }

  // 2. If this is an inventory item, also fetch movements
  let movements: any[] = [];
  if (tableName === "inventory_records") {
    // Get the catalog_item_id from the inventory record
    const { data: invRecord } = await admin
      .from("inventory_records")
      .select("catalog_item_id")
      .eq("id", recordId)
      .maybeSingle();

    if (invRecord?.catalog_item_id) {
      const { data: movData } = await admin
        .from("inventory_movements")
        .select("id, catalog_item_id, adjustment_type, quantity, notes, performed_by, created_at")
        .eq("catalog_item_id", invRecord.catalog_item_id)
        .order("created_at", { ascending: false })
        .limit(limit);
      movements = movData ?? [];
    }
  }

  // 3. Resolve actor profiles
  const actorIds = new Set<string>();
  (auditEntries ?? []).forEach((e) => { if (e.actor_id) actorIds.add(e.actor_id); });
  movements.forEach((m) => { if (m.performed_by) actorIds.add(m.performed_by); });

  let actors: any[] = [];
  if (actorIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", Array.from(actorIds));
    actors = profiles ?? [];
  }

  return NextResponse.json({
    audit: auditEntries ?? [],
    movements,
    actors,
  });
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/obs/item-timeline/route.ts
git commit -m "feat(obs): add item-timeline API for per-record audit history"
```

---

## Task 5: Build Inventory Item Timeline Component

**Files:**
- Create: `src/app/(dashboard)/operations/inventory/item-timeline.tsx`

A modal/panel component that shows the full history of changes to an inventory record — both audit log entries (field changes) and inventory movements (stock adjustments).

- [ ] **Step 1: Create the timeline component**

```typescript
// src/app/(dashboard)/operations/inventory/item-timeline.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

type AuditEntry = {
  id: string;
  actor_id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

type Movement = {
  id: string;
  catalog_item_id: string;
  adjustment_type: string;
  quantity: number;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
};

type Actor = { id: string; first_name: string; last_name: string };

type TimelineEntry = {
  id: string;
  kind: "audit" | "movement";
  created_at: string;
  actor_id: string | null;
  summary: string;
  detail: string | null;
  badge: { label: string; color: string };
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  UPDATE: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  DELETE: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  received: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  dispatched: "bg-orange-100 text-orange-700",
  returned: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  damaged: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  correction: "bg-purple-100 text-purple-700",
  reserved: "bg-yellow-100 text-yellow-800",
  released: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
};

function actorName(actors: Actor[], id: string | null): string {
  if (!id) return "System";
  const a = actors.find((p) => p.id === id);
  return a ? `${a.first_name} ${a.last_name}` : "Unknown";
}

function auditSummary(entry: AuditEntry): { summary: string; detail: string | null } {
  if (entry.action === "INSERT") {
    return { summary: "Record created", detail: null };
  }
  if (entry.action === "DELETE") {
    return { summary: "Record deleted", detail: null };
  }
  // UPDATE — enumerate changed fields
  if (entry.old_values && entry.new_values) {
    const changes: string[] = [];
    for (const key of Object.keys(entry.new_values)) {
      if (["updated_at", "created_at", "id"].includes(key)) continue;
      if (JSON.stringify(entry.old_values[key]) !== JSON.stringify(entry.new_values[key])) {
        const from = entry.old_values[key] ?? "null";
        const to = entry.new_values[key] ?? "null";
        changes.push(`${key}: ${from} → ${to}`);
      }
    }
    if (changes.length === 0) return { summary: "No visible changes", detail: null };
    return {
      summary: `Updated ${changes.length} field${changes.length > 1 ? "s" : ""}`,
      detail: changes.join("\n"),
    };
  }
  return { summary: entry.action, detail: null };
}

export function ItemTimeline({
  recordId,
  tableName,
  itemLabel,
  onClose,
}: {
  recordId: string;
  tableName: string;
  itemLabel: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/obs/item-timeline?table=${encodeURIComponent(tableName)}&id=${encodeURIComponent(recordId)}`
    );
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setActors(data.actors ?? []);

    const items: TimelineEntry[] = [];

    // Audit entries
    for (const a of (data.audit ?? []) as AuditEntry[]) {
      const { summary, detail } = auditSummary(a);
      items.push({
        id: a.id,
        kind: "audit",
        created_at: a.created_at,
        actor_id: a.actor_id,
        summary,
        detail,
        badge: { label: a.action, color: ACTION_COLORS[a.action] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]" },
      });
    }

    // Movements
    for (const m of (data.movements ?? []) as Movement[]) {
      const sign = ["received", "returned", "released"].includes(m.adjustment_type) ? "+" : "-";
      items.push({
        id: m.id,
        kind: "movement",
        created_at: m.created_at,
        actor_id: m.performed_by,
        summary: `${m.adjustment_type.charAt(0).toUpperCase() + m.adjustment_type.slice(1)} ${sign}${m.quantity}`,
        detail: m.notes,
        badge: {
          label: m.adjustment_type,
          color: ACTION_COLORS[m.adjustment_type] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
        },
      });
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEntries(items);
    setLoading(false);
  }, [recordId, tableName]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh] overflow-y-auto">
      <div
        className="w-full max-w-lg rounded-2xl bg-[var(--color-bg-primary)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Item History</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{itemLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] text-lg"
          >
            &times;
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-[var(--color-text-tertiary)]">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-sm text-[var(--color-text-tertiary)]">
            No history found for this item.
          </div>
        ) : (
          <div className="space-y-0 max-h-[60vh] overflow-y-auto">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 py-3 border-b border-[var(--color-border-secondary)] last:border-b-0"
              >
                <span className="text-xs text-[var(--color-text-tertiary)] w-20 shrink-0 pt-0.5">
                  {format(parseISO(entry.created_at), "d MMM HH:mm")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${entry.badge.color}`}>
                      {entry.badge.label}
                    </span>
                    <span className="text-sm text-[var(--color-text-primary)]">{entry.summary}</span>
                  </div>
                  {entry.detail && (
                    <pre className="text-xs text-[var(--color-text-tertiary)] mt-1 whitespace-pre-wrap font-mono">
                      {entry.detail}
                    </pre>
                  )}
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    {actorName(actors, entry.actor_id)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/operations/inventory/item-timeline.tsx
git commit -m "feat(inventory): add ItemTimeline component for per-record audit history"
```

---

## Task 6: Wire Up Timeline to Inventory View

**Files:**
- Modify: `src/app/(dashboard)/operations/inventory/inventory-view.tsx`

Add a "History" button to each inventory row that opens the `ItemTimeline` modal.

- [ ] **Step 1: Add import at the top of inventory-view.tsx**

```typescript
import { ItemTimeline } from "./item-timeline";
```

- [ ] **Step 2: Add state for the selected timeline item**

Inside the main component, add:
```typescript
const [timelineItem, setTimelineItem] = useState<{ id: string; label: string } | null>(null);
```

- [ ] **Step 3: Add a "History" button to each inventory row**

Find where each inventory record renders an actions area (edit/delete buttons or similar). Add a History button alongside them:

```tsx
<button
  onClick={(e) => {
    e.stopPropagation();
    setTimelineItem({
      id: record.id,
      label: record.catalog?.product_name
        ? `${record.catalog.product_name}${record.catalog.sku ? ` (${record.catalog.sku})` : ""}`
        : record.id,
    });
  }}
  className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
  title="View history"
>
  History
</button>
```

- [ ] **Step 4: Render the timeline modal at the bottom of the component**

Before the closing `</div>` of the main component, and after any existing modals, add:

```tsx
{timelineItem && (
  <ItemTimeline
    recordId={timelineItem.id}
    tableName="inventory_records"
    itemLabel={timelineItem.label}
    onClose={() => setTimelineItem(null)}
  />
)}
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/operations/inventory/inventory-view.tsx
git commit -m "feat(inventory): wire up ItemTimeline modal to inventory rows"
```

---

## Task 7: Verify End-to-End

- [ ] **Step 1: Run full build**

Run: `npm run build 2>&1 | tail -30`
Expected: Build succeeds with no errors

- [ ] **Step 2: Test checklist**

1. Navigate to `/admin/observability` → Pulse tab
   - Verify "Export CSV" and "Export MD" buttons appear in the filter bar
   - Click "Export CSV" — verify a `.csv` file downloads with correct data
   - Click "Export MD" — verify a `.md` file downloads with a formatted table
   - Apply a status filter, then export — verify exported data matches the filter

2. Navigate to `/admin/observability` → Activity tab
   - Verify each timeline row now shows a "Page" badge (indigo)
   - Verify audit entries show "Created X" / "Updated N fields" instead of bare "INSERT on table"
   - Verify user names show department in parentheses
   - Click column headers (Time, Action, Page, User) to sort
   - Verify sort indicators (▲/▼) appear and data reorders

3. Navigate to `/operations/inventory`
   - Verify each inventory row has a "History" button
   - Click "History" — verify the timeline modal opens
   - Verify audit entries show with timestamps, actor names, and change details
   - Verify movements show with adjustment types and quantities
   - Close the modal

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(obs): address any issues found during testing"
```

---

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Pulse tab** | View-only table with filters | + Export CSV / Export MD buttons |
| **Activity tab** | Bare timeline with event name and "INSERT on table" | Page badges, sortable columns, "Created X" / "Updated N fields" summaries, user department |
| **Activity API** | Audit entries excluded old_values/new_values | Now returns old_values/new_values for richer UI |
| **Inventory** | No item-level history | "History" button opens timeline modal showing audit entries + stock movements |
| **Shared** | No export utilities | `src/lib/export/format.ts` with reusable CSV/MD formatters |
