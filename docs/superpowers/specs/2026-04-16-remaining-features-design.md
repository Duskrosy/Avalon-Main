# Remaining Features — Combined Design Spec

**Date:** 2026-04-16
**Author:** Gavril (requirements) + Claude (design)
**Status:** Approved

---

## Spec A: Executive Dashboards + Campaign Metrics

### A1. Executive Ad-Ops Dashboard (`/executive/ad-ops`)

**Priority metrics front and center:**
- CPLV (Cost Per Landing Page View)
- Cost Per Add to Cart
- Cost Per Purchase
- Cost Per Messenger Result

**Tab switcher:** Conversion | Messenger | Overall
- Each tab shows relevant metrics for that campaign type
- Conversion tab: CPLV, CPA (Add to Cart), CPP (Purchase), ROAS
- Messenger tab: Cost Per Message Result, conversation rate, response rate
- Overall tab: all metrics combined

**Gender demographic spend:**
- Per campaign, show spend breakdown: Men vs Women (from Meta Ads demographic API `breakdowns=gender`)
- Displayed as a simple bar or split indicator per campaign row
- Wire this data into `/ad-ops/live` page too — each campaign shows inline gender spend split

**Data source:** Meta Ads API already integrated. Need to add `breakdowns=gender` parameter to the insights fetch and store/display the breakdown.

### A2. Executive Sales Dashboard (`/executive/sales`)

**Tab switcher:** Chat | Shopify | Marketplace | Store | Overall
- **Chat:** Messenger/Pancake sales data (from `sales_confirmed` or equivalent)
- **Shopify:** Shopify orders data (from `shopify_orders`)
- **Marketplace:** Shopee, Lazada, TikTok Shop combined
- **Store:** Physical/walk-in sales
- **Overall:** All channels combined with filters

Each tab shows: daily revenue, order count, top agents (for chat), growth vs yesterday.

**Sidebar nav reorg:**
- Sales-Ops nav group items relabeled to clarify channel:
  - "Daily Volume" → "Chat — Daily Volume"
  - "Confirmed Sales" → "Chat — Confirmed Sales"
  - "Shopify" stays as "Shopify"
  - Consider grouping by channel with sub-headers

### A3. Campaign Metrics — Delta Arrows

**Applies to:** `/ad-ops/campaigns`, `/executive/ad-ops`, `/executive` overview

**All metrics get Shopify-style deltas:**
- Green up arrow + "↑ X%" when metric improved vs yesterday
- Red down arrow + "↓ X%" when metric declined vs yesterday
- Gray dash "—" when no previous data

**Contextual labels:**
- When on Messenger tab: "Cost Per Conversion" → "Cost Per Message/Result", "Conversions" → "Messages", etc.
- Labels adapt based on active campaign type filter

**Implementation:** Create a reusable `DeltaBadge` component that accepts `current`, `previous`, and optional `invertColor` (for cost metrics where lower is better → green on decrease).

### Schema Changes (Spec A)

New migration adds:
- `meta_ad_demographics` table (or extend existing `meta_ad_insights` with gender breakdown columns):
  ```
  campaign_id, date, gender ('male'|'female'|'unknown'),
  spend, impressions, conversions, messages
  ```
- No changes to existing tables — additive only

### New/Modified Files (Spec A)

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/executive/ad-ops/page.tsx` | Restructure with priority metrics + tabs |
| `src/app/(dashboard)/executive/ad-ops/ad-ops-exec-view.tsx` | New client view with tabs, demographics |
| `src/app/(dashboard)/executive/sales/page.tsx` | Channel tab switcher |
| `src/app/(dashboard)/executive/sales/sales-exec-view.tsx` | New client view with channel tabs |
| `src/components/ui/delta-badge.tsx` | Reusable delta arrow component |
| `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx` | Add delta badges to all metrics |
| `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | Add gender spend split per campaign |
| `src/app/api/ad-ops/demographics/route.ts` | New API for gender breakdown data |
| `src/lib/permissions/nav.ts` | Relabel Sales-Ops nav items by channel |
| `supabase/migrations/00056_demographics.sql` | Demographics table |

---

## Spec B: Kanban Redesign

### B1. Visual Polish

**Card redesign:**
- Reduce card padding (p-3 → p-2)
- Title prominent (text-sm font-medium), single line with ellipsis
- Assignee avatars: small (w-5 h-5) stacked at bottom-right of card
- Due date: subtle text-xs at bottom-left, red if overdue
- Priority: colored left border (4px), not a badge
  - Low: gray, Medium: blue, High: amber, Urgent: red
- Remove visual clutter: no card background color, just white/surface with subtle border

**Board layout:**
- Team/Personal/Global sections with clear headers and collapse toggles
- Team board expanded by default (already done in bug fixes)
- Columns: fixed-width (280px), horizontal scroll, with column header showing card count

### B2. Predetermined Columns

**Default columns that cannot be deleted:**
- To Do (sort_order: 0)
- In Progress (sort_order: 1)
- Review (sort_order: 2)
- Done (sort_order: 3)

**Schema:** Add `is_default BOOLEAN NOT NULL DEFAULT false` to `kanban_columns`.

**Migration:** Seed default columns for all existing boards that don't already have them. Mark existing columns with matching names as `is_default = true`. For boards without these column names, insert the 4 defaults.

**UI:** Default columns cannot be deleted or renamed. They have a lock icon. Users can add custom columns between them.

### B3. Done = KPI Truth (Single Source of Completion)

**When a card moves to the Done column:**
1. `completed_at` is set to `now()` on the `kanban_cards` row
2. If the card has a `linked_card_id` reference from `creative_content_items`:
   - Auto-update the content item status to `published` or `approved`
3. If the card has a `linked_card_id` reference from `ad_requests`:
   - Auto-update the request status to `approved`

**When a card moves OUT of Done:**
1. `completed_at` is set to `null`
2. Linked content items / requests revert to `in_progress`

**Consumers of Done column data:**
- **Task Velocity** (exec overview): counts cards with `completed_at` in current week
- **Creatives campaign completion**: content items linked to Done cards count as completed
- **Creative requests**: requests linked to Done cards count as fulfilled
- **KPI entries**: productivity KPIs can read completed card counts per department per period

### Schema Changes (Spec B)

```sql
ALTER TABLE public.kanban_columns ADD COLUMN is_default boolean NOT NULL DEFAULT false;
```

Seed migration for existing boards.

### Modified Files (Spec B)

| File | Purpose |
|------|---------|
| `supabase/migrations/00057_kanban_defaults.sql` | is_default column + seed defaults |
| `src/app/(dashboard)/productivity/kanban/kanban-board.tsx` | Visual redesign, prevent default column delete/rename, auto-set completed_at on Done move, sync linked items |
| `src/app/(dashboard)/productivity/kanban/kanban-multi-board.tsx` | Updated card rendering |
| `src/app/api/kanban/columns/route.ts` | Prevent DELETE on is_default columns |

---

## Spec C: Leave Workflow

### C1. Schema

New table (or extend existing `leaves` table):

```sql
CREATE TABLE public.leave_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type      text NOT NULL CHECK (leave_type IN ('vacation', 'sick', 'emergency', 'personal')),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  reason          text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'awaiting_form', 'finalized', 'rejected')),
  approved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  form_filed      boolean NOT NULL DEFAULT false,
  form_filed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- who marked as filed
  form_filed_at   timestamptz,
  form_signed_digitally boolean NOT NULL DEFAULT false,
  finalized_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_at    timestamptz,
  rejection_reason text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

Supporting documents use the existing attachment system (Supabase storage). Add a `leave_request_id` FK to whatever attachment table exists, or use a simple `leave_attachments` junction:

```sql
CREATE TABLE public.leave_attachments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  file_url         text NOT NULL,
  file_name        text NOT NULL,
  uploaded_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

RLS: All authenticated can SELECT own requests. OPS/managers can SELECT all in their department. OPS can UPDATE any. Requesters can INSERT.

### C2. Workflow States

```
pending → approved → awaiting_form → finalized
  ↓          ↓
rejected   rejected
```

**Transitions:**
| From | To | Who | Action |
|------|----|-----|--------|
| pending | approved | OPS/Admin | Approve → triggers notification "Please file the leave form" |
| pending | rejected | OPS/Admin | Reject with reason → triggers notification |
| approved | awaiting_form | auto | Immediate after approval (status set together) |
| awaiting_form | finalized | OPS/Admin | After form is filed → final approval |
| awaiting_form | — | Employee OR OPS | "Mark as Filed" button (sets form_filed=true, form_filed_by) |
| awaiting_form | — | Employee | Digital signature option (sets form_signed_digitally=true) |

### C3. Notifications

Using existing notifications table/system:

| Event | Recipient | Message |
|-------|-----------|---------|
| Request submitted | OPS/managers | "{name} submitted a leave request ({type}, {dates})" |
| Approved | Requester | "Your {type} leave was approved. Please file the leave form." |
| Rejected | Requester | "Your {type} leave was rejected. Reason: {reason}" |
| Re-notify | Requester | "Reminder: Please file your leave form for {dates}" |
| Form filed | OPS | "{name} has filed their leave form for {dates}" |
| Finalized | Requester | "Your {type} leave has been finalized." |

### C4. UI

**Employee view (`/people/leaves`):**
- "Request Leave" button → form: type, start/end date, reason, optional attachments
- List of their leave requests with status badges
- "Mark as Filed" button on approved requests
- Digital signature option (simple "I confirm" checkbox + name field, or canvas signature)

**OPS/Manager view:**
- All pending requests queue at the top
- Approve/Reject buttons with optional notes
- "Re-notify" button on awaiting_form requests
- "Mark as Filed" button (on behalf of employee)
- "Finalize" button after form is filed
- Attachment viewer for supporting documents

### New/Modified Files (Spec C)

| File | Purpose |
|------|---------|
| `supabase/migrations/00058_leave_workflow.sql` | leave_requests + leave_attachments tables |
| `src/app/api/leaves/requests/route.ts` | CRUD for leave requests with workflow transitions |
| `src/app/api/leaves/requests/[id]/file/route.ts` | Mark as filed endpoint |
| `src/app/api/leaves/requests/[id]/finalize/route.ts` | Finalize endpoint |
| `src/app/api/leaves/requests/[id]/attachments/route.ts` | Upload/list supporting docs |
| `src/app/(dashboard)/people/leaves/page.tsx` | Updated with workflow UI |
| `src/app/(dashboard)/people/leaves/leaves-view.tsx` | Employee + OPS views |
| `src/app/(dashboard)/people/leaves/leave-request-form.tsx` | Submit form component |

---

## Spec D: Admin Roadmap ("Development" tab)

### D1. Schema

```sql
CREATE TABLE public.feature_goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned', 'in_progress', 'done')),
  progress    integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  milestone   text,           -- optional grouping label
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Link Pulse (feedback) tickets to feature goals
CREATE TABLE public.feature_goal_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_goal_id uuid NOT NULL REFERENCES public.feature_goals(id) ON DELETE CASCADE,
  feedback_id     uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_goal_id, feedback_id)
);
```

RLS: All authenticated can SELECT. OPS can INSERT/UPDATE/DELETE.

### D2. Admin > Development Page (`/admin/development`)

**Two sections:**

**Section 1: KPI Wiring Tasklist** (from KPI Framework spec)
- KPIs where `data_source_status = 'to_be_wired'`, grouped by department
- "Mark as Wired" button per KPI

**Section 2: Feature Goals**
- List of feature goals grouped by milestone
- Each goal: title, description, progress bar (0-100%), status badge
- Create/edit form: title, description, milestone, progress, status
- Linked Pulse tickets shown underneath each goal
- "Link Ticket" button opens a picker of unlinked feedback items

### D3. Pulse Integration

From the Pulse/feedback view (`/admin/observability` Pulse tab):
- Add a "Link to Feature Goal" button on each feedback item
- Opens a dropdown of existing feature goals to link to
- Linked items show a badge indicating which feature goal they're connected to

### D4. Executive "Development" Tab

New tab on the executive dashboard (alongside Ad-Ops, Sales, Marketing, People, Creatives):
- Clean, read-only view of feature goals with progress bars
- Grouped by milestone
- Shows status badges and linked ticket counts
- No management UI — just the progress overview
- Tab name: "Development"

### New/Modified Files (Spec D)

| File | Purpose |
|------|---------|
| `supabase/migrations/00059_feature_goals.sql` | feature_goals + feature_goal_tickets tables |
| `src/app/api/feature-goals/route.ts` | CRUD for feature goals |
| `src/app/api/feature-goals/[id]/tickets/route.ts` | Link/unlink Pulse tickets |
| `src/app/(dashboard)/admin/development/page.tsx` | Combined KPI wiring + feature goals |
| `src/app/(dashboard)/admin/development/dev-view.tsx` | Client view with both sections |
| `src/app/(dashboard)/executive/development/page.tsx` | Read-only progress view |
| `src/app/(dashboard)/admin/observability/pulse-tab.tsx` | Add "Link to Feature Goal" button |
| `src/lib/permissions/nav.ts` | Add "Development" under Admin + as exec tab |

---

## Migration Sequence

| Migration | Content |
|-----------|---------|
| `00055_kpi_calendar_exec.sql` | KPI wiring status + calendar_events (from KPI/Exec spec) |
| `00056_demographics.sql` | Meta ad demographics table |
| `00057_kanban_defaults.sql` | is_default on columns + seed defaults |
| `00058_leave_workflow.sql` | leave_requests + leave_attachments |
| `00059_feature_goals.sql` | feature_goals + feature_goal_tickets |
