# Executive Dashboards + Campaign Metrics Implementation Plan
> For agentic workers: REQUIRED SUB-SKILL — read `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` before touching any symbol. Run `gitnexus_impact` on every function you modify. Do not skip.

**Goal:** Restructure the Executive Ad-Ops and Sales dashboards with tabbed channel views, add Shopify-style delta badges to all campaign metrics, surface gender demographic spend from Meta, and reorg Sales-Ops nav labels.

**Architecture:** New `meta_ad_demographics` table feeds a `/api/ad-ops/demographics` route that the Executive Ad-Ops page and the `/ad-ops/live` page consume; the reusable `DeltaBadge` component wraps any metric that needs a % change indicator and is wired to existing `meta_ad_stats` yesterday-vs-today comparisons. Both executive pages adopt an internal tab switcher pattern mirroring the existing `tab-nav.tsx` approach but scoped within the page component rather than the shared layout.

**Tech Stack:** Next.js 16 App Router (Server Components + `"use client"` views), Supabase admin client, Meta Marketing API v21.0 (`breakdowns=gender`), Tailwind CSS with CSS variables, `date-fns`

---

## File Structure

| File | Change |
|------|--------|
| `supabase/migrations/00055_meta_ad_demographics.sql` | New — demographics table + RLS |
| `src/components/ui/delta-badge.tsx` | New — reusable DeltaBadge component |
| `src/app/api/ad-ops/demographics/route.ts` | New — GET demographics by campaign + date |
| `src/lib/meta/client.ts` | Add `fetchAdDemographics()` function |
| `src/app/(dashboard)/executive/ad-ops/page.tsx` | Restructure — tabs + priority metrics + demographics |
| `src/app/(dashboard)/executive/sales/page.tsx` | Restructure — channel tabs (Chat/Shopify/Marketplace/Store/Overall) |
| `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx` | Add DeltaBadge to all metric columns |
| `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | Add gender demographics inline section |
| `src/lib/permissions/nav.ts` | Relabel Sales-Ops nav items by channel |

---

## Tasks

### Task 1 — Migration: `meta_ad_demographics` table

**Files:** `supabase/migrations/00055_meta_ad_demographics.sql`

- [ ] Create migration file
- [ ] Define table with columns: `id`, `campaign_id`, `meta_account_id`, `date`, `gender` (text, values: `male` | `female` | `unknown`), `spend`, `impressions`, `conversions`, `messages`, `created_at`
- [ ] Add unique constraint on `(meta_account_id, campaign_id, date, gender)`
- [ ] Enable RLS; grant SELECT to `authenticated`, INSERT/UPDATE to `service_role`

```sql
-- supabase/migrations/00055_meta_ad_demographics.sql

create table if not exists meta_ad_demographics (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       text not null,
  meta_account_id   text not null,
  date              date not null,
  gender            text not null check (gender in ('male', 'female', 'unknown')),
  spend             numeric(12, 4) not null default 0,
  impressions       integer not null default 0,
  conversions       integer not null default 0,
  messages          integer not null default 0,
  created_at        timestamptz not null default now(),

  constraint meta_ad_demographics_unique unique (meta_account_id, campaign_id, date, gender)
);

alter table meta_ad_demographics enable row level security;

create policy "auth users can read demographics"
  on meta_ad_demographics for select
  to authenticated using (true);

create policy "service role can write demographics"
  on meta_ad_demographics for all
  to service_role using (true);
```

- [ ] Build verify: `cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5`
- [ ] Commit:

```
git add supabase/migrations/00055_meta_ad_demographics.sql
git commit -m "$(cat <<'EOF'
feat(db): add meta_ad_demographics table for gender breakdowns

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 — Reusable `DeltaBadge` component

**Files:** `src/components/ui/delta-badge.tsx`

- [ ] Create as a `"use client"` component (uses no client hooks — can be RSC, but keep `"use client"` for tree-shaking consistency with other `/ui` components)
- [ ] Props: `current: number | null`, `previous: number | null`, `invertColor?: boolean` (default `false` — set `true` for cost metrics where lower is better)
- [ ] If either value is null or previous is 0, render `—`
- [ ] Compute `pct = ((current - previous) / Math.abs(previous)) * 100`
- [ ] `isPositive`: pct > 0 XOR invertColor (i.e., up is good unless invertColor)
- [ ] Render: green up arrow (▲) when positive, red down arrow (▼) when negative, with `|pct|%` formatted to 1 decimal
- [ ] Use CSS variables: `text-[var(--color-success)]` / `text-[var(--color-error)]`
- [ ] Include `className` prop for override

```tsx
// src/components/ui/delta-badge.tsx
"use client";

interface DeltaBadgeProps {
  current: number | null;
  previous: number | null;
  /** Set true for cost metrics where a decrease is good (e.g. CPLV, CPM). */
  invertColor?: boolean;
  className?: string;
}

export function DeltaBadge({ current, previous, invertColor = false, className = "" }: DeltaBadgeProps) {
  if (current === null || previous === null || previous === 0) {
    return <span className={`text-xs text-[var(--color-text-tertiary)] ${className}`}>—</span>;
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const isUp = pct > 0;
  // For cost metrics: up (more spend) is bad → invert the color logic
  const isGood = invertColor ? !isUp : isUp;
  const color = isGood ? "text-[var(--color-success)]" : "text-[var(--color-error)]";
  const arrow = isUp ? "▲" : "▼";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color} ${className}`}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
```

- [ ] Build verify
- [ ] Commit:

```
git add src/components/ui/delta-badge.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add DeltaBadge component for Shopify-style % change indicators

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 — Demographics API route + Meta client function

**Files:**
- `src/lib/meta/client.ts` — add `fetchAdDemographics()`
- `src/app/api/ad-ops/demographics/route.ts` — new GET route

#### 3a — Add `fetchAdDemographics` to Meta client

- [ ] Run `gitnexus_impact({ target: "fetchAccountInsights", direction: "upstream" })` to understand the pattern before adding the new function
- [ ] Add `fetchAdDemographics(accountId: string, campaignId: string, date: string, token: string)` after the existing `fetchCampaignSpend` function
- [ ] Call `/{campaignId}/insights` with `breakdowns=gender`, fields `spend,impressions,actions`, `time_range={since: date, until: date}`, `level=campaign`
- [ ] Return array of `{ gender: string; spend: number; impressions: number; conversions: number; messages: number }`
- [ ] Extract `conversions` from `actions` where `action_type === "offsite_conversion.fb_pixel_purchase"` (or custom if account has `primary_conversion_id`) and `messages` from `onsite_conversion.messaging_conversation_started_7d`

```ts
// Append to src/lib/meta/client.ts

export async function fetchAdDemographics(
  accountId: string,
  campaignId: string,
  date: string,
  token: string
): Promise<{ gender: string; spend: number; impressions: number; conversions: number; messages: number }[]> {
  const params = new URLSearchParams({
    fields: "spend,impressions,actions",
    breakdowns: "gender",
    time_range: JSON.stringify({ since: date, until: date }),
    level: "campaign",
    access_token: token,
  });
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${campaignId}/insights?${params}`
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []).map((row: Record<string, unknown>) => {
    const actions = (row.actions as { action_type: string; value: string }[]) ?? [];
    const getAction = (type: string) =>
      Number(actions.find((a) => a.action_type === type)?.value ?? 0);
    return {
      gender: String(row.gender ?? "unknown"),
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      conversions: getAction("offsite_conversion.fb_pixel_purchase"),
      messages: getAction("onsite_conversion.messaging_conversation_started_7d"),
    };
  });
}
```

#### 3b — Demographics API route

- [ ] Create `src/app/api/ad-ops/demographics/route.ts`
- [ ] Accept `GET` with query params: `campaign_id`, `date` (defaults to yesterday), `meta_account_id`
- [ ] Use `createAdminClient()` to query `meta_ad_demographics` — filter by campaign_id + date
- [ ] If no rows found in DB, fetch live from Meta via `fetchAdDemographics()`, upsert to table, return results
- [ ] Auth: require valid Supabase session (same pattern as other ad-ops routes)

```ts
// src/app/api/ad-ops/demographics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAdDemographics } from "@/lib/meta/client";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const campaignId   = searchParams.get("campaign_id");
  const accountId    = searchParams.get("meta_account_id");
  const date         = searchParams.get("date") ?? new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  if (!campaignId || !accountId) {
    return NextResponse.json({ error: "campaign_id and meta_account_id are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Try cached rows first
  const { data: cached } = await supabase
    .from("meta_ad_demographics")
    .select("gender, spend, impressions, conversions, messages")
    .eq("campaign_id", campaignId)
    .eq("meta_account_id", accountId)
    .eq("date", date);

  if (cached && cached.length > 0) {
    return NextResponse.json({ data: cached });
  }

  // Fetch from Meta, resolve per-account token
  const { data: accountRow } = await supabase
    .from("ad_meta_accounts")
    .select("meta_access_token")
    .eq("account_id", accountId)
    .single();

  const token = accountRow?.meta_access_token ?? process.env.META_ACCESS_TOKEN ?? "";
  const rows = await fetchAdDemographics(accountId, campaignId, date, token);

  if (rows.length > 0) {
    await supabase.from("meta_ad_demographics").upsert(
      rows.map((r) => ({ ...r, campaign_id: campaignId, meta_account_id: accountId, date })),
      { onConflict: "meta_account_id,campaign_id,date,gender" }
    );
  }

  return NextResponse.json({ data: rows });
}
```

- [ ] Build verify
- [ ] Commit:

```
git add src/lib/meta/client.ts src/app/api/ad-ops/demographics/route.ts
git commit -m "$(cat <<'EOF'
feat(ad-ops): add fetchAdDemographics + /api/ad-ops/demographics route

Fetches gender breakdown spend from Meta API with DB caching.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4 — Executive Ad-Ops page restructure

**Files:** `src/app/(dashboard)/executive/ad-ops/page.tsx`

**Before editing:** Run `gitnexus_impact({ target: "AdOpsExecutivePage", direction: "upstream" })` and report blast radius.

The page is a Server Component (407 lines). The restructure adds an in-page tab switcher and reorders the metric display. The data-fetch logic remains server-side; the tab state is managed in a thin `"use client"` wrapper component.

#### Steps

- [ ] Extract the existing metric sections into three logical groups matching the tab design:
  - **Conversion tab:** CPLV, Cost Per Add to Cart, Cost Per Purchase
  - **Messenger tab:** Cost Per Messenger Result, messaging_conversations, cost-per-message labeling
  - **Overall tab:** total spend, ROAS, CPM, CTR, hook rate, impressions, reach

- [ ] Add priority metric row at the top (always visible, above tabs):
  - CPLV, Cost Per Add to Cart, Cost Per Purchase, Cost Per Messenger Result
  - Each metric card shows current value + `<DeltaBadge>` (with `invertColor={true}` for all cost metrics)

- [ ] Create inline `AdOpsTabSwitcher` client component inside the file (or as a sibling file `tab-switcher.tsx` in the same directory) with tabs: `Conversion | Messenger | Overall`

- [ ] Wire `DeltaBadge` to all metrics — requires fetching yesterday's equivalent data alongside today/selected-range data. Add a secondary Supabase query for the previous period (if date range is N days, previous period = same N days ending the day before the range starts)

- [ ] Add **Gender Demographics** section below the tab content:
  - Fetch from `/api/ad-ops/demographics` client-side (SWR-style `useEffect` after mount) for the top 3 campaigns by spend
  - Render as a horizontal stacked bar per campaign: male / female / unknown segments with spend labels
  - Color: male = `var(--color-accent)`, female = `var(--color-info)`, unknown = `var(--color-text-tertiary)`

- [ ] Priority metric section structure:

```tsx
// Priority metrics row — always visible above tabs
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
  {[
    { label: "CPLV",                  current: cplv,        previous: prevCplv        },
    { label: "Cost Per Add to Cart",  current: cpAtc,       previous: prevCpAtc       },
    { label: "Cost Per Purchase",     current: cpPurchase,  previous: prevCpPurchase  },
    { label: "Cost Per Message",      current: cpMessage,   previous: prevCpMessage   },
  ].map(({ label, current, previous }) => (
    <div key={label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs text-[var(--color-text-tertiary)] mb-1">{label}</p>
      <p className="text-xl font-semibold text-[var(--color-text-primary)]">{fmtMoney(current)}</p>
      <DeltaBadge current={current} previous={previous} invertColor className="mt-1" />
    </div>
  ))}
</div>
```

- [ ] Contextual label: in the Messenger tab, replace "Cost Per Conversion" heading with "Cost Per Message / Result"

- [ ] Build verify
- [ ] Commit:

```
git add src/app/(dashboard)/executive/ad-ops/page.tsx
git commit -m "$(cat <<'EOF'
feat(executive): restructure ad-ops dashboard with priority metrics, tabs, and demographics

Adds Conversion/Messenger/Overall tab switcher, CPLV/CPA/CPP/CPM priority
row with delta badges, and gender demographic spend breakdown per campaign.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5 — Executive Sales page restructure

**Files:** `src/app/(dashboard)/executive/sales/page.tsx`

**Before editing:** Run `gitnexus_impact({ target: "SalesExecutivePage", direction: "upstream" })`.

Current page (297 lines) shows revenue this month and recent confirmed orders from a single source. The restructure adds a 5-tab channel switcher.

#### Steps

- [ ] Create inline `SalesTabSwitcher` client component (tabs: `Chat | Shopify | Marketplace | Store | Overall`)

- [ ] **Chat tab** — data from `sales_confirmed_sales` (messenger channel):
  - Revenue today, revenue yesterday, # orders today, # orders yesterday
  - `DeltaBadge` for revenue (orders vs yesterday)
  - Table: recent 10 confirmed sales with agent name, product, value

- [ ] **Shopify tab** — data from existing Shopify tables:
  - Revenue today, yesterday, growth % vs yesterday
  - Orders today vs yesterday
  - Top products by revenue (reuse pattern from existing Shopify reconciliation view)

- [ ] **Marketplace tab** — data from `sales_marketplace_orders` (if table exists) or placeholder "coming soon" state using `EmptyState` component from `src/components/ui/empty-state.tsx`

- [ ] **Store tab** — data from `sales_store_orders` (if table exists) or placeholder

- [ ] **Overall tab** — aggregate across all active channels:
  - Total revenue (sum of all channels), total orders
  - Revenue mix donut or bar breakdown (Chat / Shopify / Marketplace / Store percentages)
  - `DeltaBadge` on total revenue vs yesterday

- [ ] Each tab card header pattern:

```tsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
  <MetricCard label="Revenue Today"    value={fmtMoney(revenueToday)}    delta={<DeltaBadge current={revenueToday} previous={revenueYesterday} />} />
  <MetricCard label="Orders Today"     value={String(ordersToday)}       delta={<DeltaBadge current={ordersToday} previous={ordersYesterday} />} />
  <MetricCard label="Avg Order Value"  value={fmtMoney(aov)}             delta={<DeltaBadge current={aov} previous={prevAov} />} />
  <MetricCard label="Revenue MTD"      value={fmtMoney(revenueMtd)}      delta={<DeltaBadge current={revenueMtd} previous={prevRevenueMtd} />} />
</div>
```

- [ ] Build verify
- [ ] Commit:

```
git add src/app/(dashboard)/executive/sales/page.tsx
git commit -m "$(cat <<'EOF'
feat(executive): restructure sales dashboard with Chat/Shopify/Marketplace/Store/Overall channel tabs

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6 — Campaign metrics page: add DeltaBadge

**Files:** `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx`

**Before editing:** Run `gitnexus_impact({ target: "CampaignsView", direction: "upstream" })`.

This is a large `"use client"` component (1800+ lines). The delta badges need yesterday's data fetched alongside the selected date range.

#### Steps

- [ ] Add `previousStats` state (same shape as current `stats` data) — fetched for the date range immediately before the selected range
- [ ] On date range change, compute the previous period range:
  ```ts
  const prevEnd = subDays(parseISO(startDate), 1);
  const prevStart = subDays(prevEnd, dayCount - 1);
  ```
- [ ] Fetch previous period stats in parallel with current stats using `Promise.all`
- [ ] Build a lookup map: `prevByAdId: Map<string, AdStat>` keyed on `ad_id`

- [ ] Add `DeltaBadge` beneath each metric cell in the campaigns table. Metrics to badge:
  - Spend (invertColor=false — more spend can be good or bad; use neutral by default, no invert)
  - ROAS (invertColor=false — higher is better)
  - CPM (invertColor=true — lower cost is better)
  - CTR (invertColor=false — higher is better)
  - Conversions (invertColor=false)
  - Hook Rate (invertColor=false)

- [ ] Example column render update:

```tsx
// Before
<td className="...">{fmtPct(row.ctr)}</td>

// After
<td className="...">
  <div className="flex flex-col gap-0.5">
    <span>{fmtPct(row.ctr)}</span>
    <DeltaBadge current={row.ctr} previous={prevByAdId.get(row.ad_id)?.ctr ?? null} />
  </div>
</td>
```

- [ ] Messenger tab context: when the selected account uses messaging conversions (detectable by `account.primary_conversion_id === null` and messaging_conversations > 0), label the conversions column "Results / Messages" instead of "Conversions"

- [ ] Build verify
- [ ] Commit:

```
git add src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx
git commit -m "$(cat <<'EOF'
feat(ad-ops): add delta badges to campaign metrics table with yesterday comparison

Fetches previous period stats in parallel; badges all metric columns with
invertColor where lower cost = better outcome.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7 — Live Ads page: gender demographics inline

**Files:** `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx`

**Before editing:** Run `gitnexus_impact({ target: "LiveAdsView", direction: "upstream" })`.

#### Steps

- [ ] Add a `DemographicsRow` sub-component at the bottom of each expanded campaign card (campaigns already expand to show adsets/ads)
- [ ] Fetch demographics client-side when the campaign row is expanded: `GET /api/ad-ops/demographics?campaign_id=X&meta_account_id=Y&date=<yesterday>`
- [ ] Render a horizontal bar: male % | female % | unknown % with spend label for each segment
- [ ] Use `useState<Record<string, DemographicData[]>>` keyed by `meta_campaign_id` to cache results in component state
- [ ] Show a loading skeleton (`src/components/ui/skeleton.tsx`) while fetching
- [ ] If no demographic data available (empty array), render nothing (don't show the row)

```tsx
// DemographicsRow props
interface DemographicsRowProps {
  campaignId: string;      // meta_campaign_id
  accountId: string;       // account.account_id
  currency: string;
}

// Gender colors
const GENDER_COLORS: Record<string, string> = {
  male:    "bg-[var(--color-accent)]",
  female:  "bg-[var(--color-info)]",
  unknown: "bg-[var(--color-border)]",
};
```

- [ ] Build verify
- [ ] Commit:

```
git add src/app/(dashboard)/ad-ops/live/live-ads-view.tsx
git commit -m "$(cat <<'EOF'
feat(ad-ops): add gender demographic spend breakdown to live ads expanded view

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8 — Nav reorg: Sales-Ops labels by channel

**Files:** `src/lib/permissions/nav.ts`

**Before editing:** Run `gitnexus_impact({ target: "resolveNavigation", direction: "upstream" })` — this is a critical function; expect wide blast radius.

Current Sales Ops items and their new channel-labeled names:

| Current name | New name | Channel |
|---|---|---|
| Daily Volume | Chat Volume | Chat |
| Confirmed Sales | Chat Sales | Chat |
| QA Log | Chat QA | Chat |
| FPS Daily | Chat FPS | Chat |
| Consistency | Agent Consistency | Chat |
| Downtime Log | Downtime Log | (unchanged) |
| Incentive Payouts | Incentive Payouts | (unchanged) |
| Weekly Report | Weekly Agent Report | (unchanged) |
| Monthly Summary | Monthly Summary | (unchanged) |
| Shopify | Shopify Orders | Shopify |

#### Steps

- [ ] Run impact analysis before editing
- [ ] Update only the `name` fields of the listed items in `src/lib/permissions/nav.ts` — do NOT change `slug` or `route` values (changing slugs would break permission checks)
- [ ] Verify: `slug` values are immutable identifiers; only `name` (display label) changes

```ts
// Example change in nav.ts (lines ~83–92):
{ name: "Chat Volume",       slug: "daily-volume",        route: "/sales-ops/daily-volume"         },
{ name: "Chat Sales",        slug: "confirmed-sales",     route: "/sales-ops/confirmed-sales"      },
{ name: "Chat QA",           slug: "qa-log",              route: "/sales-ops/qa-log"               },
{ name: "Chat FPS",          slug: "fps-daily",           route: "/sales-ops/fps-daily"            },
{ name: "Agent Consistency", slug: "consistency",         route: "/sales-ops/consistency"          },
{ name: "Downtime Log",      slug: "downtime-log",        route: "/sales-ops/downtime-log"         },
{ name: "Incentive Payouts", slug: "incentive-payouts",   route: "/sales-ops/incentive-payouts"    },
{ name: "Weekly Agent Report", slug: "weekly-report",     route: "/sales-ops/weekly-agent-report"  },
{ name: "Monthly Summary",   slug: "monthly-summary",     route: "/sales-ops/monthly-summary"      },
{ name: "Shopify Orders",    slug: "shopify",             route: "/sales-ops/shopify", minTier: 2  },
```

- [ ] Build verify
- [ ] Commit:

```
git add src/lib/permissions/nav.ts
git commit -m "$(cat <<'EOF'
feat(nav): relabel Sales-Ops nav items by channel (Chat/Shopify)

Display names updated to reflect channel context; slugs and routes unchanged
to preserve permission checks.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Check Before Finishing

Before marking this plan complete, verify:
1. `gitnexus_impact` was run for every symbol modified across all 8 tasks
2. No HIGH/CRITICAL risk warnings were silently bypassed — if raised, user was notified
3. `gitnexus_detect_changes()` confirms only expected files in scope
4. All d=1 (WILL BREAK) dependents from impact analysis were updated
5. Build passes clean after each task commit
6. `DeltaBadge` renders correctly for: positive value + standard color, positive value + invertColor, null values (renders `—`)

## Notes for Implementer

- **Demographics sync:** The `/api/ad-ops/demographics` route caches data in Supabase. For production, add a cron entry alongside the existing `ad-ops/sync` cron to pre-populate demographics for all active campaigns nightly.
- **Yesterday baseline for deltas:** All delta comparisons use "yesterday" as the previous value. If the selected date range is multi-day, the previous period is the equivalent N-day window ending the day before the range. Keep this logic centralized in a `getPreviousPeriod(startDate, endDate)` utility if you find yourself duplicating it across Tasks 4, 5, and 6.
- **Messenger tab labeling:** The contextual label swap ("Cost Per Conversion" → "Cost Per Message / Result") should be data-driven: check if the account's `primary_conversion_id` is null AND `messaging_conversations > 0` for the selected period. Do not hardcode per account.
- **Sales tab data availability:** The Marketplace and Store tabs may lack real tables. Use `EmptyState` with "Data coming soon" rather than crashing. Check table existence before querying.
- **Build command:** `cd "/Users/fc-international-1/Documents/Avalon New" && PATH="/opt/homebrew/bin:$PATH" npx next build 2>&1 | tail -5`
