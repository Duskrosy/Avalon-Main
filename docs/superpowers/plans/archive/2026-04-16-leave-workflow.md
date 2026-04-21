# Leave Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing minimal leaves system with a full multi-stage leave workflow — request submission, OPS approval, form filing (employee self-report, OPS on behalf, or digital signature), and final OPS sign-off — with supporting document attachments and notifications at every transition.

**Architecture:** A new `leave_requests` table (separate from the existing `leaves` table, which tracks credits/status) drives the workflow through statuses: `pending → approved → awaiting_form → finalized` (or `rejected` at any stage). A companion `leave_attachments` table stores supporting documents (medical certs etc.) that are independent of the form-filing step. Notifications are inserted via the existing notifications API at every transition. The existing `src/app/(dashboard)/people/leaves/` route becomes the combined view — employees see their own requests; OPS/managers see the full queue — controlled by role props passed from the server component.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Supabase Storage (existing `leave-documents` bucket), Tailwind CSS with CSS variable theming, existing notifications infrastructure

---

## File Structure

### New files
- `supabase/migrations/00055_leave_workflow.sql` — `leave_requests` + `leave_attachments` tables, enums, RLS
- `src/app/api/leave-requests/route.ts` — GET (list) + POST (create)
- `src/app/api/leave-requests/[id]/route.ts` — GET (single) + PATCH (status transitions)
- `src/app/api/leave-requests/[id]/attachments/route.ts` — GET + POST (upload supporting docs)
- `src/lib/leave-requests/notifications.ts` — Notification helper functions for each workflow transition
- `src/app/(dashboard)/people/leaves/request-form.tsx` — Employee: new leave request modal/form
- `src/app/(dashboard)/people/leaves/my-requests-tab.tsx` — Employee: own request list + "Mark as Filed" + digital signature
- `src/app/(dashboard)/people/leaves/ops-queue-tab.tsx` — OPS: pending queue, approve/reject, re-notify, finalize

### Modified files
- `src/app/(dashboard)/people/leaves/leaves-view.tsx` — Add "My Requests" tab (all users) + "Leave Queue" tab (OPS/managers)
- `src/app/(dashboard)/people/leaves/page.tsx` — Pass `canManage` prop; pre-fetch initial data for both tabs

---

## Task 1: Database Migration — `leave_requests` + `leave_attachments`

**Files:**
- Create: `supabase/migrations/00055_leave_workflow.sql`

Creates the two new tables, enums, indexes, and RLS policies. The existing `leaves` table is untouched.

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 00055_leave_workflow.sql
-- Leave workflow: leave_requests (multi-stage) + leave_attachments
-- (supporting docs). The existing 'leaves' table is not modified.
-- ============================================================

-- ── 1. Enums ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.leave_request_type AS ENUM (
    'vacation', 'sick', 'emergency', 'personal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_request_status AS ENUM (
    'pending',
    'approved',
    'awaiting_form',
    'finalized',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 2. leave_requests ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id                    uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id          uuid                        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type            public.leave_request_type   NOT NULL,
  start_date            date                        NOT NULL,
  end_date              date                        NOT NULL,
  reason                text,
  status                public.leave_request_status NOT NULL DEFAULT 'pending',

  -- Approval
  approved_by           uuid                        REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at           timestamptz,
  rejection_reason      text,

  -- Form filing
  form_filed            boolean                     NOT NULL DEFAULT false,
  form_filed_by         uuid                        REFERENCES public.profiles(id) ON DELETE SET NULL,
  form_filed_at         timestamptz,
  form_signed_digitally boolean                     NOT NULL DEFAULT false,

  -- Finalization
  finalized_by          uuid                        REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_at          timestamptz,

  created_at            timestamptz                 NOT NULL DEFAULT now(),
  updated_at            timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_requests_requester   ON public.leave_requests (requester_id);
CREATE INDEX idx_leave_requests_status      ON public.leave_requests (status);
CREATE INDEX idx_leave_requests_dates       ON public.leave_requests (start_date, end_date);

CREATE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Requesters see their own requests
CREATE POLICY lr_select_own ON public.leave_requests
  FOR SELECT USING (requester_id = auth.uid());

-- OPS and managers see all requests in their scope
CREATE POLICY lr_select_ops ON public.leave_requests
  FOR SELECT USING (public.is_ops() OR public.is_manager_or_above());

-- Any authenticated user can submit a request
CREATE POLICY lr_insert ON public.leave_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

-- OPS can update any request (approve/reject/finalize)
CREATE POLICY lr_update_ops ON public.leave_requests
  FOR UPDATE USING (public.is_ops());

-- Requester can update their own request (mark form filed / digital sign)
CREATE POLICY lr_update_own ON public.leave_requests
  FOR UPDATE USING (requester_id = auth.uid());


-- ── 3. leave_attachments ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_attachments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id  uuid        NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  file_url          text        NOT NULL,
  file_name         text        NOT NULL,
  uploaded_by       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_attachments_request ON public.leave_attachments (leave_request_id);

ALTER TABLE public.leave_attachments ENABLE ROW LEVEL SECURITY;

-- Requester or OPS/manager can see attachments
CREATE POLICY la_select ON public.leave_attachments
  FOR SELECT USING (
    uploaded_by = auth.uid()
    OR public.is_ops()
    OR public.is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.id = leave_request_id AND lr.requester_id = auth.uid()
    )
  );

-- Requester or OPS can upload attachments
CREATE POLICY la_insert ON public.leave_attachments
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.is_ops()
      OR EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.id = leave_request_id AND lr.requester_id = auth.uid()
      )
    )
  );
```

- [ ] **Step 2: Apply the migration**

Push to Supabase (local or remote as appropriate):
```bash
supabase db push
```
Or apply directly in the Supabase SQL editor.

- [ ] **Step 3: Verify tables exist**

```bash
supabase db diff 2>&1 | grep "leave_request"
```
Expected: No diff (tables match migration).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00055_leave_workflow.sql
git commit -m "feat(leaves): add leave_requests and leave_attachments migration"
```

---

## Task 2: Leave Requests API — CRUD + Workflow Transitions

**Files:**
- Create: `src/app/api/leave-requests/route.ts`
- Create: `src/app/api/leave-requests/[id]/route.ts`

The GET handlers return requests scoped to role. The POST handler creates a new request and fires the submission notification. The PATCH handler handles all status transitions, enforces role gates, and fires transition notifications.

- [ ] **Step 1: Create `src/app/api/leave-requests/route.ts`**

```typescript
// src/app/api/leave-requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { notifyLeaveSubmitted } from "@/lib/leave-requests/notifications";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManage = isOps(currentUser) || isManagerOrAbove(currentUser);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("leave_requests")
    .select(`
      *,
      requester:profiles!requester_id(id, full_name, avatar_url, department_id),
      approver:profiles!approved_by(id, full_name),
      finalizer:profiles!finalized_by(id, full_name),
      attachments:leave_attachments(id, file_url, file_name, uploaded_by, created_at)
    `)
    .order("created_at", { ascending: false });

  if (!canManage) {
    query = query.eq("requester_id", currentUser.id);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { leave_type, start_date, end_date, reason } = body;

  if (!leave_type || !start_date || !end_date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      requester_id: currentUser.id,
      leave_type,
      start_date,
      end_date,
      reason: reason ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify OPS/managers that a new request was submitted
  await notifyLeaveSubmitted(supabase, data, currentUser);

  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/leave-requests/[id]/route.ts`**

```typescript
// src/app/api/leave-requests/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import {
  notifyLeaveApproved,
  notifyLeaveRejected,
  notifyFormRequired,
  notifyFormFiled,
  notifyLeaveFinalized,
} from "@/lib/leave-requests/notifications";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("leave_requests")
    .select(`
      *,
      requester:profiles!requester_id(id, full_name, avatar_url, department_id),
      approver:profiles!approved_by(id, full_name),
      finalizer:profiles!finalized_by(id, full_name),
      attachments:leave_attachments(id, file_url, file_name, uploaded_by, created_at)
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enforce visibility: requester or OPS/manager
  const canView =
    data.requester_id === currentUser.id ||
    isOps(currentUser) ||
    isManagerOrAbove(currentUser);
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action, rejection_reason, form_signed_digitally } = body;

  // Fetch existing request
  const { data: existing, error: fetchError } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userIsOps = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);
  const isRequester = existing.requester_id === currentUser.id;

  let updates: Record<string, unknown> = {};

  // ── Transition: approve ──────────────────────────────────────
  if (action === "approve") {
    if (!userIsOps && !userIsManager)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.status !== "pending")
      return NextResponse.json({ error: "Can only approve pending requests" }, { status: 400 });
    updates = {
      status: "approved",
      approved_by: currentUser.id,
      approved_at: new Date().toISOString(),
    };
  }

  // ── Transition: reject ───────────────────────────────────────
  else if (action === "reject") {
    if (!userIsOps && !userIsManager)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!["pending", "approved", "awaiting_form"].includes(existing.status))
      return NextResponse.json({ error: "Cannot reject at this stage" }, { status: 400 });
    updates = {
      status: "rejected",
      rejection_reason: rejection_reason ?? null,
    };
  }

  // ── Transition: request_form (OPS prompts employee to file) ──
  else if (action === "request_form") {
    if (!userIsOps && !userIsManager)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.status !== "approved")
      return NextResponse.json({ error: "Request must be approved first" }, { status: 400 });
    updates = { status: "awaiting_form" };
  }

  // ── Transition: mark_filed (employee or OPS on behalf) ───────
  else if (action === "mark_filed") {
    if (!isRequester && !userIsOps)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.status !== "awaiting_form")
      return NextResponse.json({ error: "Form not yet requested" }, { status: 400 });
    updates = {
      form_filed: true,
      form_filed_by: currentUser.id,
      form_filed_at: new Date().toISOString(),
      form_signed_digitally: form_signed_digitally ?? false,
    };
  }

  // ── Transition: finalize ─────────────────────────────────────
  else if (action === "finalize") {
    if (!userIsOps)
      return NextResponse.json({ error: "Only OPS can finalize" }, { status: 403 });
    if (!existing.form_filed)
      return NextResponse.json({ error: "Form must be filed before finalizing" }, { status: 400 });
    updates = {
      status: "finalized",
      finalized_by: currentUser.id,
      finalized_at: new Date().toISOString(),
    };
  }

  // ── Transition: re_notify (OPS reminds employee to file) ─────
  else if (action === "re_notify") {
    if (!userIsOps)
      return NextResponse.json({ error: "Only OPS can re-notify" }, { status: 403 });
    if (existing.status !== "awaiting_form")
      return NextResponse.json({ error: "No pending form reminder applicable" }, { status: 400 });
    // No DB update needed, just fire notification below
  }

  else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Apply DB updates (skip for re_notify)
  let updated = existing;
  if (Object.keys(updates).length > 0) {
    const { data: updatedData, error: updateError } = await supabase
      .from("leave_requests")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    updated = updatedData;
  }

  // Fire notifications
  if (action === "approve") {
    await notifyLeaveApproved(supabase, updated, currentUser);
    await notifyFormRequired(supabase, updated);
  } else if (action === "reject") {
    await notifyLeaveRejected(supabase, updated, currentUser);
  } else if (action === "request_form") {
    await notifyFormRequired(supabase, updated);
  } else if (action === "mark_filed") {
    await notifyFormFiled(supabase, updated, currentUser);
  } else if (action === "finalize") {
    await notifyLeaveFinalized(supabase, updated, currentUser);
  } else if (action === "re_notify") {
    await notifyFormRequired(supabase, existing, /* isReminder */ true);
  }

  return NextResponse.json(updated);
}
```

- [ ] **Step 3: Verify build passes**

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5
```
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/leave-requests/
git commit -m "feat(leaves): add leave-requests API — CRUD + workflow transitions"
```

---

## Task 3: Leave Attachments API — Supporting Document Upload

**Files:**
- Create: `src/app/api/leave-requests/[id]/attachments/route.ts`

Handles uploading and listing supporting documents (medical certs, etc.) attached to a leave request. Uses the existing Supabase Storage `leave-documents` bucket, matching the pattern from `src/app/api/leaves/[id]/documents/route.ts`.

- [ ] **Step 1: Create `src/app/api/leave-requests/[id]/attachments/route.ts`**

```typescript
// src/app/api/leave-requests/[id]/attachments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("leave_attachments")
    .select("*")
    .eq("leave_request_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the leave request exists and the user has permission
  const { data: leaveReq, error: fetchError } = await supabase
    .from("leave_requests")
    .select("id, requester_id")
    .eq("id", id)
    .single();

  if (fetchError || !leaveReq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canUpload =
    leaveReq.requester_id === currentUser.id ||
    isOps(currentUser) ||
    isManagerOrAbove(currentUser);
  if (!canUpload) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Upload to Supabase Storage
  const filePath = `leave-requests/${id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("leave-documents")
    .upload(filePath, file, { upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = supabase.storage
    .from("leave-documents")
    .getPublicUrl(filePath);

  // Insert record in leave_attachments
  const { data: attachment, error: insertError } = await supabase
    .from("leave_attachments")
    .insert({
      leave_request_id: id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      uploaded_by: currentUser.id,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(attachment, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/leave-requests/[id]/attachments/route.ts
git commit -m "feat(leaves): add leave attachments upload/list API"
```

---

## Task 4: Notification Helpers

**Files:**
- Create: `src/lib/leave-requests/notifications.ts`

Central helper that fires notifications for every workflow transition. Follows the existing pattern from other API routes — direct `supabase.from("notifications").insert(...)` calls with the correct column names (learned from the Apr 14 systemic fix: `recipient_id`, `actor_id`, `type`, `title`, `body`, `data`).

- [ ] **Step 1: Check notifications table columns**

```bash
grep -r "notifications.*insert" "/Users/fc-international-1/Documents/Avalon New/src/app/api" --include="*.ts" -l | head -3
```

Open one of those files and confirm the exact column names used in the working pattern.

- [ ] **Step 2: Create `src/lib/leave-requests/notifications.ts`**

```typescript
// src/lib/leave-requests/notifications.ts
import type { SupabaseClient } from "@supabase/supabase-js";

type Profile = { id: string; full_name?: string };

async function getOpsUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .lte("tier", 1);   // tier <= 1 = OPS Admin
  return (data ?? []).map((p: { id: string }) => p.id);
}

async function insertNotifications(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
) {
  if (rows.length === 0) return;
  await supabase.from("notifications").insert(rows);
}

/** Fired on POST /api/leave-requests — notify OPS/managers */
export async function notifyLeaveSubmitted(
  supabase: SupabaseClient,
  leaveRequest: Record<string, unknown>,
  requester: Profile
) {
  const opsIds = await getOpsUserIds(supabase);
  const rows = opsIds
    .filter((id) => id !== requester.id)
    .map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: requester.id,
      type: "leave_submitted",
      title: "New leave request",
      body: `${requester.full_name ?? "Someone"} submitted a ${leaveRequest.leave_type} leave request.`,
      data: { leave_request_id: leaveRequest.id },
    }));
  await insertNotifications(supabase, rows);
}

/** Fired on approve — notify requester to file the form */
export async function notifyLeaveApproved(
  supabase: SupabaseClient,
  leaveRequest: Record<string, unknown>,
  approver: Profile
) {
  await insertNotifications(supabase, [
    {
      recipient_id: leaveRequest.requester_id,
      actor_id: approver.id,
      type: "leave_approved",
      title: "Leave request approved",
      body: "Your leave request was approved. Please file your leave form to proceed.",
      data: { leave_request_id: leaveRequest.id },
    },
  ]);
}

/** Fired on reject — notify requester with reason */
export async function notifyLeaveRejected(
  supabase: SupabaseClient,
  leaveRequest: Record<string, unknown>,
  rejector: Profile
) {
  const reason = leaveRequest.rejection_reason
    ? ` Reason: ${leaveRequest.rejection_reason}`
    : "";
  await insertNotifications(supabase, [
    {
      recipient_id: leaveRequest.requester_id,
      actor_id: rejector.id,
      type: "leave_rejected",
      title: "Leave request rejected",
      body: `Your leave request was not approved.${reason}`,
      data: { leave_request_id: leaveRequest.id },
    },
  ]);
}

/** Fired on approve + request_form + re_notify — tell employee to file */
export async function notifyFormRequired(
  supabase: SupabaseClient,
  leaveRequest: Record<string, unknown>,
  isReminder = false
) {
  await insertNotifications(supabase, [
    {
      recipient_id: leaveRequest.requester_id,
      actor_id: null,
      type: isReminder ? "leave_form_reminder" : "leave_form_required",
      title: isReminder ? "Reminder: file your leave form" : "Please file your leave form",
      body: isReminder
        ? "This is a reminder that your leave form is still outstanding. Please file it as soon as possible."
        : "Your leave has been approved. Please file the official leave form to complete the process.",
      data: { leave_request_id: leaveRequest.id },
    },
  ]);
}

/** Fired on mark_filed — notify OPS that form is in */
export async function notifyFormFiled(
  supabase: SupabaseClient,
  leaveRequest: Record<string, unknown>,
  filer: Profile
) {
  const opsIds = await getOpsUserIds(supabase);
  const rows = opsIds
    .filter((id) => id !== filer.id)
    .map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: filer.id,
      type: "leave_form_filed",
      title: "Leave form filed",
      body: `${filer.full_name ?? "An employee"} has filed their leave form and is awaiting final approval.`,
      data: { leave_request_id: leaveRequest.id },
    }));
  await insertNotifications(supabase, rows);
}

/** Fired on finalize — notify requester the leave is fully approved */
export async function notifyLeaveFinalized(
  supabase: SupabaseClient,
  leaveRequest: Record<string, unknown>,
  finalizer: Profile
) {
  await insertNotifications(supabase, [
    {
      recipient_id: leaveRequest.requester_id,
      actor_id: finalizer.id,
      type: "leave_finalized",
      title: "Leave fully approved",
      body: "Your leave request has been finalized. Everything is in order.",
      data: { leave_request_id: leaveRequest.id },
    },
  ]);
}
```

- [ ] **Step 3: Verify build passes**

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/leave-requests/notifications.ts
git commit -m "feat(leaves): add notification helpers for all leave workflow transitions"
```

---

## Task 5: Employee View — Request Form + My Requests Tab

**Files:**
- Create: `src/app/(dashboard)/people/leaves/request-form.tsx`
- Create: `src/app/(dashboard)/people/leaves/my-requests-tab.tsx`

Employees can create new requests, see their own list with status badges, mark forms as filed, and digitally sign.

- [ ] **Step 1: Create `src/app/(dashboard)/people/leaves/request-form.tsx`**

A modal dialog triggered by a "New Leave Request" button. Fields: leave type (select), start date, end date, reason (textarea), optional supporting document upload. On submit, POST to `/api/leave-requests`, then optionally POST attachments to `/api/leave-requests/:id/attachments`.

Key implementation notes:
- Use a controlled `<form>` with `useState` for fields
- Leave type options: `vacation`, `sick`, `emergency`, `personal`
- Date inputs: `<input type="date">` with `min={today}`
- End date must be >= start date (client-side validation)
- File upload: `<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png">` — append each file to a `FormData` and POST separately to the attachments endpoint after the request is created
- Show a loading spinner while submitting; close dialog on success; call `onSuccess()` prop to refresh the list

```typescript
// src/app/(dashboard)/people/leaves/request-form.tsx
"use client";
// Props: open, onClose, onSuccess
// State: leaveType, startDate, endDate, reason, files[], loading, error
// Submit flow:
//   1. POST /api/leave-requests → get { id }
//   2. For each file: POST /api/leave-requests/:id/attachments (FormData)
//   3. Call onSuccess()
```

- [ ] **Step 2: Create `src/app/(dashboard)/people/leaves/my-requests-tab.tsx`**

Shows the current user's requests in a list/table. Each row shows: type badge, date range, status badge (color-coded: pending=yellow, approved=blue, awaiting_form=orange, finalized=green, rejected=red), reason preview, created date.

Inline actions per row based on status:
- `awaiting_form`: "Mark as Filed" button opens a small dialog with a "Digital Signature" checkbox + confirm button → PATCH `/api/leave-requests/:id` with `{ action: "mark_filed", form_signed_digitally: bool }`
- Any status: expandable row to show attachments (fetched on expand from `/api/leave-requests/:id/attachments`) + ability to upload more supporting docs while status is not `finalized` or `rejected`

Key implementation notes:
- Fetch on mount: `GET /api/leave-requests`
- Optimistic update on mark-filed: immediately update the local state
- Status badge component: reuse or create a small inline helper
- Empty state: "You have no leave requests yet" with a "Submit a Request" button

```typescript
// src/app/(dashboard)/people/leaves/my-requests-tab.tsx
"use client";
// Props: currentUserId, onNewRequest (opens RequestForm)
// State: requests[], loading, markFiledId (null | string), markDialogOpen, digitalSign
// Fetch: GET /api/leave-requests on mount
// Mark Filed: PATCH /api/leave-requests/:id { action: "mark_filed", form_signed_digitally }
```

- [ ] **Step 3: Verify build passes**

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/people/leaves/request-form.tsx src/app/(dashboard)/people/leaves/my-requests-tab.tsx
git commit -m "feat(leaves): add employee request form and my-requests tab"
```

---

## Task 6: OPS View — Leave Queue Tab

**Files:**
- Create: `src/app/(dashboard)/people/leaves/ops-queue-tab.tsx`

OPS/managers see all pending requests with approve/reject actions, plus approved/awaiting_form requests with re-notify and finalize controls.

- [ ] **Step 1: Create `src/app/(dashboard)/people/leaves/ops-queue-tab.tsx`**

Layout: a tab bar at the top of the panel — "Pending" | "In Progress" | "Finalized" | "Rejected" — filtering the same dataset client-side.

**Pending tab** — requests with `status = pending`:
- Card/row: avatar + name, leave type, date range, reason
- Actions: "Approve" (green button) → PATCH `{ action: "approve" }`, "Reject" (red outline button) → opens a small dialog to enter rejection reason → PATCH `{ action: "reject", rejection_reason }`

**In Progress tab** — requests with `status = approved | awaiting_form`:
- Shows current sub-status: "Approved — waiting for form" vs "Awaiting Form — employee notified"
- Actions for `approved`: "Request Form" → PATCH `{ action: "request_form" }` (transitions to `awaiting_form` and notifies)
- Actions for `awaiting_form`: "Re-notify" button → PATCH `{ action: "re_notify" }`; if `form_filed = true`, "Finalize" button → PATCH `{ action: "finalize" }`; "Mark Filed on Behalf" → PATCH `{ action: "mark_filed" }` (OPS can file on behalf)
- Attachment viewer: expandable row to see all attachments for the request

**Finalized tab** — read-only summary of finalized requests with date/approver info.

**Rejected tab** — read-only list showing rejection reasons.

Key implementation notes:
- Fetch on mount: `GET /api/leave-requests` (no filter — RLS returns all for OPS)
- Client-side filter by status for each tab
- After any PATCH action, refetch the list (or optimistically update)
- Rejection dialog: small `<dialog>` or shadcn `Dialog` with a `<textarea>` for the reason
- Re-notify shows a brief "Notified!" toast confirmation

```typescript
// src/app/(dashboard)/people/leaves/ops-queue-tab.tsx
"use client";
// Props: none (fetches its own data)
// State: requests[], loading, activeTab, rejectDialogId, rejectReason
// Fetch: GET /api/leave-requests on mount
// Sub-tabs: pending | in-progress | finalized | rejected
```

- [ ] **Step 2: Verify build passes**

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/people/leaves/ops-queue-tab.tsx
git commit -m "feat(leaves): add OPS leave queue tab — approve, reject, re-notify, finalize"
```

---

## Task 7: Leaves Page — Wire Everything Together

**Files:**
- Modify: `src/app/(dashboard)/people/leaves/leaves-view.tsx`
- Modify: `src/app/(dashboard)/people/leaves/page.tsx`

Add the new workflow tabs alongside the existing tabs (Leave History, File Leave, Team Leaves, Approvals). The existing tabs are preserved untouched.

- [ ] **Step 1: Update `leaves-view.tsx` to add new tabs**

The existing view already has a tab system. Add two new tabs:
- "My Requests" tab — renders `<MyRequestsTab>` for all users; has a "New Request" button in the tab header that opens `<RequestForm>`
- "Leave Queue" tab — renders `<OpsQueueTab>`, only shown when `isOps || isManager`

Tab ordering (insert after existing tabs or prepend — keep existing behaviour):
1. My Requests ← new, visible to all
2. Leave Queue ← new, visible to OPS/managers only
3. (existing tabs: Leave History, File Leave, Team Leaves, Approvals)

Implementation notes:
- Import `RequestForm`, `MyRequestsTab`, `OpsQueueTab` at the top of the file
- Add `requestFormOpen` state to control the `RequestForm` modal
- Pass `onNewRequest={() => setRequestFormOpen(true)}` to `MyRequestsTab`
- Pass `open={requestFormOpen}` + `onClose` + `onSuccess` to `RequestForm`

```typescript
// In leaves-view.tsx — add to existing tab list:
// { id: "my-requests", label: "My Requests", visible: true }
// { id: "leave-queue", label: "Leave Queue", visible: isOps || isManager }
```

- [ ] **Step 2: Verify page.tsx passes required props**

The server component at `page.tsx` already computes `isOps`, `isManager`, and `currentUserId`. No changes needed unless the `LeavesView` component signature changes — in that case update props accordingly.

- [ ] **Step 3: Verify build passes**

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5
```
Expected: Build succeeds. Zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/people/leaves/leaves-view.tsx src/app/(dashboard)/people/leaves/page.tsx
git commit -m "feat(leaves): wire new workflow tabs into leaves page"
```

---

## Summary

| Task | Files | Status |
|------|-------|--------|
| 1. Migration | `supabase/migrations/00055_leave_workflow.sql` | - [ ] |
| 2. Leave Requests API | `src/app/api/leave-requests/route.ts`, `[id]/route.ts` | - [ ] |
| 3. Attachments API | `src/app/api/leave-requests/[id]/attachments/route.ts` | - [ ] |
| 4. Notification helpers | `src/lib/leave-requests/notifications.ts` | - [ ] |
| 5. Employee view | `request-form.tsx`, `my-requests-tab.tsx` | - [ ] |
| 6. OPS view | `ops-queue-tab.tsx` | - [ ] |
| 7. Wire leaves page | `leaves-view.tsx`, `page.tsx` | - [ ] |

**Commit co-author for all commits:**
```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```
