# Sprint A — Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five low-risk tickets from the 2026-04-20 execution report — birthday sort, Live Ads permission audit, Creatives Dashboard avatar sync, Learning Materials media embedding, and Creatives Requests multi-assignee with dropdown clipping fix.

**Architecture:** Each task is scoped to one or two files. Only #16 (multi-assignee) requires a schema change — a new `ad_request_assignees` junction table plus API + UI rework. Everything else is UI/data-layer cleanup.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), TypeScript, Tailwind CSS with CSS variables, `date-fns`, existing `PeoplePicker` (`src/components/ui/people-picker.tsx`) and `Avatar` components.

**Tickets covered:**
- #11 Sort Upcoming Birthdays chronologically
- #14 Ensure pause buttons are hidden for unauthorized users in Live Ads
- #4 Fix team member avatar sync on Creatives Dashboard
- #13 Fix Learning Materials media embedding (bucket videos + external URLs)
- #16 Replace Assign/Reassign with Smart Person multi-select + fix dropdown clipping

---

## Existing State

**Birthdays (`src/app/(dashboard)/people/birthdays/page.tsx`):**
- `upcoming` is sorted by `daysUntil` (chronological) on line ~95
- Then wrapped by `deptFirst()` helper (line ~107) which puts same-dept first, preserving order within group
- Result: Upcoming section shows same-dept chronological first, then other-dept chronological — user perceives this as "dept-alphabetical" not "chronological"

**Live Ads (`src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` + `page.tsx`):**
- `page.tsx` computes `canControl = isOps(user) || user.department?.slug in ["ad-ops", "marketing"]`
- All five pause/resume buttons in `live-ads-view.tsx` (lines 516, 571, 666, 701, 779) are wrapped with `{canControl && ...}`
- **The gate already exists.** Ticket scope = audit + server-side API hardening + verify no regression.

**Creatives Dashboard (`src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx`):**
- Line 60 `avatarColor(index)` paints a colored circle with initials
- Lines 520, 637 render members with `avatarColor(i)` only — `avatar_url` from `Member` type is never consumed
- `Member` type (line 25) doesn't even include `avatar_url`

**Learning Materials (`src/app/(dashboard)/knowledgebase/learning/learning-view.tsx`):**
- `toEmbedUrl()` (line ~92) handles `youtu.be` and `youtube.com` only — falls through to raw URL for everything else
- `material_type === "video"` renders `<video>` tag with `url` directly (line 191) — fine for bucket uploads
- `material_type === "link"` renders `<iframe src={toEmbedUrl(url)}>` (line 196) — breaks for Vimeo, Loom, Drive, direct MP4
- `material_type === "presentation" | "document"` uses `docs.google.com/viewer` which often 404s for bucket files

**Creatives Requests (`src/app/(dashboard)/creatives/requests/requests-view.tsx`):**
- Table `ad_requests` (migration 00007) has single `assignee_id uuid` column
- API `GET/POST/PATCH /api/ad-ops/requests` reads/writes `assignee_id`
- UI uses `PeoplePicker` with `value={r.assignee ? [r.assignee.id] : []}` and takes `ids[0]` in `onChange` — already single-pick through a multi-capable component
- Dropdown clipping: `PeoplePicker` renders dropdown inline; the table row has `overflow-hidden` / transform / scroll container clipping it
- `PeoplePicker` already supports multi-select when `single={false}` (the default)

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/00065_ad_request_assignees.sql` | Junction table `ad_request_assignees (ad_request_id, assignee_id)` + RLS + backfill from existing `assignee_id` |

### Modified files

| File | Changes |
|------|---------|
| `src/app/(dashboard)/people/birthdays/page.tsx` | Pass raw chronological `upcoming` to `BirthdaysView` (skip `deptFirst`) |
| `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | Audit: every Pause/Resume button gated. No code changes expected — verify only. |
| `src/app/api/ad-ops/live/route.ts` (or wherever pause mutation lives) | Add server-side `canControl` check returning 403 for unauthorized callers |
| `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | Add `avatar_url` to `Member` type; swap `avatarColor` circles for `<Avatar url={m.avatar_url} initials={...}>` fallback |
| `src/app/(dashboard)/creatives/dashboard/page.tsx` | Add `avatar_url` to the profiles select |
| `src/app/(dashboard)/knowledgebase/learning/learning-view.tsx` | Expand `toEmbedUrl` (Vimeo, Loom, Drive); add MIME sniff for bucket files; add clean `EmbedFallback` component with "Open in new tab" CTA |
| `src/app/api/ad-ops/requests/route.ts` | Accept and return `assignee_ids: string[]`; write through junction table |
| `src/app/(dashboard)/creatives/requests/requests-view.tsx` | Use `PeoplePicker` multi-select; render multiple assignees; portal dropdown out of table to fix clipping |

---

## Tasks

### Task 1 — #11 Birthday Upcoming: pure chronological order

**Why:** `deptFirst()` groups same-dept first. For the "Upcoming" section users want pure `daysUntil` order regardless of department, because the point of that section is "who's next."

**Files:**
- Modify: `src/app/(dashboard)/people/birthdays/page.tsx`

- [ ] **Step 1: Skip `deptFirst` on `upcoming`**

Change the `<BirthdaysView ... upcoming={deptFirst(upcoming)} ... />` to `upcoming={upcoming}`. The `upcoming` array is already sorted by `daysUntil` ascending.

- [ ] **Step 2: Verify other sections still use `deptFirst`**

`todayPeople`, `thisWeek`, `thisMonth`, `pastPeople` should remain dept-first (social signal matters in those near-term buckets). Only `upcoming` changes.

- [ ] **Step 3: Manual check**

Load `/people/birthdays` while logged in as a non-Ops user whose department has no late-year birthdays. The Upcoming section should now show the earliest next birthday regardless of department.

---

### Task 2 — #14 Live Ads pause-button audit + server hardening

**Why:** Client-side `canControl` gate already exists on every button. But permission checks must also live in the API — a malicious user could call the pause endpoint directly.

**Files:**
- Modify: `src/app/api/ad-ops/live/*` (pause / resume / cap / status endpoints — find via grep)
- Verify: `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx`

- [ ] **Step 1: Grep every pause/resume/cap API route**

```bash
grep -rn "pause\|resume\|spend_cap\|campaign_toggle" src/app/api/ad-ops/
```

List every mutation handler that touches Meta state.

- [ ] **Step 2: Add server-side auth gate to each mutation**

Copy the `canControl` logic from `page.tsx` into a helper in `src/lib/permissions/index.ts`:

```ts
export function canControlAds(user: CurrentUser): boolean {
  return isOps(user) ||
    user.department?.slug === "ad-ops" ||
    user.department?.slug === "marketing";
}
```

Call at the top of every mutation route; return `NextResponse.json({ error: "Forbidden" }, { status: 403 })` if false.

- [ ] **Step 3: Client audit**

Open `live-ads-view.tsx`, confirm all five button sites (search for `"⏸"`, `"▶"`, `onClick={() => handleCampaignToggle`) are wrapped in `{canControl && ...}`. Should already be true — this step is verification.

- [ ] **Step 4: Manual test**

Log in as a Creatives-dept user (not OPS/ad-ops/marketing). Visit `/ad-ops/live`. Confirm no pause/resume/cap buttons appear. Then `curl -X POST` the pause endpoint — should 403.

---

### Task 3 — #4 Creatives Dashboard avatar sync

**Why:** The dashboard renders colored-initial circles everywhere, ignoring actual `avatar_url`. When a team member uploads an avatar it never appears on the Creatives Dashboard.

**Files:**
- Modify: `src/app/(dashboard)/creatives/dashboard/page.tsx`
- Modify: `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx`

- [ ] **Step 1: Add `avatar_url` to the server query**

In `page.tsx`, find the `from("profiles").select(...)` call that builds the members list and add `avatar_url`:

```ts
.select("id, first_name, last_name, avatar_url")
```

- [ ] **Step 2: Extend the `Member` type**

In `dashboard-view.tsx` line 25, change:
```ts
type Member = { id: string; first_name: string; last_name: string };
```
to:
```ts
type Member = { id: string; first_name: string; last_name: string; avatar_url: string | null };
```

- [ ] **Step 3: Replace initial circles with `<Avatar>`**

Find every render site using `avatarColor(i)` (lines ~520, ~637). Replace with:

```tsx
import { Avatar } from "@/components/ui/avatar";

<Avatar
  url={m.avatar_url}
  initials={initials(m)}
  size="sm"  // or "xs" depending on site
  className="ring-2 ring-white"
/>
```

`Avatar` component already renders the image if `url` is truthy, else falls back to initials.

- [ ] **Step 4: Drop `avatarColor` helper**

If `avatarColor` has no remaining callers in the file, delete it.

- [ ] **Step 5: Manual test**

Upload an avatar for one creatives member via `/account/settings`. Load `/creatives/dashboard`. Confirm the uploaded image appears in their circle.

---

### Task 4 — #13 Learning Materials media embedding

**Why:** `toEmbedUrl` only handles YouTube. Vimeo, Loom, Drive, direct MP4 links, and Google Docs all fail silently or render broken iframes. Users upload videos and the viewer never plays them.

**Files:**
- Modify: `src/app/(dashboard)/knowledgebase/learning/learning-view.tsx`

- [ ] **Step 1: Expand `toEmbedUrl`**

Replace the existing helper with a provider-aware version:

```ts
function toEmbedUrl(rawUrl: string): { kind: "iframe" | "video" | "unsupported"; src: string } {
  try {
    const u = new URL(rawUrl);
    // YouTube
    if (u.hostname === "youtu.be") {
      return { kind: "iframe", src: `https://www.youtube.com/embed${u.pathname}` };
    }
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return { kind: "iframe", src: `https://www.youtube.com/embed/${v}` };
    }
    // Vimeo
    if (u.hostname === "vimeo.com") {
      const id = u.pathname.replace(/^\//, "");
      return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
    }
    // Loom
    if (u.hostname === "www.loom.com" || u.hostname === "loom.com") {
      const id = u.pathname.replace("/share/", "").replace(/^\//, "");
      return { kind: "iframe", src: `https://www.loom.com/embed/${id}` };
    }
    // Google Drive
    if (u.hostname === "drive.google.com") {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (match) return { kind: "iframe", src: `https://drive.google.com/file/d/${match[1]}/preview` };
    }
    // Direct video file
    if (/\.(mp4|webm|mov)(\?.*)?$/i.test(u.pathname)) {
      return { kind: "video", src: rawUrl };
    }
    // Unknown — try iframe but caller can fall back
    return { kind: "iframe", src: rawUrl };
  } catch {
    return { kind: "unsupported", src: rawUrl };
  }
}
```

- [ ] **Step 2: Update the render branches**

Replace the existing if/else iframe rendering with a switch on the `kind`:

```tsx
{(() => {
  const embed = toEmbedUrl(url);
  if (embed.kind === "video") {
    return <video controls className="w-full h-full rounded-lg" src={embed.src} />;
  }
  if (embed.kind === "iframe") {
    return <iframe src={embed.src} className="w-full h-full border-0" allow="fullscreen" title={material.title} />;
  }
  return <EmbedFallback url={rawUrl} />;
})()}
```

- [ ] **Step 3: Add `EmbedFallback` component**

Inline in the same file (above the main export):

```tsx
function EmbedFallback({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
      <p className="text-sm text-[var(--color-text-secondary)]">
        This video can't be embedded here.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-[var(--color-text-primary)] underline underline-offset-2"
      >
        Open in new tab →
      </a>
    </div>
  );
}
```

- [ ] **Step 4: Fix bucket-video playback**

For `material_type === "video"`, the existing `<video>` tag is correct. Verify the `url` stored in DB is a signed or public Supabase storage URL (not a bucket path). If it's a bucket path, resolve it via `supabase.storage.from("learning-materials").getPublicUrl(path).data.publicUrl` in the page loader.

- [ ] **Step 5: Manual test**

Add a learning material for each of: YouTube URL, Vimeo URL, Loom URL, Google Drive share URL, direct `.mp4` URL, bucket-uploaded MP4, random website URL. Open each and confirm it plays or shows the fallback CTA.

---

### Task 5 — #16 Multi-assignee + dropdown clipping

**Why:** Creatives Requests currently take one assignee. Real workflow is two-to-three people per request (lead + collab). Multi-select requires a junction table. Dropdown clipping is a separate bug — the `PeoplePicker` dropdown gets cut off by the table container's `overflow-hidden`.

**Files:**
- Create: `supabase/migrations/00065_ad_request_assignees.sql`
- Modify: `src/app/api/ad-ops/requests/route.ts`
- Modify: `src/app/(dashboard)/creatives/requests/requests-view.tsx`
- Modify: `src/components/ui/people-picker.tsx` (portal the dropdown)

- [ ] **Step 1: Migration — junction table**

```sql
-- 00065_ad_request_assignees.sql
CREATE TABLE public.ad_request_assignees (
  ad_request_id uuid NOT NULL REFERENCES public.ad_requests(id) ON DELETE CASCADE,
  assignee_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_request_id, assignee_id)
);

CREATE INDEX idx_ara_request  ON public.ad_request_assignees (ad_request_id);
CREATE INDEX idx_ara_assignee ON public.ad_request_assignees (assignee_id);

-- Backfill from existing single assignee_id
INSERT INTO public.ad_request_assignees (ad_request_id, assignee_id)
SELECT id, assignee_id FROM public.ad_requests WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.ad_request_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_request_assignees FORCE ROW LEVEL SECURITY;

-- RLS: same read/write rules as ad_requests
CREATE POLICY ara_read ON public.ad_request_assignees FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.ad_requests r WHERE r.id = ad_request_id)
);
CREATE POLICY ara_write ON public.ad_request_assignees FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.role_id <= 1 OR p.department_id IN (SELECT department_id FROM public.ad_requests r WHERE r.id = ad_request_id)))
);
```

Do **not** drop the `assignee_id` column from `ad_requests` yet — leave it as a lead-assignee hint. A follow-up migration can drop it after the UI is fully migrated.

- [ ] **Step 2: API — GET returns `assignees[]`**

In `src/app/api/ad-ops/requests/route.ts`, update the `GET` select to join the junction table:

```ts
.select(`
  id, title, status, created_at, assignee_id,
  assignees:ad_request_assignees(
    assignee:profiles(id, first_name, last_name, avatar_url)
  )
`)
```

Map the result so each row has `assignees: { id, first_name, last_name, avatar_url }[]`.

- [ ] **Step 3: API — PATCH accepts `assignee_ids: string[]`**

When the request body includes `assignee_ids`, replace the junction-table rows in a transaction-like sequence:

```ts
await admin.from("ad_request_assignees").delete().eq("ad_request_id", id);
if (assignee_ids.length > 0) {
  await admin.from("ad_request_assignees").insert(
    assignee_ids.map((assignee_id) => ({ ad_request_id: id, assignee_id }))
  );
}
// Also update single assignee_id to the first one, for back-compat
await admin.from("ad_requests").update({ assignee_id: assignee_ids[0] ?? null }).eq("id", id);
```

- [ ] **Step 4: UI — render multiple assignees**

In `requests-view.tsx`, replace the single-assignee label with a stacked avatar group:

```tsx
<div className="flex -space-x-2">
  {r.assignees.map((a) => (
    <Avatar key={a.id} url={a.avatar_url} initials={`${a.first_name[0]}${a.last_name[0]}`} size="xs" className="ring-2 ring-white" />
  ))}
</div>
```

- [ ] **Step 5: UI — swap single-pick to multi-pick**

```tsx
<PeoplePicker
  value={r.assignees.map((a) => a.id)}
  onChange={(ids) => reassign(r.id, ids)}
  allUsers={members}
  currentDeptId={currentDeptId}
  placeholder="Select assignees…"
  // no single prop → multi mode
/>
```

Update `reassign` signature to accept `string[]` and send `{ assignee_ids: ids }` in the PATCH body.

- [ ] **Step 6: Fix dropdown clipping (portal)**

In `src/components/ui/people-picker.tsx`, render the dropdown via `createPortal` into `document.body`, positioned absolutely using the input's `getBoundingClientRect()`. This escapes any `overflow-hidden` ancestor.

```tsx
import { createPortal } from "react-dom";

// inside component, compute rect from containerRef
const [rect, setRect] = useState<DOMRect | null>(null);
useEffect(() => {
  if (open && containerRef.current) setRect(containerRef.current.getBoundingClientRect());
}, [open]);

// render
{open && rect && createPortal(
  <div
    className="fixed z-50 bg-white border border-[var(--color-border-primary)] rounded-lg shadow-lg max-h-64 overflow-y-auto"
    style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
  >
    {/* existing dropdown list */}
  </div>,
  document.body
)}
```

Handle scroll/resize by re-measuring, or accept minor misalignment for MVP.

- [ ] **Step 7: Manual test**

1. Visit `/creatives/requests` as a manager.
2. Open the assignee picker on any request — dropdown should not be clipped by the table.
3. Select 2-3 people, confirm the avatar group updates.
4. Refresh; assignees persist.
5. Unassign one; it disappears. Unassign all; shows "Unassigned".

---

## Verification Checklist

- [ ] `/people/birthdays` Upcoming section is purely chronological
- [ ] Non-ad-ops user sees no pause/resume buttons on `/ad-ops/live` AND API returns 403 on direct call
- [ ] `/creatives/dashboard` shows real avatars for members with uploaded images
- [ ] Learning Materials plays YouTube, Vimeo, Loom, Drive, direct MP4, bucket MP4 — shows fallback CTA for unsupported
- [ ] `/creatives/requests` supports multi-assignee and dropdown doesn't clip

## Commit hygiene

One commit per task with message pattern:
- `fix(birthdays): upcoming section purely chronological`
- `fix(ad-ops): server-side canControl gate on pause/resume mutations`
- `fix(creatives): sync avatar_url in dashboard member cards`
- `fix(learning): provider-aware embeds — vimeo, loom, drive, direct video, fallback`
- `feat(creatives): multi-assignee via ad_request_assignees junction + portal dropdown`

## Post-ship

Update `docs/superpowers/plans/` — archive this file to `archive/` once all 5 tasks are shipped. Update the Obsidian execution report's "Shipped Since 2026-04-15" section with the new commits.
