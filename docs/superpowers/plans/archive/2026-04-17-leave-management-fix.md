# Leave Management Fix & Rationalization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the page-crashing `profiles_1.full_name does not exist` DB error on `/people/leaves`, make the leave request form discoverable, add absent leave type, and clarify the confusing tab structure.

**Architecture:** The leave system has two parallel layers: legacy `leaves` table (credit-based, 2-tier approval) and new `leave_requests` table (4-stage workflow). The crash is caused by the new leave-requests API querying `full_name` from `profiles`, which only has `first_name` and `last_name`. Fix is a single migration adding a generated column. The tab UX is fixed by renaming labels and surfacing the "Request Leave" button at page level.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL 15), TypeScript

---

## Files

- Create: `supabase/migrations/00061_profiles_full_name_and_absent.sql`
- Modify: `src/app/(dashboard)/people/leaves/leaves-view.tsx`
- Modify: `src/app/(dashboard)/people/leaves/request-form.tsx`

---

## Task 1: Migration — Add `full_name` generated column + `absent` leave type

**Root cause:** `src/app/api/leave-requests/route.ts` lines 22-24 select `full_name` from the `profiles` table. The `profiles` table only has `first_name` and `last_name` (defined in `supabase/migrations/00001_foundation.sql` lines 148-149). When PostgREST joins `profiles` three times (requester, approver, finalizer), it aliases the second join as `profiles_1` and fails to find `full_name` → crash.

**Fix strategy:** Add `full_name` as a `GENERATED ALWAYS AS` stored column to `profiles`. No API or component code needs to change.

**Files:**
- Create: `supabase/migrations/00061_profiles_full_name_and_absent.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00061_profiles_full_name_and_absent.sql`:

```sql
-- Add full_name as a computed column (first_name || ' ' || last_name)
-- Fixes "column profiles_1.full_name does not exist" crash on /people/leaves
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text
  GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;

-- Add absent to the leave_request_type enum
ALTER TYPE public.leave_request_type ADD VALUE IF NOT EXISTS 'absent';
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected: Migration applies cleanly, no errors.

- [ ] **Step 3: Verify the fix**

```bash
npm run dev
```

Navigate to `/people/leaves`. The page should load without a red error banner. Open browser DevTools → Network tab → confirm `/api/leave-requests` returns 200 (not 500).

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00061_profiles_full_name_and_absent.sql
git commit -m "fix(leaves): add full_name generated column to profiles, add absent leave type"
```

---

## Task 2: Move "Request Leave" button above tabs + rename confusing tabs

**Problem:** The only way to open the leave request form is to click the "My Requests" tab, then find the button inside it. Users can't find the form. The tab labeled "Leave Queue" is actually the approvals mechanism — this confuses users who expect "Approvals" to be the approvals tab. The old "Approvals" tab is a legacy credit-based approval flow.

**Files:**
- Modify: `src/app/(dashboard)/people/leaves/leaves-view.tsx`

Current file is 142 lines. Changes are to the header area (lines 47-50) and the `tabs` array (lines 32-39).

- [ ] **Step 1: Add "Request Leave" button to the page header**

In `leaves-view.tsx`, replace the header block (lines 47-50):

```tsx
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Leaves & Absences</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage leave requests, balances, and approvals.</p>
      </div>
```

With:

```tsx
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Leaves & Absences</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage leave requests, balances, and approvals.</p>
        </div>
        <button
          type="button"
          onClick={() => setRequestFormOpen(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] hover:opacity-90 transition-opacity"
        >
          + Request Leave
        </button>
      </div>
```

- [ ] **Step 2: Rename tabs for clarity**

In `leaves-view.tsx`, replace the `tabs` array (lines 32-39):

```tsx
  const tabs: { id: TabId; label: string; show: boolean; managerSide?: boolean }[] = [
    { id: "my-requests", label: "My Requests",        show: true },
    { id: "file",        label: "File a Leave",        show: true },
    { id: "history",     label: "Leave History",       show: true },
    { id: "leave-queue", label: "Approvals Queue",     show: canManage, managerSide: true },
    { id: "team",        label: "Team Leaves",         show: canManage, managerSide: true },
    { id: "approvals",   label: "Credit Approvals",    show: canManage, managerSide: true },
  ];
```

- [ ] **Step 3: Verify UI**

```bash
npm run dev
```

Navigate to `/people/leaves` and confirm:
- "Request Leave" button is visible in the top-right of the page header
- Clicking it opens the request form modal
- OPS/manager tabs show "Approvals Queue" and "Credit Approvals" (not "Leave Queue" and "Approvals")
- Form opens regardless of which tab is active

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/people/leaves/leaves-view.tsx
git commit -m "feat(leaves): add request leave button to header, rename queue/approvals tabs"
```

---

## Task 3: Add "absent" to the leave request form

**Files:**
- Modify: `src/app/(dashboard)/people/leaves/request-form.tsx`

- [ ] **Step 1: Add absent to LeaveType type (line 8)**

Replace:

```tsx
type LeaveType = "vacation" | "sick" | "emergency" | "personal";
```

With:

```tsx
type LeaveType = "vacation" | "sick" | "emergency" | "personal" | "absent";
```

- [ ] **Step 2: Update getStartMin helper (line 30)**

Replace:

```tsx
function getStartMin(type: LeaveType): string | undefined {
  if (type === "emergency" || type === "sick") return undefined;
  return todayStr();
}
```

With:

```tsx
function getStartMin(type: LeaveType): string | undefined {
  if (type === "emergency" || type === "sick" || type === "absent") return undefined;
  return todayStr();
}
```

- [ ] **Step 3: Add absent to the options list**

Find the leave type options array (around line 171) and add absent after personal:

```tsx
                { value: "vacation",  label: "Vacation" },
                { value: "sick",      label: "Sick Leave" },
                { value: "emergency", label: "Emergency" },
                { value: "personal",  label: "Personal" },
                { value: "absent",    label: "Absent" },
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: Clean TypeScript build, no type errors.

- [ ] **Step 5: Verify form in browser**

```bash
npm run dev
```

Navigate to `/people/leaves`, click "Request Leave". Confirm "Absent" appears in the leave type dropdown. Select it and verify the start date field has no minimum date restriction (same as Emergency).

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/people/leaves/request-form.tsx
git commit -m "feat(leaves): add absent leave type to request form"
```

---

## Self-Review

**Spec coverage:**
- ✅ `profiles_1.full_name does not exist` — Task 1 (generated column migration)
- ✅ Form missing or not active — Task 2 (moves form button above tabs; bug fix in Task 1 unblocks My Requests tab)
- ✅ Leave queue confusing/overlaps approvals — Task 2 (rename to "Approvals Queue")
- ✅ My Requests vs Leave History — these show data from *different* tables (new vs legacy). Both tabs are preserved; the rename in Task 2 makes "Credit Approvals" vs "Approvals Queue" clearer about the two systems coexisting.
- ✅ Add absent — Tasks 1 (enum) + 3 (form UI)
- ✅ Add a leave form + sign approval from super ops / admin — The full 4-stage workflow (`leave_requests` → OpsQueueTab) already exists and will be unblocked by the Task 1 crash fix.

**Placeholder scan:** None found.

**Type consistency:** `absent` added to `leave_request_type` enum in migration (Task 1) and to `LeaveType` in the form component (Task 3). Both match.
