# Creatives Suite Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four improvements to the Creatives module: PeoplePicker for request assign/reassign, kanban stage visibility for requesters, structured creative_type field in tracker with restructured content taxonomy, and a value migration to reclassify existing rows.

**Architecture:** Five independent tasks. Tasks 1–2 improve the Requests flow — Task 1 swaps the native `<select>` with the shared PeoplePicker component, Task 2 exposes the linked kanban card column name to non-creatives users. Tasks 3–5 handle the Tracker taxonomy restructure — Task 3 is a structural DB migration (PUSH now), Task 4 is a value-only migration (DON'T PUSH — user reviews the mappings before running), Task 5 is the UI overhaul. The tracker page.tsx uses `select("*")` so the new `creative_type` column auto-appears with no page change needed.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Supabase PostgreSQL

---

## Files

- Modify: `src/app/(dashboard)/creatives/requests/page.tsx`
- Modify: `src/app/(dashboard)/creatives/requests/requests-view.tsx`
- Modify: `src/app/api/ad-ops/requests/route.ts`
- Create: `supabase/migrations/00063_creative_type_column.sql` ← **PUSH**
- Create: `supabase/migrations/00064_creative_type_remap.sql` ← **DON'T PUSH — commit file only**
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`
- Modify: `src/app/api/creatives/content-items/route.ts`

---

## Task 1: Replace assign/reassign dropdown with PeoplePicker

**Files:**
- Modify: `src/app/(dashboard)/creatives/requests/page.tsx`
- Modify: `src/app/(dashboard)/creatives/requests/requests-view.tsx`

**Root cause:** The current assign UI uses a native `<select>` that opens on button click and closes on blur. The shared `PeoplePicker` component already exists at `@/components/ui/people-picker` and supports `single` mode — it takes `value: string[]`, `onChange: (ids: string[]) => void`, `allUsers: PickerUser[]`, and optional `single` flag. The `PickerUser` type requires `avatar_url?: string` but the current members query omits it.

- [ ] **Step 1: Add `avatar_url` to members query in `page.tsx`**

Find in `src/app/(dashboard)/creatives/requests/page.tsx`:
```ts
    .select("id, first_name, last_name")
    .eq("department_id", creativesDept?.id ?? "")
```

Replace with:
```ts
    .select("id, first_name, last_name, avatar_url")
    .eq("department_id", creativesDept?.id ?? "")
```

- [ ] **Step 2: Update `Member` type in `requests-view.tsx`**

Find:
```tsx
type Member = { id: string; first_name: string; last_name: string };
```

Replace with:
```tsx
type Member = { id: string; first_name: string; last_name: string; avatar_url?: string | null };
```

- [ ] **Step 3: Import `PeoplePicker` in `requests-view.tsx`**

Find:
```tsx
import { format, parseISO } from "date-fns";
```

Replace with:
```tsx
import { format, parseISO } from "date-fns";
import { PeoplePicker } from "@/components/ui/people-picker";
```

- [ ] **Step 4: Replace the assign/reassign select with PeoplePicker**

Find in `requests-view.tsx` (inside the expanded detail section):
```tsx
                      {/* Assign / reassign — managers only */}
                      {canManage && (
                        assigning === r.id ? (
                          <select
                            autoFocus
                            defaultValue={r.assignee?.id ?? ""}
                            onChange={(e) => reassign(r.id, e.target.value)}
                            onBlur={() => setAssigning(null)}
                            className="text-xs border border-[var(--color-border-primary)] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                          >
                            <option value="">Unassigned</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.first_name} {m.last_name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAssigning(r.id); }}
                            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
                          >
                            {r.assignee ? "Reassign" : "Assign"}
                          </button>
                        )
                      )}
```

Replace with:
```tsx
                      {/* Assign / reassign — managers only */}
                      {canManage && (
                        assigning === r.id ? (
                          <div className="flex items-center gap-2">
                            <PeoplePicker
                              value={r.assignee ? [r.assignee.id] : []}
                              onChange={(ids) => { reassign(r.id, ids[0] ?? ""); }}
                              allUsers={members}
                              single
                              placeholder="Select assignee…"
                            />
                            <button
                              onClick={() => setAssigning(null)}
                              className="text-xs text-[var(--color-text-tertiary)] px-2 hover:text-[var(--color-text-primary)]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAssigning(r.id); }}
                            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg"
                          >
                            {r.assignee ? "Reassign" : "Assign"}
                          </button>
                        )
                      )}
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: Clean TypeScript build, no errors.

- [ ] **Step 6: Smoke test**

```bash
npm run dev
```

Navigate to `/creatives/requests` as a manager. Expand any request. Click "Assign" or "Reassign" — the PeoplePicker should open with a search input and list of creatives members. Selecting one should immediately assign them and close. "Cancel" should close without assigning.

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/creatives/requests/requests-view.tsx src/app/(dashboard)/creatives/requests/page.tsx
git commit -m "feat(requests): replace assign/reassign dropdown with PeoplePicker"
```

---

## Task 2: Show kanban card stage to requesters

**Files:**
- Modify: `src/app/api/ad-ops/requests/route.ts`
- Modify: `src/app/(dashboard)/creatives/requests/requests-view.tsx`

**Root cause:** When a request is accepted (status → in_progress), the API auto-creates a kanban card and stores `linked_card_id`. Non-creatives requesters have no visibility into what stage their request is at inside the creatives board. Fix: extend the GET query to join the linked kanban card's column name, then show a stage badge on the requester's view.

- [ ] **Step 1: Extend the GET query to join kanban column**

Find in `src/app/api/ad-ops/requests/route.ts`:
```ts
  let query = admin
    .from("ad_requests")
    .select(`
      *,
      requester:profiles!requester_id(id, first_name, last_name),
      assignee:profiles!assignee_id(id, first_name, last_name)
    `)
```

Replace with:
```ts
  let query = admin
    .from("ad_requests")
    .select(`
      *,
      requester:profiles!requester_id(id, first_name, last_name),
      assignee:profiles!assignee_id(id, first_name, last_name),
      kanban_card:kanban_cards!linked_card_id(id, col:kanban_columns!column_id(name))
    `)
```

- [ ] **Step 2: Add `kanban_card` to the `Request` type in `requests-view.tsx`**

Find:
```tsx
type Request = {
  id: string;
  title: string;
  brief: string | null;
  status: string;
  target_date: string | null;
  notes: string | null;
  created_at: string;
  requester: { id: string; first_name: string; last_name: string } | null;
  assignee: { id: string; first_name: string; last_name: string } | null;
};
```

Replace with:
```tsx
type Request = {
  id: string;
  title: string;
  brief: string | null;
  status: string;
  target_date: string | null;
  notes: string | null;
  created_at: string;
  requester: { id: string; first_name: string; last_name: string } | null;
  assignee: { id: string; first_name: string; last_name: string } | null;
  kanban_card?: { id: string; col: { name: string } | null } | null;
};
```

- [ ] **Step 3: Show the kanban stage badge in the requester row header**

In `requests-view.tsx`, find the `<div className="flex-1 min-w-0">` inside the row header (the block that contains `{r.title}` and the meta paragraph):
```tsx
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--color-text-primary)]">{r.title}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    {isFulfillmentView && (
                      <>
                        From: {r.requester ? `${r.requester.first_name} ${r.requester.last_name}` : "Unknown"}
                        {r.assignee
                          ? ` · Assigned to ${r.assignee.first_name} ${r.assignee.last_name}`
                          : " · Unassigned"}
                      </>
                    )}
                    {r.target_date ? `${isFulfillmentView ? " · " : ""}due ${format(parseISO(r.target_date), "d MMM")}` : ""}
                  </p>
                </div>
```

Replace with:
```tsx
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--color-text-primary)]">{r.title}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    {isFulfillmentView && (
                      <>
                        From: {r.requester ? `${r.requester.first_name} ${r.requester.last_name}` : "Unknown"}
                        {r.assignee
                          ? ` · Assigned to ${r.assignee.first_name} ${r.assignee.last_name}`
                          : " · Unassigned"}
                      </>
                    )}
                    {r.target_date ? `${isFulfillmentView ? " · " : ""}due ${format(parseISO(r.target_date), "d MMM")}` : ""}
                  </p>
                  {!isFulfillmentView && r.kanban_card?.col?.name && (
                    <span className="inline-flex mt-1 text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                      Stage: {r.kanban_card.col.name}
                    </span>
                  )}
                </div>
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: Clean TypeScript build.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Navigate to `/creatives/requests` as a non-creatives user. For any request that has been accepted (status = in_progress or later), a purple "Stage: <column name>" badge should appear below the title. Requests not yet accepted (no linked kanban card) show nothing. Fulfillment view (creatives/OPS) sees no change.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ad-ops/requests/route.ts src/app/(dashboard)/creatives/requests/requests-view.tsx
git commit -m "feat(requests): show kanban board stage to requester when card is linked"
```

---

## Task 3: Structural migration — add creative_type column

**File:**
- Create: `supabase/migrations/00063_creative_type_column.sql`

**Context:** The existing `content_type` PostgreSQL enum has values `video | still | ad_creative | organic | offline | other`. We need to add two new values (`ads`, `offline_other`) to cover the new taxonomy. We also need a new `creative_item_type` enum (`video | stills | asset`) and a `creative_type` column on `creative_content_items`. Existing rows will have `creative_type = NULL` until the value migration runs.

**PUSH this migration immediately** — it only adds columns/types, no data changes.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/00063_creative_type_column.sql`:

```sql
-- Extend content_type enum with new taxonomy values
ALTER TYPE public.content_type ADD VALUE IF NOT EXISTS 'ads';
ALTER TYPE public.content_type ADD VALUE IF NOT EXISTS 'offline_other';

-- Create creative_item_type enum for the creative format field
DO $$ BEGIN
  CREATE TYPE public.creative_item_type AS ENUM ('video', 'stills', 'asset');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add creative_type column to creative_content_items (nullable — existing rows default NULL)
ALTER TABLE public.creative_content_items
  ADD COLUMN IF NOT EXISTS creative_type public.creative_item_type;
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected: Migration applies cleanly. No errors.

- [ ] **Step 3: Verify the column exists**

```bash
npm run dev
```

Open Supabase Studio → Table Editor → `creative_content_items` table. Confirm a `creative_type` column exists with type `creative_item_type` (nullable). Existing rows show `NULL` in that column.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00063_creative_type_column.sql
git commit -m "feat(tracker): add creative_type column and creative_item_type enum to DB"
```

---

## Task 4: Value migration — remap existing rows (DON'T PUSH)

**File:**
- Create: `supabase/migrations/00064_creative_type_remap.sql`

**Context:** After Task 3, existing rows still have old `content_type` values (`video`, `still`, `ad_creative`, `offline`, `other`). This migration maps them to the new taxonomy. **User must review the mapping before pushing** — it can't be undone easily. Commit the file, do NOT run `npx supabase db push`.

Mapping rationale:
- `video` → content_type=`ads`, creative_type=`video` (most existing video content was ad creatives)
- `still` → content_type=`ads`, creative_type=`stills`
- `ad_creative` → content_type=`ads`, creative_type=`asset`
- `organic` → stays `organic`; creative_type=`video` (safe default, user can adjust per row)
- `offline` → content_type=`offline_other`, creative_type=`asset`
- `other` → content_type=`offline_other`, creative_type=`asset`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/00064_creative_type_remap.sql`:

```sql
-- VALUE MIGRATION — DO NOT PUSH UNTIL REVIEWED
-- Maps old content_type values to new taxonomy (content_type + creative_type).
-- Review the row counts below before pushing:
--   SELECT content_type, count(*) FROM creative_content_items GROUP BY content_type;

-- old 'video' → ads content, video format
UPDATE public.creative_content_items
  SET content_type = 'ads', creative_type = 'video'
  WHERE content_type = 'video';

-- old 'still' → ads content, stills format
UPDATE public.creative_content_items
  SET content_type = 'ads', creative_type = 'stills'
  WHERE content_type = 'still';

-- old 'ad_creative' → ads content, asset format
UPDATE public.creative_content_items
  SET content_type = 'ads', creative_type = 'asset'
  WHERE content_type = 'ad_creative';

-- organic stays organic; default creative_type = video (update per row if needed)
UPDATE public.creative_content_items
  SET creative_type = 'video'
  WHERE content_type = 'organic' AND creative_type IS NULL;

-- old 'offline' → offline_other content, asset format
UPDATE public.creative_content_items
  SET content_type = 'offline_other', creative_type = 'asset'
  WHERE content_type = 'offline';

-- old 'other' → offline_other content, asset format
UPDATE public.creative_content_items
  SET content_type = 'offline_other', creative_type = 'asset'
  WHERE content_type = 'other';
```

- [ ] **Step 2: Commit the file (DO NOT run `npx supabase db push`)**

```bash
git add supabase/migrations/00064_creative_type_remap.sql
git commit -m "chore(tracker): value migration for creative_type remap — DO NOT PUSH, review first"
```

---

## Task 5: Tracker UI — restructure content type taxonomy

**Files:**
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`
- Modify: `src/app/api/creatives/content-items/route.ts`

**Context:** Task 3 added `creative_type` column. Now update the UI: content_type dropdown shows only `[organic, ads, offline_other]`, add a new Creative Type dropdown (`[video, stills, asset]`), remove the Transfer Link field (it's a dead field since linking is now done via the Kanban/post link system), make Funnel Stage conditional on content_type=ads, and update the table columns to show the new taxonomy.

**Note:** The tracker `page.tsx` uses `select("*")` so it automatically returns `creative_type` — no server component change needed. The PATCH API spreads all updates so it also handles `creative_type` automatically. Only the POST handler needs an explicit field addition.

- [ ] **Step 1: Add `creative_type` to `ContentItem` type**

Find in `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`:
```tsx
type ContentItem = {
  id: string;
  title: string;
  content_type: string;
  channel_type: string;
  funnel_stage: string | null;
```

Replace with:
```tsx
type ContentItem = {
  id: string;
  title: string;
  content_type: string;
  channel_type: string;
  creative_type: string | null;
  funnel_stage: string | null;
```

- [ ] **Step 2: Update `CONTENT_TYPES` constant and add `CREATIVE_TYPES`**

Find:
```tsx
const CONTENT_TYPES = [
  "video",
  "still",
  "ad_creative",
  "organic",
  "offline",
  "other",
] as const;
```

Replace with:
```tsx
const CONTENT_TYPES = ["organic", "ads", "offline_other"] as const;

const CREATIVE_TYPES = ["video", "stills", "asset"] as const;
```

- [ ] **Step 3: Add `creativeType` state, update `contentType` default, remove `transferLink` state**

Find in `ItemModal`:
```tsx
  const [contentType, setContentType] = useState(initial?.content_type ?? "video");
  const [channelType, setChannelType] = useState(initial?.channel_type ?? "conversion");
  const [funnelStage, setFunnelStage] = useState(initial?.funnel_stage ?? "");
  const [creativeAngle, setCreativeAngle] = useState(initial?.creative_angle ?? "");
  const [product, setProduct] = useState(initial?.product_or_collection ?? "");
  const [campaign, setCampaign] = useState(initial?.campaign_label ?? "");
  const [promoCode, setPromoCode] = useState(initial?.promo_code ?? "");
  const [transferLink, setTransferLink] = useState(initial?.transfer_link ?? "");
```

Replace with:
```tsx
  const [contentType, setContentType] = useState(initial?.content_type ?? "ads");
  const [creativeType, setCreativeType] = useState(initial?.creative_type ?? "video");
  const [channelType, setChannelType] = useState(initial?.channel_type ?? "conversion");
  const [funnelStage, setFunnelStage] = useState(initial?.funnel_stage ?? "");
  const [creativeAngle, setCreativeAngle] = useState(initial?.creative_angle ?? "");
  const [product, setProduct] = useState(initial?.product_or_collection ?? "");
  const [campaign, setCampaign] = useState(initial?.campaign_label ?? "");
  const [promoCode, setPromoCode] = useState(initial?.promo_code ?? "");
```

- [ ] **Step 4: Update submit payload — add `creative_type`, make `funnel_stage` conditional, remove `transfer_link`**

Find in `ItemModal`'s `submit` function:
```tsx
    onSave({
      title: title.trim(),
      content_type: contentType,
      channel_type: channelType,
      funnel_stage: funnelStage || null,
      creative_angle: creativeAngle || null,
      product_or_collection: product || null,
      campaign_label: campaign || null,
      promo_code: promoCode || null,
      transfer_link: transferLink || null,
      planned_week_start: plannedWeek || null,
      date_submitted: dateSubmitted || null,
      assignee_ids: assigneeIds,
      status,
      group_label: groupLabel,
    });
```

Replace with:
```tsx
    onSave({
      title: title.trim(),
      content_type: contentType,
      creative_type: creativeType,
      channel_type: channelType,
      funnel_stage: contentType === "ads" ? funnelStage || null : null,
      creative_angle: creativeAngle || null,
      product_or_collection: product || null,
      campaign_label: campaign || null,
      promo_code: promoCode || null,
      planned_week_start: plannedWeek || null,
      date_submitted: dateSubmitted || null,
      assignee_ids: assigneeIds,
      status,
      group_label: groupLabel,
    });
```

- [ ] **Step 5: Add Creative Type field to the form, make Funnel Stage conditional, remove Transfer Link**

Find the Channel Type `<Field>` in the form grid (the full Funnel Stage + Transfer Link section):
```tsx
          <Field label="Channel Type">
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CHANNEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {fmtLabel(t)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Funnel Stage">
            <select
              value={funnelStage}
              onChange={(e) => setFunnelStage(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">-</option>
              {FUNNEL_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
```

Replace with:
```tsx
          <Field label="Creative Type">
            <select
              value={creativeType}
              onChange={(e) => setCreativeType(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CREATIVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {fmtLabel(t)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Channel Type">
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CHANNEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {fmtLabel(t)}
                </option>
              ))}
            </select>
          </Field>

          {contentType === "ads" && (
            <Field label="Funnel Stage">
              <select
                value={funnelStage}
                onChange={(e) => setFunnelStage(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">-</option>
                {FUNNEL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          )}
```

- [ ] **Step 6: Remove the Transfer Link field**

Find:
```tsx
          <Field label="Transfer Link">
            <input
              type="text"
              value={transferLink}
              onChange={(e) => setTransferLink(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="https://..."
            />
          </Field>
```

Delete those 9 lines entirely.

- [ ] **Step 7: Update table header columns — rename "Type" to "Content" and "Channel" to "Format"**

Find:
```tsx
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Channel</th>
                          <th className="px-4 py-3">Funnel</th>
```

Replace with:
```tsx
                          <th className="px-4 py-3">Content</th>
                          <th className="px-4 py-3">Format</th>
                          <th className="px-4 py-3">Funnel</th>
```

- [ ] **Step 8: Update table row cells — show `creative_type` in the Format column**

Find in the desktop table `<tbody>`:
```tsx
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                              {fmtLabel(item.content_type)}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                              {fmtLabel(item.channel_type)}
                            </td>
```

Replace with:
```tsx
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                              {fmtLabel(item.content_type)}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                              {item.creative_type ? fmtLabel(item.creative_type) : "-"}
                            </td>
```

- [ ] **Step 9: Update mobile card — show `creative_type` instead of `channel_type`**

Find in the mobile card:
```tsx
                          <span>{fmtLabel(item.content_type)}</span>
                          <span>{fmtLabel(item.channel_type)}</span>
```

Replace with:
```tsx
                          <span>{fmtLabel(item.content_type)}</span>
                          <span>{item.creative_type ? fmtLabel(item.creative_type) : "-"}</span>
```

- [ ] **Step 10: Add `creative_type` to POST handler in content-items API**

Find in `src/app/api/creatives/content-items/route.ts` POST handler:
```ts
    .insert({
      title: body.title,
      content_type: body.content_type ?? null,
      channel_type: body.channel_type ?? null,
      funnel_stage: body.funnel_stage ?? null,
      creative_angle: body.creative_angle ?? null,
      product_or_collection: body.product_or_collection ?? null,
      campaign_label: body.campaign_label ?? null,
      promo_code: body.promo_code ?? null,
      transfer_link: body.transfer_link ?? null,
```

Replace with:
```ts
    .insert({
      title: body.title,
      content_type: body.content_type ?? null,
      creative_type: body.creative_type ?? null,
      channel_type: body.channel_type ?? null,
      funnel_stage: body.funnel_stage ?? null,
      creative_angle: body.creative_angle ?? null,
      product_or_collection: body.product_or_collection ?? null,
      campaign_label: body.campaign_label ?? null,
      promo_code: body.promo_code ?? null,
      transfer_link: body.transfer_link ?? null,
```

- [ ] **Step 11: Build check**

```bash
npm run build
```

Expected: Clean TypeScript build, no errors.

- [ ] **Step 12: Smoke test**

```bash
npm run dev
```

Navigate to `/creatives/tracker`:
- Click "+ New Item" — form shows Content Type dropdown with only [Organic, Ads, Offline Other] options; Creative Type dropdown with [Video, Stills, Asset]; Funnel Stage is hidden until Content Type = Ads; no Transfer Link field
- Table shows "Content" and "Format" headers; new items show creative_type in Format column; existing items show "-" in Format (until value migration runs)
- Open an existing item in edit — Content Type may show blank if it had an old value (pre-migration); new items save correctly

- [ ] **Step 13: Commit**

```bash
git add src/app/(dashboard)/creatives/tracker/tracker-view.tsx src/app/api/creatives/content-items/route.ts
git commit -m "feat(tracker): restructure content taxonomy — add creative_type, update form and table"
```

---

## Self-Review

**Spec coverage:**
- ✅ Requests assign/reassign improvement — Task 1 replaces native select with PeoplePicker (single=true), adds avatar_url to members query
- ✅ Kanban status visibility for requesters — Task 2 joins kanban card column name in GET, shows Stage badge on requester view
- ✅ Structural migration (PUSH) — Task 3 adds `ads`/`offline_other` to content_type enum, creates `creative_item_type` enum, adds `creative_type` column
- ✅ Value migration (DON'T PUSH) — Task 4 creates remap SQL with comments, committed as file only
- ✅ Content type dropdown restructure — Task 5 changes CONTENT_TYPES to [organic, ads, offline_other]
- ✅ Creative type dropdown added — Task 5 adds CREATIVE_TYPES [video, stills, asset] with new form field
- ✅ Remove transfer_link from form — Task 5 removes state and Field (transfer_link stays in DB/type for existing data)
- ✅ Funnel stage conditional on ads — Task 5 wraps Funnel Stage in `{contentType === "ads" && ...}`
- ✅ Table columns updated — Task 5 renames "Type"→"Content" and "Channel"→"Format" (shows creative_type)

**Placeholder scan:** None — all code blocks are complete and exact.

**Type consistency:**
- `ContentItem.creative_type: string | null` added in Task 5 Step 1 — used as `item.creative_type` in table/card in Steps 8–9 ✅
- `creativeType` state initialized from `initial?.creative_type ?? "video"` — `initial` is `ContentItem` which now has `creative_type` ✅
- `CREATIVE_TYPES` constant used in both the form `<select>` (Step 5) and `creativeType` state (Step 3) ✅
- `Member.avatar_url` added in Task 1 Step 2 — matches `PickerUser` interface which expects `avatar_url?: string` ✅
- `kanban_card` property added to `Request` type in Task 2 — accessed as `r.kanban_card?.col?.name` in Step 3 ✅

**Migration ordering:** 00063 (structural, PUSH) before 00064 (value, DON'T PUSH). `npx supabase db push` after Task 3 applies only 00063 since 00064 hasn't been added to the push history yet. When user is ready to run 00064, they run `npx supabase db push` again.
