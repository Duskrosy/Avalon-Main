# Admin Roadmap — Feature Goals + Pulse Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Feature Goals system to the Admin Development page, expose it read-only on the Executive Development tab, and wire Pulse feedback items to goals via a "Link to Feature Goal" action.

**Architecture:** One migration adds `feature_goals` and `feature_goal_tickets` tables. Three focused API routes handle CRUD and linking. The Admin Development page (`/admin/development`) gains a Feature Goals section below the existing KPI wiring tasklist. The Pulse tab gains a per-row "Link to Feature Goal" dropdown. The Executive Development page (`/executive/development`) renders a clean read-only milestone view.

**Tech Stack:** Next.js 16 (App Router), Supabase (admin client for OPS writes, server client for reads), Tailwind CSS with CSS variables, `@/lib/permissions`, `@/lib/api/validate`, zod

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/00056_feature_goals.sql` | `feature_goals` + `feature_goal_tickets` tables, indexes, RLS |
| `src/app/api/feature-goals/route.ts` | GET list + POST create |
| `src/app/api/feature-goals/[id]/route.ts` | PATCH update + DELETE |
| `src/app/api/feature-goals/[id]/tickets/route.ts` | POST link + DELETE unlink feedback items |
| `src/app/(dashboard)/admin/development/feature-goals-view.tsx` | Client component — full CRUD UI with progress bars, milestone groups, linked ticket list |
| `src/app/(dashboard)/executive/development/page.tsx` | Read-only milestone/progress view |

### Modified Files

| File | Changes |
|------|---------|
| `src/app/(dashboard)/admin/development/page.tsx` | Add `<FeatureGoalsView />` below existing KPI tasklist section |
| `src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx` | Add "Link to Feature Goal" button + dropdown per feedback row |

---

## Task 1: Migration — feature_goals + feature_goal_tickets

**File:** `supabase/migrations/00056_feature_goals.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 00056_feature_goals.sql
-- 1. feature_goals table
-- 2. feature_goal_tickets junction table
-- 3. RLS policies
-- ============================================================

-- 1. Feature goals
CREATE TABLE public.feature_goals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text,
  status      text        NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned', 'in_progress', 'done')),
  progress    integer     NOT NULL DEFAULT 0
              CHECK (progress >= 0 AND progress <= 100),
  milestone   text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_goals_status    ON public.feature_goals(status);
CREATE INDEX idx_feature_goals_milestone ON public.feature_goals(milestone);
CREATE INDEX idx_feature_goals_sort      ON public.feature_goals(sort_order);

ALTER TABLE public.feature_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_goals FORCE ROW LEVEL SECURITY;

-- All authenticated users may read
CREATE POLICY fg_select ON public.feature_goals
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- OPS only for writes
CREATE POLICY fg_insert ON public.feature_goals
  FOR INSERT WITH CHECK (public.is_ops());

CREATE POLICY fg_update ON public.feature_goals
  FOR UPDATE USING (public.is_ops());

CREATE POLICY fg_delete ON public.feature_goals
  FOR DELETE USING (public.is_ops());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_feature_goals_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feature_goals_updated_at
  BEFORE UPDATE ON public.feature_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_feature_goals_updated_at();

-- 2. Junction: feature_goal_tickets
CREATE TABLE public.feature_goal_tickets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_goal_id uuid        NOT NULL REFERENCES public.feature_goals(id) ON DELETE CASCADE,
  feedback_id     uuid        NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_goal_id, feedback_id)
);

CREATE INDEX idx_fgt_goal     ON public.feature_goal_tickets(feature_goal_id);
CREATE INDEX idx_fgt_feedback ON public.feature_goal_tickets(feedback_id);

ALTER TABLE public.feature_goal_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_goal_tickets FORCE ROW LEVEL SECURITY;

CREATE POLICY fgt_select ON public.feature_goal_tickets
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY fgt_insert ON public.feature_goal_tickets
  FOR INSERT WITH CHECK (public.is_ops());

CREATE POLICY fgt_delete ON public.feature_goal_tickets
  FOR DELETE USING (public.is_ops());
```

---

## Task 2: Feature Goals API — CRUD

**Files:**
- Create: `src/app/api/feature-goals/route.ts`
- Create: `src/app/api/feature-goals/[id]/route.ts`

### `src/app/api/feature-goals/route.ts`

- [ ] **Step 2: Create list + create route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";

const featureGoalCreateSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status:      z.enum(["planned", "in_progress", "done"]).default("planned"),
  progress:    z.number().int().min(0).max(100).default(0),
  milestone:   z.string().max(100).optional(),
  sort_order:  z.number().int().default(0),
});

// GET /api/feature-goals — list all goals with linked ticket counts
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("feature_goals")
    .select("*, feature_goal_tickets(id, feedback_id)")
    .order("milestone", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ goals: data });
}

// POST /api/feature-goals — create a new goal (OPS only)
export async function POST(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: body, error: validationError } = validateBody(featureGoalCreateSchema, raw);
  if (validationError) return validationError;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("feature_goals")
    .insert({ ...body, created_by: currentUser.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ goal: data }, { status: 201 });
}
```

### `src/app/api/feature-goals/[id]/route.ts`

- [ ] **Step 3: Create update + delete route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";

const featureGoalPatchSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status:      z.enum(["planned", "in_progress", "done"]).optional(),
  progress:    z.number().int().min(0).max(100).optional(),
  milestone:   z.string().max(100).nullable().optional(),
  sort_order:  z.number().int().optional(),
});

// PATCH /api/feature-goals/[id] — update a goal (OPS only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: body, error: validationError } = validateBody(featureGoalPatchSchema, raw);
  if (validationError) return validationError;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("feature_goals")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ goal: data });
}

// DELETE /api/feature-goals/[id] — delete a goal (OPS only)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("feature_goals")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

---

## Task 3: Feature Goal Tickets API — Link / Unlink

**File:** `src/app/api/feature-goals/[id]/tickets/route.ts`

- [ ] **Step 4: Create link/unlink route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";

const linkSchema = z.object({
  feedback_id: z.string().uuid(),
});

// POST /api/feature-goals/[id]/tickets — link a feedback item (OPS only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: feature_goal_id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: body, error: validationError } = validateBody(linkSchema, raw);
  if (validationError) return validationError;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("feature_goal_tickets")
    .insert({ feature_goal_id, feedback_id: body.feedback_id })
    .select()
    .single();

  if (error) {
    // Unique constraint violation — already linked
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already linked" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ticket: data }, { status: 201 });
}

// DELETE /api/feature-goals/[id]/tickets?feedback_id=... — unlink (OPS only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: feature_goal_id } = await params;
  const { searchParams } = new URL(request.url);
  const feedback_id = searchParams.get("feedback_id");

  if (!feedback_id) {
    return NextResponse.json({ error: "feedback_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("feature_goal_tickets")
    .delete()
    .eq("feature_goal_id", feature_goal_id)
    .eq("feedback_id", feedback_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

---

## Task 4: Admin Development Page — Feature Goals Section

**Files:**
- Create: `src/app/(dashboard)/admin/development/feature-goals-view.tsx`
- Modify: `src/app/(dashboard)/admin/development/page.tsx`

### `feature-goals-view.tsx`

- [ ] **Step 5: Create the FeatureGoalsView client component**

```tsx
"use client";

import { useState, useEffect, Fragment } from "react";

type FeatureGoal = {
  id: string;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "done";
  progress: number;
  milestone: string | null;
  sort_order: number;
  created_at: string;
  feature_goal_tickets: { id: string; feedback_id: string }[];
};

const STATUS_LABELS: Record<string, string> = {
  planned:     "Planned",
  in_progress: "In Progress",
  done:        "Done",
};

const STATUS_COLORS: Record<string, string> = {
  planned:     "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  in_progress: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  done:        "bg-[var(--color-success-light)] text-green-800",
};

const EMPTY_FORM = {
  title:       "",
  description: "",
  status:      "planned" as const,
  progress:    0,
  milestone:   "",
  sort_order:  0,
};

export function FeatureGoalsView() {
  const [goals, setGoals]           = useState<FeatureGoal[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<FeatureGoal | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);

  useEffect(() => { fetchGoals(); }, []);

  async function fetchGoals() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feature-goals");
      if (!res.ok) throw new Error("Failed to load feature goals");
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(goal: FeatureGoal) {
    setEditing(goal);
    setForm({
      title:       goal.title,
      description: goal.description ?? "",
      status:      goal.status,
      progress:    goal.progress,
      milestone:   goal.milestone ?? "",
      sort_order:  goal.sort_order,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description || undefined,
        milestone:   form.milestone   || undefined,
      };
      const url    = editing ? `/api/feature-goals/${editing.id}` : "/api/feature-goals";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setShowForm(false);
      setEditing(null);
      await fetchGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feature goal? This will also unlink all Pulse tickets.")) return;
    try {
      const res = await fetch(`/api/feature-goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await fetchGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // Group goals by milestone (null milestone last, labelled "No Milestone")
  const grouped = goals.reduce<Record<string, FeatureGoal[]>>((acc, g) => {
    const key = g.milestone ?? "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});
  const milestoneKeys = [
    ...Object.keys(grouped).filter(k => k !== "__none__").sort(),
    ...(grouped["__none__"] ? ["__none__"] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Feature Goals</h2>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          + New Goal
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[var(--color-text-secondary)]">Loading…</div>
      ) : goals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-secondary)]">
          No feature goals yet. Create one to start tracking progress.
        </div>
      ) : (
        <div className="space-y-8">
          {milestoneKeys.map(key => (
            <div key={key}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
                {key === "__none__" ? "No Milestone" : key}
              </h3>
              <div className="space-y-3">
                {grouped[key].map(goal => (
                  <div
                    key={goal.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[goal.status]}`}>
                            {STATUS_LABELS[goal.status]}
                          </span>
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {goal.title}
                          </span>
                        </div>
                        {goal.description && (
                          <p className="text-xs text-[var(--color-text-secondary)] mb-2 line-clamp-2">
                            {goal.description}
                          </p>
                        )}
                        {/* Progress bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                              style={{ width: `${goal.progress}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-[var(--color-text-secondary)] w-8 text-right">
                            {goal.progress}%
                          </span>
                        </div>
                        {goal.feature_goal_tickets.length > 0 && (
                          <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
                            {goal.feature_goal_tickets.length} linked Pulse ticket{goal.feature_goal_tickets.length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(goal)}
                          className="px-2 py-1 text-xs rounded hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="px-2 py-1 text-xs rounded hover:bg-red-50 text-red-500 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Form — inline slide-in */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full max-w-lg mx-4 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {editing ? "Edit Feature Goal" : "New Feature Goal"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  placeholder="e.g. Shift Swap Request System"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
                  placeholder="What problem does this solve?"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as typeof form.status }))}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Progress ({form.progress}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={form.progress}
                    onChange={e => setForm(f => ({ ...f, progress: Number(e.target.value) }))}
                    className="w-full mt-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Milestone</label>
                  <input
                    type="text"
                    value={form.milestone}
                    onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    placeholder="e.g. Q2 2026"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowForm(false); setEditing(null); }}
                className="px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Goal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Modify `page.tsx`

- [ ] **Step 6: Add `<FeatureGoalsView />` to the Admin Development page**

The admin development page was created by the KPI plan at `src/app/(dashboard)/admin/development/page.tsx`. Add the Feature Goals section below the existing KPI wiring tasklist:

```tsx
// Add to existing imports at top of file:
import { FeatureGoalsView } from "./feature-goals-view";

// Add below the KPI tasklist section in the JSX:
<div className="mt-10 border-t border-[var(--color-border)] pt-8">
  <FeatureGoalsView />
</div>
```

---

## Task 5: Pulse Tab — "Link to Feature Goal" Button

**File:** `src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx` (456 lines)

- [ ] **Step 7: Add goal-linking state and fetch to `PulseTab`**

At the top of the `PulseTab` component, alongside existing state, add:

```tsx
const [goals, setGoals]           = useState<{ id: string; title: string }[]>([]);
const [linkingId, setLinkingId]   = useState<string | null>(null); // feedback row being linked
const [linkGoalId, setLinkGoalId] = useState<string>("");
const [linking, setLinking]       = useState(false);
const [linkedMap, setLinkedMap]   = useState<Record<string, string[]>>({}); // feedbackId -> goalIds[]
```

Add a `fetchGoals()` helper and a `fetchLinked()` helper that runs after `fetchFeedback()`:

```tsx
async function fetchGoals() {
  try {
    const res = await fetch("/api/feature-goals");
    if (!res.ok) return;
    const data = await res.json();
    setGoals((data.goals ?? []).map((g: { id: string; title: string }) => ({ id: g.id, title: g.title })));
  } catch { /* non-critical */ }
}

async function fetchLinked(feedbackIds: string[]) {
  // Build a map of feedbackId -> linked goalIds by reading the embedded tickets
  // from the goals response (avoids a separate query)
  try {
    const res = await fetch("/api/feature-goals");
    if (!res.ok) return;
    const data = await res.json();
    const map: Record<string, string[]> = {};
    for (const goal of data.goals ?? []) {
      for (const t of goal.feature_goal_tickets ?? []) {
        if (!map[t.feedback_id]) map[t.feedback_id] = [];
        map[t.feedback_id].push(goal.id);
      }
    }
    setLinkedMap(map);
  } catch { /* non-critical */ }
}
```

Call both in `useEffect` alongside the existing `fetchFeedback()`:

```tsx
useEffect(() => {
  fetchFeedback();
  fetchGoals();
}, [statusFilter, categoryFilter]);
```

After setting feedback in `fetchFeedback`, call `fetchLinked` with the returned IDs.

- [ ] **Step 8: Add link handler**

```tsx
async function handleLink(feedbackId: string) {
  if (!linkGoalId) return;
  setLinking(true);
  try {
    const res = await fetch(`/api/feature-goals/${linkGoalId}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: feedbackId }),
    });
    if (!res.ok) {
      const d = await res.json();
      if (d.error === "Already linked") {
        alert("This ticket is already linked to that goal.");
      }
      return;
    }
    setLinkingId(null);
    setLinkGoalId("");
    // Refresh linked map
    const allIds = feedback.map(f => f.id);
    await fetchLinked(allIds);
  } finally {
    setLinking(false);
  }
}
```

- [ ] **Step 9: Add the "Link to Feature Goal" UI inside each expanded feedback row**

Inside the expanded row section (already rendered when `expandedId === item.id`), add at the bottom:

```tsx
{/* Link to Feature Goal */}
<div className="mt-4 pt-3 border-t border-[var(--color-border)]">
  <div className="flex items-center gap-2 flex-wrap">
    {/* Linked goal badges */}
    {(linkedMap[item.id] ?? []).map(goalId => {
      const g = goals.find(g => g.id === goalId);
      return g ? (
        <span
          key={goalId}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)]"
        >
          {g.title}
        </span>
      ) : null;
    })}
    {linkingId === item.id ? (
      <div className="flex items-center gap-2">
        <select
          value={linkGoalId}
          onChange={e => setLinkGoalId(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          <option value="">Select a goal…</option>
          {goals.map(g => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>
        <button
          onClick={() => handleLink(item.id)}
          disabled={linking || !linkGoalId}
          className="px-2 py-1 text-xs font-medium rounded bg-[var(--color-accent)] text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {linking ? "Linking…" : "Link"}
        </button>
        <button
          onClick={() => { setLinkingId(null); setLinkGoalId(""); }}
          className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          Cancel
        </button>
      </div>
    ) : (
      <button
        onClick={() => { setLinkingId(item.id); setLinkGoalId(""); }}
        className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
      >
        + Link to Feature Goal
      </button>
    )}
  </div>
</div>
```

---

## Task 6: Executive Development Tab — Read-Only Progress View

**File:** `src/app/(dashboard)/executive/development/page.tsx`

This page was created as a placeholder by the KPI plan. Replace its contents with a full read-only milestone view.

- [ ] **Step 10: Create the executive development page**

```tsx
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";

type FeatureGoal = {
  id: string;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "done";
  progress: number;
  milestone: string | null;
  sort_order: number;
  feature_goal_tickets: { id: string }[];
};

const STATUS_LABELS: Record<string, string> = {
  planned:     "Planned",
  in_progress: "In Progress",
  done:        "Done",
};

const STATUS_COLORS: Record<string, string> = {
  planned:     "bg-slate-100 text-slate-600",
  in_progress: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  done:        "bg-[var(--color-success-light)] text-green-800",
};

export default async function ExecutiveDevelopmentPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: goals, error } = await supabase
    .from("feature_goals")
    .select("*, feature_goal_tickets(id)")
    .order("milestone", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Failed to load feature goals: {error.message}
      </div>
    );
  }

  // Group by milestone
  const grouped = (goals ?? []).reduce<Record<string, FeatureGoal[]>>((acc, g) => {
    const key = g.milestone ?? "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  const milestoneKeys = [
    ...Object.keys(grouped).filter(k => k !== "__none__").sort(),
    ...(grouped["__none__"] ? ["__none__"] : []),
  ];

  const total     = (goals ?? []).length;
  const done      = (goals ?? []).filter(g => g.status === "done").length;
  const inProg    = (goals ?? []).filter(g => g.status === "in_progress").length;
  const avgProg   = total > 0
    ? Math.round((goals ?? []).reduce((sum, g) => sum + g.progress, 0) / total)
    : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{total}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Total Goals</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-accent)]">{inProg}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">In Progress</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{done}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Done</p>
        </div>
      </div>

      {/* Overall progress bar */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Overall Progress</span>
            <span className="text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">{avgProg}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all"
              style={{ width: `${avgProg}%` }}
            />
          </div>
        </div>
      )}

      {/* Milestones */}
      {total === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)] text-center py-12">
          No feature goals have been created yet.
        </p>
      ) : (
        <div className="space-y-8">
          {milestoneKeys.map(key => (
            <div key={key}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
                {key === "__none__" ? "Other" : key}
              </h2>
              <div className="space-y-3">
                {grouped[key].map(goal => (
                  <div
                    key={goal.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[goal.status]}`}>
                            {STATUS_LABELS[goal.status]}
                          </span>
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">
                            {goal.title}
                          </span>
                        </div>
                        {goal.description && (
                          <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                            {goal.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                              style={{ width: `${goal.progress}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-[var(--color-text-secondary)] w-8 text-right">
                            {goal.progress}%
                          </span>
                        </div>
                      </div>
                      {goal.feature_goal_tickets.length > 0 && (
                        <div className="shrink-0 text-right">
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {goal.feature_goal_tickets.length} ticket{goal.feature_goal_tickets.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Commit Strategy

Each task should be committed independently so rollback is clean.

```
feat(db): add feature_goals and feature_goal_tickets tables (migration 00056)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

```
feat(api): add feature goals CRUD and ticket linking routes

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

```
feat(admin): add Feature Goals section to Admin Development page

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

```
feat(pulse): add "Link to Feature Goal" action on feedback rows

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

```
feat(executive): add read-only Feature Goals view to Development tab

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

## Build Verification

After each commit, verify no TypeScript or Next.js build errors:

```bash
cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5
```

---

## Self-Check (per CLAUDE.md)

Before closing:
- [ ] `gitnexus_impact` run for all modified symbols
- [ ] No HIGH/CRITICAL risk warnings ignored
- [ ] `gitnexus_detect_changes()` confirms expected scope
- [ ] All d=1 dependents updated
