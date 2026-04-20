# Sprint C — Pulse Transparency

**Date:** 2026-04-20
**Tickets:** #2 (admin-side: priority, notes, merge-similar, user-reply), #8 (read-only public page for non-OPS)
**Status:** Ready to implement

## Context

The Pulse feedback system already has:
- `feedback` table (migration 00036) with `id, user_id, department_id, category, body, page_url, status, created_at`, plus `user_agent` from 00051
- `/api/feedback` POST/GET/PATCH CRUD — PATCH is OPS-only, status-only
- `admin/observability/tabs/pulse-tab.tsx` with expandable rows, CSV/MD export, Feature Goals linking, status + category + department filters, device-info parser
- Feedback widget for submission

What's missing for #2 / #8:
- OPS-side priority + notes fields
- Ability to merge duplicate tickets
- User-visible replies (admin → reporter)
- Read-only ticket list all authenticated users can browse (transparency)

## Migration

**File:** `supabase/migrations/00066_pulse_priority_notes_merge.sql`

```sql
-- Priority + internal notes + duplicate merging
ALTER TABLE public.feedback
  ADD COLUMN priority       text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN notes          text,
  ADD COLUMN merged_into_id uuid REFERENCES public.feedback(id) ON DELETE SET NULL,
  ADD COLUMN updated_at     timestamptz NOT NULL DEFAULT now();

CREATE INDEX feedback_priority_idx       ON public.feedback(priority);
CREATE INDEX feedback_merged_into_id_idx ON public.feedback(merged_into_id);

-- Comment thread (OPS replies visible to reporter)
CREATE TABLE public.feedback_comments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_comments_feedback_id_idx ON public.feedback_comments(feedback_id);

ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;

-- Read: the reporter OR OPS
CREATE POLICY feedback_comments_select ON public.feedback_comments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = feedback_comments.feedback_id
        AND (f.user_id = auth.uid() OR public.is_ops(auth.uid()))
    )
  );

-- Write: OPS only
CREATE POLICY feedback_comments_insert ON public.feedback_comments
  FOR INSERT TO authenticated WITH CHECK (public.is_ops(auth.uid()));
```

Assumes `public.is_ops(uuid)` exists (it does — used elsewhere). Adjust helper name if different.

## Tasks

### Task 1 — Extend feedback API

**File:** `src/app/api/feedback/route.ts`

1. Update PATCH zod schema to accept optional `priority`, `notes`, `merged_into_id`:
   ```ts
   const patchSchema = z.object({
     id: z.string().uuid(),
     status: z.enum(['open','acknowledged','resolved','wontfix']).optional(),
     priority: z.enum(['low','medium','high','urgent']).optional(),
     notes: z.string().nullable().optional(),
     merged_into_id: z.string().uuid().nullable().optional(),
   }).refine(v => v.status || v.priority || v.notes !== undefined || v.merged_into_id !== undefined, {
     message: 'at least one field required',
   });
   ```
2. Keep OPS-only guard. Touch `updated_at = now()` on every patch.
3. GET: include `priority`, `notes` (only when caller is OPS — redact `notes` otherwise), `merged_into_id`. Also expand `merged_into` basic shape for display.

### Task 2 — Comments endpoints

**New file:** `src/app/api/feedback/[id]/comments/route.ts`

- `GET` — list comments for the feedback. Reporter or OPS only. Return `{ comments: [{ id, body, created_at, author: { id, first_name, last_name, avatar_url } }] }`.
- `POST` — OPS only. Body `{ body: string }`. Insert, return created row.

Use admin client for the insert to bypass RLS issues around the join select.

### Task 3 — Admin PulseTab enhancements

**File:** `src/app/(dashboard)/admin/observability/tabs/pulse-tab.tsx`

1. Add `priority` to the `FeedbackItem` type, the column header (sortable), and a color-coded badge (low=gray, medium=blue, high=amber, urgent=red).
2. Inside the expandable row:
   - **Priority selector** (segmented/pill group) — PATCH on change.
   - **Internal notes** textarea (OPS-only) with debounced save (500ms) — PATCH on change.
   - **Merge dropdown** — "Mark as duplicate of…" opens a search input that queries other open feedback. On select, PATCH `merged_into_id`. Show a "Merged into #X" banner when `merged_into_id` is set (with unlink button).
   - **Comment thread** — list comments, plus a textarea + "Reply" button. POST to `/api/feedback/[id]/comments`.
3. Add priority filter next to existing status/category filters.
4. Default sort: `priority desc, created_at desc` (urgent tickets float).
5. Hide rows where `merged_into_id IS NOT NULL` by default; add a "Show merged" toggle.
6. CSV/MD export: include `priority`, `notes`, `merged_into_id`, and comment count.

### Task 4 — Read-only public tickets page (#8)

**New file:** `src/app/(dashboard)/pulse/tickets/page.tsx`

Server component. Visible to all authenticated users.

Show:
- Table of non-merged feedback across all departments: `created_at`, `category`, `status` badge, `priority` badge, `department` name, `body` (truncated), comment count.
- Filters: status, category, department, priority.
- **Redacted fields:** reporter name (show only "Someone in {dept}" unless viewer is OPS or the reporter), `notes`, `user_agent`, `page_url`.
- Row click → expandable detail showing full body and public comment thread (reply textarea visible only to OPS — reuse admin component or a trimmed version).

**New file:** `src/app/(dashboard)/pulse/tickets/tickets-view.tsx` — client component for filter/sort/expand.

Data fetch: server component calls Supabase directly with RLS on (the existing RLS permits SELECT to reporter + OPS; we need a broader SELECT for transparency — see Task 5).

### Task 5 — Broaden feedback SELECT RLS for public view

**In the same migration 00066** (or a small follow-up) add:

```sql
-- Everyone authenticated can read summary fields (body, category, status, priority, created_at, department)
-- but RLS can't column-gate, so instead: expose a view.
CREATE OR REPLACE VIEW public.feedback_public AS
SELECT
  f.id, f.category, f.status, f.priority, f.created_at, f.updated_at,
  f.department_id, f.body, f.merged_into_id,
  -- reporter_initials for anonymous attribution
  CASE WHEN public.is_ops(auth.uid()) OR f.user_id = auth.uid()
       THEN f.user_id
       ELSE NULL END AS user_id,
  (SELECT count(*) FROM public.feedback_comments c WHERE c.feedback_id = f.id) AS comment_count
FROM public.feedback f
WHERE f.merged_into_id IS NULL;

GRANT SELECT ON public.feedback_public TO authenticated;
```

The public page queries `feedback_public` instead of `feedback`. OPS still queries `feedback` for full data.

### Task 6 — Nav entry

**File:** `src/lib/permissions/nav.ts`

Add a top-level or under-Productivity entry:

```ts
{
  label: 'Pulse Tickets',
  href: '/pulse/tickets',
  // visible to all authenticated — no tier/dept gate
}
```

Check existing nav item shape before writing. If all entries require tier/dept gates, set the loosest possible (all tiers, all depts).

### Task 7 — Feedback widget: show tracking link

**File:** `src/components/feedback/feedback-widget.tsx`

After successful submit, show "View your tickets at /pulse/tickets" in the success toast/screen.

## Verification

1. Run `supabase db push` (user handles manually).
2. OPS user:
   - Submit a feedback via widget.
   - Open `/admin/observability` → Pulse tab. Set priority to urgent, add a note, post a comment.
   - Submit a second feedback. Merge it into the first. Confirm it disappears (and reappears with "Show merged" toggle).
3. Non-OPS user (different account, different dept):
   - Visit `/pulse/tickets`. See both tickets only if merge filter excludes the merged one.
   - Expand the ticket. See body + category + status + priority + comment.
   - Cannot see `notes`, cannot post comment, cannot see reporter name unless they are the reporter.
4. Reporter:
   - Visits `/pulse/tickets`, sees their own ticket with reporter attribution. Can read OPS reply comment.

## Out of scope / future

- Email/Slack notification when OPS replies to a ticket.
- User-side reply (currently comments are OPS-only — reporter reads, does not write).
- Priority SLA timers.
- Saved filter presets on the admin Pulse tab.
