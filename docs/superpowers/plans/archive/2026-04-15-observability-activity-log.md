# Observability: Activity Log + Pulse Expandable Feedback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user Activity Log tab to Observability (OPS only), a department-scoped Team Activity page for managers, and make Pulse feedback rows expandable to show full text and metadata.

**Architecture:** The Activity Log combines data from two existing tables (`obs_app_events` and `obs_audit_logs`) into a unified timeline per user. A new API route `/api/obs/activity` serves both the OPS-only full view and the manager-scoped department view via a `scope` parameter. The Pulse tab gets click-to-expand rows with no API changes. No new database tables or migrations needed.

**Tech Stack:** Next.js App Router, Supabase, TypeScript, Tailwind CSS, date-fns

---

## Existing State

**Tables already available:**
- `obs_app_events` — event_name, actor_id, module, properties (jsonb), created_at, category, success
- `obs_audit_logs` — actor_id, action (INSERT/UPDATE/DELETE), table_name, record_id, old_values, new_values, created_at
- `profiles` — id, first_name, last_name, department_id, role_id, email, status

**Existing API routes:**
- `GET /api/obs/audit` — OPS only, paginated audit logs with optional actor_id filter
- `GET /api/obs/usage` — OPS only, aggregated usage analytics

**Existing UI:**
- `obs-dashboard.tsx` — 6-tab dashboard (Pulse, Usage, Errors, Audit, Alerts, Jobs)
- `pulse-tab.tsx` — 231 lines, feedback table with truncated body text (line 199: `max-w-xs truncate`)

**Permission helpers:** `isOps(user)`, `isManagerOrAbove(user)`, `getCurrentUser(supabase)`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/api/obs/activity/route.ts` | Create | Activity log API — unified events + audit per user/department |
| `src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx` | Create | OPS-only per-user activity timeline |
| `src/app/(dashboard)/admin/observability/obs-dashboard.tsx` | Modify | Add "Activity" tab to the tab bar |
| `src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx` | Modify | Add click-to-expand on feedback rows |
| `src/app/(dashboard)/team-activity/page.tsx` | Create | Manager-accessible department activity page (server component) |
| `src/app/(dashboard)/team-activity/team-activity-view.tsx` | Create | Client view for department activity |

---

## Task 1: Activity Log API Route

**Files:**
- Create: `src/app/api/obs/activity/route.ts`

This endpoint serves unified activity data by combining `obs_app_events` and `obs_audit_logs` into one timeline. Supports two scopes: `scope=all` (OPS only — can query any user) and `scope=department` (managers — restricted to their department members).

- [ ] **Step 1: Create the API route**

```typescript
// src/app/api/obs/activity/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

// GET /api/obs/activity?user_id=xxx&days=30&scope=all|department&module=xxx&limit=200
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "all";
  const userId = searchParams.get("user_id");
  const days = Math.min(parseInt(searchParams.get("days") ?? "30"), 90);
  const module = searchParams.get("module");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200"), 500);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Permission check
  if (scope === "all" && !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (scope === "department" && !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // For department scope, get department member IDs
  let memberIds: string[] | null = null;
  if (scope === "department") {
    const { data: members } = await admin
      .from("profiles")
      .select("id")
      .eq("department_id", currentUser.department_id)
      .is("deleted_at", null);
    memberIds = (members ?? []).map((m) => m.id);
    if (!memberIds.length) {
      return NextResponse.json({ events: [], audit: [], users: [] });
    }
  }

  // Build event query
  let eventsQuery = admin
    .from("obs_app_events")
    .select("id, event_name, category, actor_id, module, properties, success, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) eventsQuery = eventsQuery.eq("actor_id", userId);
  else if (memberIds) eventsQuery = eventsQuery.in("actor_id", memberIds);
  if (module) eventsQuery = eventsQuery.eq("module", module);

  // Build audit query
  let auditQuery = admin
    .from("obs_audit_logs")
    .select("id, actor_id, action, table_name, record_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) auditQuery = auditQuery.eq("actor_id", userId);
  else if (memberIds) auditQuery = auditQuery.in("actor_id", memberIds);

  // Fetch users for display
  let usersQuery = admin
    .from("profiles")
    .select("id, first_name, last_name, email, department_id, departments(name)")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  if (scope === "department" && currentUser.department_id) {
    usersQuery = usersQuery.eq("department_id", currentUser.department_id);
  }

  const [{ data: events }, { data: audit }, { data: users }] = await Promise.all([
    eventsQuery,
    auditQuery,
    usersQuery,
  ]);

  return NextResponse.json({
    events: events ?? [],
    audit: audit ?? [],
    users: users ?? [],
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/obs/activity/route.ts
git commit -m "feat(obs): activity log API with user and department scoping"
```

---

## Task 2: Activity Tab for Observability Dashboard

**Files:**
- Create: `src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx`
- Modify: `src/app/(dashboard)/admin/observability/obs-dashboard.tsx` (add tab)

OPS-only tab showing a per-user activity timeline. Select a user from a dropdown, see their combined events and audit actions in chronological order.

- [ ] **Step 1: Create the Activity tab component**

`activity-tab.tsx` should be a `'use client'` component with:

**User selector:**
- Dropdown listing all active profiles (fetched from the API response `users` array)
- Search/filter by name
- "All users" option for aggregate view

**Filters:**
- Days: 7 / 14 / 30 day buttons
- Module filter: dropdown populated from unique modules in the data
- Type toggle: "All" / "Events only" / "Audit only"

**Timeline view:**
- Merge events and audit into one array, sorted by `created_at` DESC
- Each entry rendered as a timeline row:
  - **App events**: colored dot by category (product=blue, audit=gray, error=red, performance=purple), event_name as label, module badge, timestamp, success/failure indicator
  - **Audit logs**: colored dot by action (INSERT=green, UPDATE=blue, DELETE=red), "{action} on {table_name}" as label, record_id, timestamp
- Group entries by date (today, yesterday, date headers)
- Pagination: "Load more" button (increment limit)

**Summary panel** (above timeline):
- Total events (this period)
- Most active module
- Last seen timestamp
- Event breakdown (pie or mini bar showing category distribution)

- [ ] **Step 2: Register the tab in obs-dashboard.tsx**

Modify `obs-dashboard.tsx` to:
1. Add import: `import { ActivityTab } from "./tabs/activity-tab";`
2. Add to TABS array: `{ id: "activity", label: "Activity" }` — insert after "audit" (position 5)
3. Add render: `{activeTab === "activity" && <ActivityTab />}`

The TABS array on line 11-18 becomes:
```typescript
const TABS = [
  { id: "pulse",    label: "Pulse" },
  { id: "usage",    label: "Usage" },
  { id: "errors",   label: "Errors" },
  { id: "audit",    label: "Audit" },
  { id: "activity", label: "Activity" },
  { id: "alerts",   label: "Alerts" },
  { id: "jobs",     label: "Jobs" },
] as const;
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/admin/observability/tabs/activity-tab.tsx
git add src/app/(dashboard)/admin/observability/obs-dashboard.tsx
git commit -m "feat(obs): per-user activity log tab in observability dashboard"
```

---

## Task 3: Team Activity Page for Managers

**Files:**
- Create: `src/app/(dashboard)/team-activity/page.tsx`
- Create: `src/app/(dashboard)/team-activity/team-activity-view.tsx`

A separate page accessible to managers (not inside the admin observability section). Shows department-scoped activity for the manager's team members. Managers can see what tasks/functions their team members are using.

- [ ] **Step 1: Create the server page**

```typescript
// src/app/(dashboard)/team-activity/page.tsx
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import TeamActivityView from "./team-activity-view";

export default async function TeamActivityPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  if (!isManagerOrAbove(user)) redirect("/");

  return <TeamActivityView currentUser={user} />;
}
```

- [ ] **Step 2: Create the client view**

`team-activity-view.tsx` should be a `'use client'` component with:

**Layout:**
- Page title: "Team Activity · {Department Name}"
- Subtitle: "Activity within your department workspace"

**Team member list (sidebar/top):**
- Grid of team members with: name, role, last active time
- Click a member to filter the timeline to that person
- "All members" to show aggregate

**Activity feed:**
- Fetches from `/api/obs/activity?scope=department&user_id=xxx&days=30`
- Same timeline rendering as the Activity tab (events + audit merged chronologically)
- But simpler — no module filter, just date range (7/14/30 days) and member filter

**Module usage summary:**
- For the selected member (or all), show which modules they've used
- Bar chart or list: module name + event count
- This gives managers visibility into "what functions/features my team is using"

**Key differences from OPS Activity tab:**
- Scoped to department only (enforced server-side)
- Simpler UI (no audit JSON diff expansion — managers don't need raw data)
- Focused on "who did what" not "what changed in the database"

- [ ] **Step 3: Add navigation link**

Add "Team Activity" to the navigation config (`src/lib/permissions/nav.ts`). It should be visible to managers and above, in a reasonable section (perhaps under an "Admin" or "Productivity" group, or as its own top-level item). Read the nav config first to determine the best placement.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/team-activity/ src/lib/permissions/nav.ts
git commit -m "feat: team activity page for manager workspace visibility"
```

---

## Task 4: Expandable Feedback Rows in Pulse Tab

**Files:**
- Modify: `src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx`

Make feedback rows clickable to expand and show the full body text plus all metadata. Currently the body is truncated at line 199 with `max-w-xs truncate`.

- [ ] **Step 1: Add expanded row state and toggle**

Add to the PulseTab component state:
```typescript
const [expandedId, setExpandedId] = useState<string | null>(null);
```

- [ ] **Step 2: Make the table row clickable**

Change the `<tr>` on line 188 from:
```tsx
<tr key={f.id} className="hover:bg-gray-50">
```
to:
```tsx
<tr
  key={f.id}
  className="hover:bg-gray-50 cursor-pointer"
  onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
>
```

- [ ] **Step 3: Add expanded detail row below each feedback entry**

After the closing `</tr>` of each feedback row (line 223), add a conditional expanded row:

```tsx
{expandedId === f.id && (
  <tr className="bg-gray-50">
    <td colSpan={6} className="px-4 py-4">
      <div className="space-y-3">
        {/* Full feedback body */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Full Feedback</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{f.body}</p>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-gray-200">
          <div>
            <p className="text-xs text-gray-400">Submitted by</p>
            <p className="text-sm text-gray-700">
              {f.profiles ? `${f.profiles.first_name} ${f.profiles.last_name}` : "Unknown"}
            </p>
            {f.profiles?.email && (
              <p className="text-xs text-gray-400">{f.profiles.email}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400">Category</p>
            <p className="text-sm text-gray-700">{CATEGORY_LABELS[f.category] ?? f.category}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Page</p>
            <p className="text-sm font-mono text-gray-600 break-all">{f.page_url ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Submitted</p>
            <p className="text-sm text-gray-700">
              {f.created_at ? format(parseISO(f.created_at), "d MMM yyyy 'at' HH:mm") : "—"}
            </p>
          </div>
        </div>

        {/* Department info if available */}
        {f.department_id && (
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-400">Department ID</p>
            <p className="text-xs font-mono text-gray-500">{f.department_id}</p>
          </div>
        )}

        {/* Status control */}
        <div className="pt-2 border-t border-gray-200 flex items-center gap-2">
          <p className="text-xs text-gray-400">Status:</p>
          <select
            value={f.status}
            onChange={(e) => {
              e.stopPropagation();
              updateStatus(f.id, e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            disabled={updating === f.id}
            className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[f.status] ?? "bg-gray-100 text-gray-600"} ${updating === f.id ? "opacity-50" : ""}`}
          >
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="wontfix">Won&apos;t fix</option>
          </select>
          <p className="text-xs text-gray-300">ID: {f.id.slice(0, 8)}</p>
        </div>
      </div>
    </td>
  </tr>
)}
```

- [ ] **Step 4: Add visual expand indicator**

Add a small chevron indicator to show the row is expandable. In the "From" column cell (line 189), add after the name text:

```tsx
<span className="ml-2 text-gray-300 text-xs">
  {expandedId === f.id ? "▼" : "▶"}
</span>
```

- [ ] **Step 5: Stop propagation on status dropdown clicks**

The existing status `<select>` on line 206 should stop click propagation so it doesn't toggle the row expansion. Add `onClick={(e) => e.stopPropagation()}` to the existing select.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx
git commit -m "feat(pulse): expandable feedback rows with full text and metadata"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Activity log per user (OPS only) → Task 2 (Activity tab)
- [x] Manager workspace visibility → Task 3 (Team Activity page)
- [x] Expandable feedback in Pulse → Task 4 (click-to-expand rows)
- [x] API to serve activity data → Task 1 (activity API route)
- [x] Navigation for managers → Task 3 Step 3

**Placeholder scan:** No TBDs, TODOs, or "implement later" found.

**Type consistency:** `ActivityItem` type used consistently. `FeedbackItem` type unchanged (already defined in pulse-tab.tsx). API response shape `{ events, audit, users }` matches both consumer components.
