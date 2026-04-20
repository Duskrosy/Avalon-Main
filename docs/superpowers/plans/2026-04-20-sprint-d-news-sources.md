# Sprint D — Marketing News Source Management

**Date:** 2026-04-20
**Tickets:** #10 (source management modal with feed health checks, test-before-confirm, RSS/Atom support)
**Status:** Ready to implement

## Context

Foundation shipped (migration 00017):
- `smm_news_sources` table: `id, name, url, category, active, created_at`
- `smm_news_items` table populated by RSS/Atom fetcher cron
- OPS-only INSERT/UPDATE/DELETE; `ad_ops_access` SELECT
- Marketing News page at `src/app/(dashboard)/marketing/news/news-view.tsx` with POST to `/api/smm/news/sources`

What's missing:
- Proper source-management modal (currently just inline add form)
- Feed health status surfaced per source (last fetch success, error message, item count)
- "Test before confirm" — fetch + parse a sample before saving
- RSS vs Atom format detection display
- Deactivate/reactivate without deleting history

## Migration

**File:** `supabase/migrations/00066_news_source_health.sql`

```sql
ALTER TABLE public.smm_news_sources
  ADD COLUMN feed_type         text CHECK (feed_type IN ('rss', 'atom', 'unknown')),
  ADD COLUMN last_fetched_at   timestamptz,
  ADD COLUMN last_fetch_status text CHECK (last_fetch_status IN ('ok', 'error', 'never')) DEFAULT 'never',
  ADD COLUMN last_fetch_error  text,
  ADD COLUMN last_item_count   integer DEFAULT 0;

CREATE INDEX smm_news_sources_last_fetch_status_idx
  ON public.smm_news_sources(last_fetch_status);
```

(Sprint C takes 00066 if both ship together. If Sprint C lands first, renumber this to 00067. User handles push manually.)

## Tasks

### Task 1 — Test-feed endpoint

**New file:** `src/app/api/smm/news/sources/test/route.ts`

- `POST` body: `{ url: string }`.
- Fetch URL with 5s timeout, User-Agent "AvalonNewsBot/1.0".
- Parse as RSS or Atom (reuse parser from existing fetcher — search `lib/smm/rss-parser.ts` or wherever).
- Return `{ ok: true, feed_type: 'rss'|'atom', title, description, sample_items: [{title, link, published_at}] (first 3), total_count }` or `{ ok: false, error }`.
- OPS-only (use `isOps()`).
- No DB writes.

### Task 2 — Cron fetcher updates

Locate the existing news fetcher (likely `src/lib/smm/news-fetcher.ts` or a cron route under `/api/cron/`). Update to:

- On successful fetch: update `smm_news_sources` row with `last_fetched_at = now()`, `last_fetch_status = 'ok'`, `last_fetch_error = null`, `last_item_count = <count>`, `feed_type = <detected>`.
- On failure: set `last_fetch_status = 'error'`, `last_fetch_error = err.message`, keep `last_fetched_at` updated.
- Skip rows where `active = false`.

### Task 3 — Source management modal

**New file:** `src/app/(dashboard)/marketing/news/source-manager-modal.tsx` (client component)

UI (open via existing "Manage Sources" trigger in news-view):
- List of sources with columns: name, URL, category, feed_type badge, health badge (green ok / red error / gray never), `last_fetched_at` relative time, `last_item_count`, active toggle.
- Click a row → inline edit form: name, url, category (dropdown).
- **Add new source form** at top:
  - Inputs: url (required), name (required), category (dropdown).
  - "Test feed" button → calls `/api/smm/news/sources/test`. Shows a preview panel with feed title + first 3 items or error.
  - "Save" button is disabled until a successful test for that URL.
- Per-row actions: edit, activate/deactivate, "Test now" (calls test endpoint again for diagnostics), delete.
- On error health: show full `last_fetch_error` in a tooltip/expandable.

### Task 4 — News view integration

**File:** `src/app/(dashboard)/marketing/news/news-view.tsx`

- Replace the inline add-source form with a "Manage Sources" button that opens the new modal.
- When the modal closes with changes, re-trigger the existing items fetch.
- Keep existing item-list view unchanged.

### Task 5 — API route updates

**File:** `src/app/api/smm/news/sources/route.ts` (may need creation or extension — grep first)

- `GET` — return full sources list with health columns (OPS + ad_ops_access). RLS handles permission.
- `POST` — require prior successful test (server validates by re-running test parse before insert; if fails, 400). Insert with `feed_type` from test, `last_fetch_status='never'`.
- `PATCH /[id]` — OPS-only. Accept `{ name?, url?, category?, active? }`. If `url` changes, re-test before save.
- `DELETE /[id]` — OPS-only. Cascade deletes items (existing FK).

## Verification

1. Run migration (user pushes manually).
2. Wait for cron cycle or manually trigger fetcher.
3. Confirm health columns populate for existing seeded sources.
4. As OPS, open Manage Sources modal:
   - Add a known-good feed (e.g., https://www.esquiremag.ph/rss.xml). Test works. Save succeeds.
   - Add a bad URL (e.g., https://nonexistent.example.com/feed). Test fails. Save is blocked.
   - Deactivate a source. Confirm items stop appearing after next fetch cycle (but historical items remain).
   - Reactivate it.
5. As non-OPS ad-ops user: can open the modal (read-only) but cannot add/edit/delete.

## Out of scope

- OPML import/export.
- Duplicate-URL auto-detection.
- Per-source item limits or recency filters.
- Webhooks on fetch failure.
