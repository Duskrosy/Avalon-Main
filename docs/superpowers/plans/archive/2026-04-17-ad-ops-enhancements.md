# Ad-Ops Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the executive KPI Messenger tab via an `ad_type` DB column, add live ads UI permission gating, add a DeltaBadge to the Cost/Result column, and overhaul demographics to show hierarchical gender/age breakdowns (campaign → adset → ad) in both the Live Campaigns board and a new executive Demographic Spend card.

**Architecture:** One migration (00061) handles all schema changes. The demographics API is upgraded from `level=campaign` to `level=ad` fetching, returning adset and ad fields. Three UI surfaces updated: live-ads-view (permissions), campaigns-view (CPR delta + hierarchical demographics + age toggle), and executive ad-ops page (KPI tab fix + DemographicSpendCard). One new shared UI primitive (DemographicBar) extracted.

**Tech Stack:** Next.js App Router (RSC + client components), Supabase (server + admin client), Meta Marketing API v21.0 (`/{campaignId}/insights?level=ad&breakdowns=gender|age`), TypeScript, Tailwind CSS v4 with CSS variables.

---

## File Structure

**Create:**
- `supabase/migrations/00061_ad_ops_enhancements.sql`
- `src/components/ui/demographic-bar.tsx`
- `src/app/(dashboard)/executive/ad-ops/demographic-spend-card.tsx`

**Modify:**
- `src/app/(dashboard)/ad-ops/live/page.tsx` — add `canControl` prop from user department
- `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` — wrap pause/budget controls with `canControl`
- `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx` — delta on cost_per_result, new demographics state + hierarchical render + age toggle
- `src/lib/meta/client.ts` — fetchAdDemographics: `level=ad`, adset/ad fields, breakdown param
- `src/app/api/ad-ops/demographics/route.ts` — accept `breakdown` param, upsert with new columns
- `src/app/(dashboard)/executive/ad-ops/kpi-utils.ts` — add `ad_type` field to `KpiDef`
- `src/app/(dashboard)/executive/ad-ops/kpi-tab-view.tsx` — filter by `ad_type` not name string
- `src/app/(dashboard)/executive/ad-ops/page.tsx` — fetch demographic rows, render DemographicSpendCard

---

## Task 1: Schema Migration 00061

**Files:**
- Create: `supabase/migrations/00061_ad_ops_enhancements.sql`

- [ ] **Create the migration file**

```sql
-- supabase/migrations/00061_ad_ops_enhancements.sql
-- ============================================================
-- Ad-Ops Enhancements
-- 1. ad_type column on kpi_definitions (fixes Messenger tab split)
-- 2. Ad-level columns on meta_ad_demographics (enables drill-down)
-- ============================================================

-- ── 1. KPI ad_type ──────────────────────────────────────────────────────────

ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS ad_type text NOT NULL DEFAULT 'conversion'
  CONSTRAINT kpi_definitions_ad_type_check
    CHECK (ad_type IN ('conversion', 'messenger', 'both'));

-- Messenger-specific KPIs
UPDATE public.kpi_definitions
  SET ad_type = 'messenger'
  WHERE name IN ('Messenger RoAS', 'CPMR');

-- KPIs relevant to both ad types
UPDATE public.kpi_definitions
  SET ad_type = 'both'
  WHERE name IN ('Overall RoAS', 'Daily Budget Pacing');

-- ── 2. Ad-level demographic columns ─────────────────────────────────────────

ALTER TABLE public.meta_ad_demographics
  ADD COLUMN IF NOT EXISTS adset_id      text,
  ADD COLUMN IF NOT EXISTS adset_name    text,
  ADD COLUMN IF NOT EXISTS ad_id         text,
  ADD COLUMN IF NOT EXISTS ad_name       text,
  ADD COLUMN IF NOT EXISTS campaign_name text,
  ADD COLUMN IF NOT EXISTS age_group     text;

-- Replace campaign-level unique constraint with ad-level one.
-- NULLS NOT DISTINCT: NULL = NULL in uniqueness check (Postgres 15+).
ALTER TABLE public.meta_ad_demographics
  DROP CONSTRAINT IF EXISTS meta_ad_demographics_unique;

ALTER TABLE public.meta_ad_demographics
  ADD CONSTRAINT meta_ad_demographics_unique
  UNIQUE NULLS NOT DISTINCT (
    meta_account_id, campaign_id, adset_id, ad_id,
    date, gender, age_group
  );
```

- [ ] **Apply the migration**

```bash
supabase db push
```

Expected: no errors. Verify with `supabase db diff` — should show no pending changes.

- [ ] **Commit**

```bash
git add supabase/migrations/00061_ad_ops_enhancements.sql
git commit -m "feat(db): add ad_type to kpi_definitions and ad-level columns to meta_ad_demographics"
```

---

## Task 2: Fix Executive KPI Messenger Tab

**Files:**
- Modify: `src/app/(dashboard)/executive/ad-ops/kpi-utils.ts`
- Modify: `src/app/(dashboard)/executive/ad-ops/kpi-tab-view.tsx`

The `page.tsx` already does `.select("*")` on `kpi_definitions` so `ad_type` is auto-included — no query change needed.

- [ ] **Add `ad_type` to `KpiDef` in kpi-utils.ts**

Find the `KpiDef` interface and add one field:

```ts
export interface KpiDef {
  id: string;
  name: string;
  category: string;
  unit: string;
  direction: string;
  frequency: string;
  threshold_green: number;
  threshold_amber: number;
  hint: string | null;
  sort_order: number;
  ad_type: "conversion" | "messenger" | "both"; // ← add this line
}
```

- [ ] **Fix the Messenger tab filter in kpi-tab-view.tsx**

Find this block (around line 15):

```ts
const filtered = kpis.filter((kpi) => {
  const lower = kpi.name.toLowerCase();
  const isMsg = lower.includes("message") || lower.includes("messenger");
  if (activeTab === "messenger") return isMsg;
```

Replace with:

```ts
const filtered = kpis.filter((kpi) => {
  const isMsg = kpi.ad_type === "messenger" || kpi.ad_type === "both";
  if (activeTab === "messenger") return isMsg;
```

- [ ] **Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Commit**

```bash
git add src/app/\(dashboard\)/executive/ad-ops/kpi-utils.ts \
        src/app/\(dashboard\)/executive/ad-ops/kpi-tab-view.tsx
git commit -m "fix(executive): fix Messenger KPI tab to filter by ad_type instead of name string matching"
```

---

## Task 3: Live Ads Permission Gating (UI Only)

**Files:**
- Modify: `src/app/(dashboard)/ad-ops/live/page.tsx`
- Modify: `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx`

> The API route (`/api/ad-ops/live-ads/route.ts`) already has server-side department guards at lines ~235–245 and ~294–304. No API changes needed.

- [ ] **Update page.tsx to derive and pass `canControl`**

Replace the entire file:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { LiveAdsView } from "./live-ads-view";

export default async function LiveAdsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const canControl =
    isOps(user) ||
    user.department?.slug === "ad-ops" ||
    user.department?.slug === "marketing";

  return <LiveAdsView canControl={canControl} />;
}
```

- [ ] **Add `canControl` prop to LiveAdsView**

In `live-ads-view.tsx`, find the component props type/interface and add:

```ts
canControl: boolean;
```

Then destructure it in the component signature:
```ts
export function LiveAdsView({ canControl, ...rest }: Props) {
```

- [ ] **Wrap pause/resume buttons and spend cap inputs**

Search for each control that should be ad-ops/marketing only. The pattern is:

```tsx
{/* BEFORE — any pause/resume button */}
<button onClick={() => handleToggle(id)}>Pause</button>

{/* AFTER */}
{canControl && (
  <button onClick={() => handleToggle(id)}>Pause</button>
)}
```

Apply this wrapping to:
1. Campaign-level pause/resume toggle button
2. Adset-level pause/resume toggle button  
3. Spend cap / local budget input field and its label
4. Any "Set Budget" or "Update Cap" submit button

- [ ] **Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Commit**

```bash
git add src/app/\(dashboard\)/ad-ops/live/page.tsx \
        src/app/\(dashboard\)/ad-ops/live/live-ads-view.tsx
git commit -m "feat(live-ads): hide pause and budget controls from non-ad-ops/marketing users"
```

---

## Task 4: Add DeltaBadge to Cost/Result Column

**Files:**
- Modify: `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx` (line ~319)

The `cost_per_result` column already exists and is `visible: true` in `DEFAULT_AD_COLUMNS_MESSENGER`. It just needs `deltaValue` and `invertColor`.

- [ ] **Add delta fields to the cost_per_result column definition**

Find (around line 319):

```ts
{ id: "cost_per_result",   label: "Cost/Result",
  render: (ad, cur) => { const v = (ad.messaging_conversations ?? 0) > 0 ? ad.spend / ad.messaging_conversations : null; return v != null ? fmtMoney(v, cur) : "—"; } },
```

Replace with:

```ts
{ id: "cost_per_result",   label: "Cost/Result",
  render: (ad, cur) => { const v = (ad.messaging_conversations ?? 0) > 0 ? ad.spend / ad.messaging_conversations : null; return v != null ? fmtMoney(v, cur) : "—"; },
  deltaValue: (ad) => (ad.messaging_conversations ?? 0) > 0 ? ad.spend / ad.messaging_conversations : null,
  invertColor: true },
```

- [ ] **Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Commit**

```bash
git add src/app/\(dashboard\)/ad-ops/campaigns/campaigns-view.tsx
git commit -m "feat(campaigns): add delta badge to Cost/Result column in Messenger tab"
```

---

## Task 5: Upgrade Demographics API to Ad Level

**Files:**
- Modify: `src/lib/meta/client.ts`
- Modify: `src/app/api/ad-ops/demographics/route.ts`

- [ ] **Replace `fetchAdDemographics` in `src/lib/meta/client.ts`**

Find the function and replace it entirely:

```ts
export async function fetchAdDemographics(
  accountId: string,
  campaignId: string,
  date: string,
  token: string,
  breakdown: "gender" | "age" = "gender"
) {
  const params = new URLSearchParams({
    fields: "spend,impressions,actions,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name",
    breakdowns: breakdown === "age" ? "age" : "gender",
    time_range: JSON.stringify({ since: date, until: date }),
    level: "ad",
    async: "false", // REQUIRED — without this Meta returns a job ID instead of data
    access_token: token,
  });
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${campaignId}/insights?${params}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Meta demographics fetch failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return (json.data ?? []).map((row: Record<string, unknown>) => {
    const actions = (row.actions ?? []) as { action_type: string; value: string }[];
    const conversions = Number(
      actions.find((a) => a.action_type === "purchase")?.value ?? 0
    );
    const messages = Number(
      actions.find((a) =>
        a.action_type === "onsite_conversion.messaging_conversation_started_7d"
      )?.value ?? 0
    );
    return {
      campaign_id:   (row.campaign_id   as string) ?? campaignId,
      campaign_name: (row.campaign_name as string) ?? null,
      adset_id:      (row.adset_id      as string) ?? null,
      adset_name:    (row.adset_name    as string) ?? null,
      ad_id:         (row.ad_id         as string) ?? null,
      ad_name:       (row.ad_name       as string) ?? null,
      gender:    breakdown === "gender" ? ((row.gender as string) ?? "unknown") : null,
      age_group: breakdown === "age"    ? ((row.age    as string) ?? null)      : null,
      spend:       Number(row.spend       ?? 0),
      impressions: Number(row.impressions ?? 0),
      conversions,
      messages,
    };
  });
}
```

- [ ] **Update the demographics route to accept `breakdown` and upsert new columns**

In `src/app/api/ad-ops/demographics/route.ts`, find the GET handler. Make these three changes:

**1. Parse `breakdown` from query params** (after existing param parsing):
```ts
const breakdown = (searchParams.get("breakdown") ?? "gender") as "gender" | "age";
```

**2. Update the cache key** (find all references to the old cache key and update):
```ts
// Old: const cacheKey = campaign_id + date (or similar)
// New:
const cacheKey = `${campaignId}:${breakdown}:${date}`;
```

**3. Update the `fetchAdDemographics` call** to pass `breakdown`:
```ts
const rows = await fetchAdDemographics(metaAccountId, campaignId, date, token, breakdown);
```

**4. Update the upsert** to include new columns:
```ts
const { error: upsertError } = await admin
  .from("meta_ad_demographics")
  .upsert(
    rows.map((r) => ({
      meta_account_id: accountId,
      campaign_id:    r.campaign_id,
      campaign_name:  r.campaign_name,
      adset_id:       r.adset_id,
      adset_name:     r.adset_name,
      ad_id:          r.ad_id,
      ad_name:        r.ad_name,
      date,
      gender:         r.gender,
      age_group:      r.age_group,
      spend:          r.spend,
      impressions:    r.impressions,
      conversions:    r.conversions,
      messages:       r.messages,
    })),
    {
      onConflict: "meta_account_id,campaign_id,adset_id,ad_id,date,gender,age_group",
      ignoreDuplicates: false,
    }
  );
```

The response shape is unchanged (`{ data: rows }`).

- [ ] **Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Commit**

```bash
git add src/lib/meta/client.ts \
        src/app/api/ad-ops/demographics/route.ts
git commit -m "feat(api): upgrade demographics to ad-level fetch with adset/ad fields and age breakdown support"
```

---

## Task 6: Create Reusable DemographicBar Component

**Files:**
- Create: `src/components/ui/demographic-bar.tsx`

- [ ] **Create the file**

```tsx
// src/components/ui/demographic-bar.tsx
"use client";

export type BarSegment = {
  key:   string;
  label: string;
  spend: number;
  color: string; // CSS color value or var(--...) string
};

export const GENDER_COLORS: Record<string, string> = {
  male:    "var(--color-accent)",
  female:  "var(--color-info)",
  unknown: "var(--color-border-primary)",
};

export const AGE_COLORS: Record<string, string> = {
  "13-17": "#818cf8",
  "18-24": "var(--color-accent)",
  "25-34": "var(--color-info)",
  "35-44": "var(--color-success)",
  "45-54": "#f59e0b",
  "55-64": "var(--color-error)",
  "65+":   "var(--color-text-secondary)",
};

type Props = {
  segments:    BarSegment[];
  showLegend?: boolean;
  showSpend?:  boolean;
};

export function DemographicBar({
  segments,
  showLegend = true,
  showSpend  = true,
}: Props) {
  const total = segments.reduce((s, r) => s + r.spend, 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)]">
        {segments.map((seg) => {
          const pct = (seg.spend / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg.key}
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ₱${seg.spend.toLocaleString()}`}
            />
          );
        })}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
          {segments
            .filter((r) => r.spend > 0)
            .map((seg) => (
              <div key={seg.key} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[10px] text-[var(--color-text-secondary)] capitalize">
                  {seg.label}
                </span>
                {showSpend && (
                  <span className="text-[10px] font-semibold text-[var(--color-text-primary)]">
                    {seg.spend >= 1000
                      ? `₱${(seg.spend / 1000).toFixed(1)}K`
                      : `₱${seg.spend.toFixed(0)}`}
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Commit**

```bash
git add src/components/ui/demographic-bar.tsx
git commit -m "feat(ui): add DemographicBar shared component with gender and age color maps"
```

---

## Task 7: Hierarchical Demographics in Campaigns-View + Age Toggle

**Files:**
- Modify: `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx`

This task replaces the demographics state type, fetch effect, and render function.

- [ ] **Add DemographicBar import at the top of campaigns-view.tsx**

```ts
import { DemographicBar, GENDER_COLORS, AGE_COLORS, type BarSegment } from "@/components/ui/demographic-bar";
```

- [ ] **Replace the demographics state block (around line 382)**

Find:
```ts
const [demographics, setDemographics] = useState<Record<string, { gender: string; spend: number; impressions: number; conversions: number; messages: number }[]>>({});
const [demographicsLoading, setDemographicsLoading] = useState<Set<string>>(new Set());
```

Replace with:
```ts
type DemoRow = {
  gender:        string | null;
  age_group:     string | null;
  adset_id:      string | null;
  adset_name:    string | null;
  ad_id:         string | null;
  ad_name:       string | null;
  campaign_name: string | null;
  spend:       number;
  impressions: number;
  conversions: number;
  messages:    number;
};
// Cache key: `${campaign_id}:${breakdown}`
const [demographics,        setDemographics]        = useState<Record<string, DemoRow[]>>({});
const [demographicsLoading, setDemographicsLoading] = useState<Set<string>>(new Set());
const [demoBreakdown,       setDemoBreakdown]       = useState<"gender" | "age">("gender");
// expandedAdsets: campaignId → Set of expanded adset_ids
const [expandedAdsets, setExpandedAdsets] = useState<Record<string, Set<string>>>({});
```

- [ ] **Replace the demographics fetch useEffect (around line 475)**

Find the useEffect that has `// Fetch gender demographics when a campaign expands` and replace its entire body:

```ts
useEffect(() => {
  if (!expandedId) return;
  const campaign = tabCampaigns.find((c) => c.id === expandedId);
  if (!campaign) return;
  const accountForCampaign = accountMap[campaign.meta_account_id];
  if (!accountForCampaign?.id) return;

  const fetchBreakdown = (breakdown: "gender" | "age") => {
    const cacheKey = `${campaign.campaign_id}:${breakdown}`;
    if (demographics[cacheKey]) return;
    setDemographicsLoading((prev) => new Set([...prev, cacheKey]));
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    fetch(
      `/api/ad-ops/demographics?campaign_id=${encodeURIComponent(campaign.campaign_id)}&meta_account_id=${encodeURIComponent(accountForCampaign.id)}&date=${yesterday}&breakdown=${breakdown}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json) =>
        setDemographics((prev) => ({ ...prev, [cacheKey]: json.data ?? [] }))
      )
      .catch(() =>
        setDemographics((prev) => ({ ...prev, [cacheKey]: [] }))
      )
      .finally(() =>
        setDemographicsLoading((prev) => {
          const s = new Set(prev);
          s.delete(cacheKey);
          return s;
        })
      );
  };

  fetchBreakdown("gender");
  fetchBreakdown("age");
}, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Replace `renderDemographics` (starting at line ~1007)**

Find the function `function renderDemographics(campaignId: string, curr: string)` and replace it entirely:

```tsx
function renderDemographics(campaignId: string, curr: string) {
  const cacheKey = `${campaignId}:${demoBreakdown}`;
  const data     = demographics[cacheKey];
  const loading  = demographicsLoading.has(cacheKey);

  if (loading) {
    return (
      <div className="px-5 py-3 border-t border-[var(--color-border-secondary)]">
        <div className="h-4 w-32 bg-[var(--color-bg-tertiary)] rounded animate-pulse" />
      </div>
    );
  }
  if (!data || data.length === 0) return null;

  const segKey   = demoBreakdown === "gender" ? "gender" : "age_group";
  const colorMap = demoBreakdown === "gender" ? GENDER_COLORS : AGE_COLORS;
  const fmtMny   = (n: number) =>
    n >= 1000 ? `₱${(n / 1000).toFixed(1)}K` : `₱${n.toFixed(0)}`;
  const cprLabel = (spend: number, conv: number, msg: number) => {
    const v = conv > 0 ? spend / conv : msg > 0 ? spend / msg : null;
    return v ? `CPR ₱${v.toFixed(0)}` : null;
  };

  // ── Campaign total segments ──────────────────────────────────────────────
  const totalBySegment = new Map<string, { spend: number; conv: number; msg: number }>();
  for (const row of data) {
    const seg = ((row as Record<string, unknown>)[segKey] as string) ?? "unknown";
    const ex = totalBySegment.get(seg) ?? { spend: 0, conv: 0, msg: 0 };
    totalBySegment.set(seg, {
      spend: ex.spend + row.spend,
      conv:  ex.conv  + row.conversions,
      msg:   ex.msg   + row.messages,
    });
  }
  const campaignSegments: BarSegment[] = [...totalBySegment.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .map(([seg, t]) => ({
      key: seg, label: seg, spend: t.spend,
      color: colorMap[seg] ?? "var(--color-border-primary)",
    }));

  // ── Group by adset ───────────────────────────────────────────────────────
  const adsetMap = new Map<string, { name: string; rows: DemoRow[] }>();
  for (const row of data) {
    if (!row.adset_id) continue;
    if (!adsetMap.has(row.adset_id))
      adsetMap.set(row.adset_id, { name: row.adset_name ?? row.adset_id, rows: [] });
    adsetMap.get(row.adset_id)!.rows.push(row);
  }

  const expandedSet = expandedAdsets[campaignId] ?? new Set<string>();
  const toggleAdset = (adsetId: string) =>
    setExpandedAdsets((prev) => {
      const s = new Set(prev[campaignId] ?? []);
      if (s.has(adsetId)) s.delete(adsetId); else s.add(adsetId);
      return { ...prev, [campaignId]: s };
    });

  return (
    <div className="px-5 py-3 border-t border-[var(--color-border-secondary)] space-y-3">
      {/* Header + Gender/Age toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">
          Demographic Spend · yesterday
        </p>
        <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] rounded-md p-0.5">
          {(["gender", "age"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setDemoBreakdown(b)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors capitalize ${
                demoBreakdown === b
                  ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-tertiary)]"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign total bar */}
      <DemographicBar segments={campaignSegments} showLegend showSpend />

      {/* Adsets */}
      {[...adsetMap.entries()].map(([adsetId, adset]) => {
        const adsetBySegment = new Map<string, number>();
        for (const row of adset.rows) {
          const seg = ((row as Record<string, unknown>)[segKey] as string) ?? "unknown";
          adsetBySegment.set(seg, (adsetBySegment.get(seg) ?? 0) + row.spend);
        }
        const adsetSegments: BarSegment[] = [...adsetBySegment.entries()].map(
          ([seg, spend]) => ({ key: seg, label: seg, spend, color: colorMap[seg] ?? "var(--color-border-primary)" })
        );
        const adsetSpend = adset.rows.reduce((s, r) => s + r.spend, 0);
        const isOpen     = expandedSet.has(adsetId);

        const adMap = new Map<string, { name: string; rows: DemoRow[] }>();
        for (const row of adset.rows) {
          if (!row.ad_id) continue;
          if (!adMap.has(row.ad_id))
            adMap.set(row.ad_id, { name: row.ad_name ?? row.ad_id, rows: [] });
          adMap.get(row.ad_id)!.rows.push(row);
        }

        return (
          <div key={adsetId} className="space-y-1.5">
            <button onClick={() => toggleAdset(adsetId)} className="w-full text-left">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-[var(--color-text-tertiary)]">
                  {isOpen ? "▾" : "▸"}
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)] truncate flex-1">
                  {adset.name}
                </span>
                <span className="text-[10px] text-[var(--color-text-tertiary)] shrink-0">
                  {fmtMny(adsetSpend)}
                </span>
              </div>
              <DemographicBar segments={adsetSegments} showLegend={false} />
            </button>

            {isOpen && (
              <div className="pl-4 space-y-1.5">
                {[...adMap.entries()].map(([adId, ad]) => {
                  const adBySegment = new Map<string, number>();
                  for (const row of ad.rows) {
                    const seg = ((row as Record<string, unknown>)[segKey] as string) ?? "unknown";
                    adBySegment.set(seg, (adBySegment.get(seg) ?? 0) + row.spend);
                  }
                  const adSegments: BarSegment[] = [...adBySegment.entries()].map(
                    ([seg, spend]) => ({ key: seg, label: seg, spend, color: colorMap[seg] ?? "var(--color-border-primary)" })
                  );
                  const adSpend = ad.rows.reduce((s, r) => s + r.spend, 0);
                  const adConv  = ad.rows.reduce((s, r) => s + r.conversions, 0);
                  const adMsg   = ad.rows.reduce((s, r) => s + r.messages, 0);
                  const cpr     = cprLabel(adSpend, adConv, adMsg);

                  return (
                    <div key={adId}>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[10px] text-[var(--color-text-secondary)] truncate flex-1 pl-2">
                          • {ad.name}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-tertiary)] shrink-0">
                          {fmtMny(adSpend)}
                        </span>
                        {cpr && (
                          <span className="text-[10px] text-[var(--color-text-tertiary)] ml-2 shrink-0">
                            {cpr}
                          </span>
                        )}
                      </div>
                      <DemographicBar segments={adSegments} showLegend={false} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Commit**

```bash
git add src/app/\(dashboard\)/ad-ops/campaigns/campaigns-view.tsx
git commit -m "feat(campaigns): hierarchical gender/age demographic breakdown with adset and ad drill-down"
```

---

## Task 8: Executive Demographic Spend Card

**Files:**
- Create: `src/app/(dashboard)/executive/ad-ops/demographic-spend-card.tsx`
- Modify: `src/app/(dashboard)/executive/ad-ops/page.tsx`

- [ ] **Create `demographic-spend-card.tsx`**

```tsx
// src/app/(dashboard)/executive/ad-ops/demographic-spend-card.tsx
"use client";

import { useState } from "react";
import {
  DemographicBar,
  GENDER_COLORS,
  AGE_COLORS,
  type BarSegment,
} from "@/components/ui/demographic-bar";

export type DemoDataRow = {
  gender:        string | null;
  age_group:     string | null;
  campaign_id:   string;
  campaign_name: string | null;
  adset_id:      string | null;
  adset_name:    string | null;
  ad_id:         string | null;
  ad_name:       string | null;
  spend:       number;
  conversions: number;
  messages:    number;
};

type SegmentSummary = {
  key: string; spend: number; conversions: number; messages: number; color: string;
};

function aggregateSegments(
  rows: DemoDataRow[],
  segKey: "gender" | "age_group",
  colorMap: Record<string, string>
): SegmentSummary[] {
  const map = new Map<string, SegmentSummary>();
  for (const row of rows) {
    const key = (row[segKey] ?? "unknown") as string;
    const ex = map.get(key) ?? {
      key, spend: 0, conversions: 0, messages: 0,
      color: colorMap[key] ?? "var(--color-border-primary)",
    };
    map.set(key, {
      ...ex,
      spend:       ex.spend       + row.spend,
      conversions: ex.conversions + row.conversions,
      messages:    ex.messages    + row.messages,
    });
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend).slice(0, 5);
}

export function DemographicSpendCard({ data }: { data: DemoDataRow[] }) {
  const [mode,     setMode]     = useState<"gender" | "age">("gender");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const segKey   = mode === "gender" ? "gender" : "age_group";
  const colorMap = mode === "gender" ? GENDER_COLORS : AGE_COLORS;

  const modeRows = data.filter((r) =>
    mode === "gender" ? r.gender !== null : r.age_group !== null
  );

  const segments   = aggregateSegments(modeRows, segKey, colorMap);
  const totalSpend = segments.reduce((s, seg) => s + seg.spend, 0);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });

  const fmtMoney = (n: number) =>
    n >= 1_000_000 ? `₱${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000   ? `₱${(n / 1_000).toFixed(1)}K`
    : `₱${n.toFixed(0)}`;

  const cprLabel = (spend: number, conv: number, msg: number) => {
    const v = conv > 0 ? spend / conv : msg > 0 ? spend / msg : null;
    return v ? `CPR ₱${v.toFixed(0)}` : null;
  };

  if (segments.length === 0) return null;

  return (
    <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-5 shadow-[var(--shadow-sm)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Demographic Spend
        </h3>
        <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] rounded-lg p-0.5">
          {(["gender", "age"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs px-3 py-1 rounded-md transition-colors capitalize ${
                mode === m
                  ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {segments.map((seg) => {
          const pct    = totalSpend > 0 ? (seg.spend / totalSpend) * 100 : 0;
          const cpr    = cprLabel(seg.spend, seg.conversions, seg.messages);
          const isOpen = expanded.has(seg.key);

          // Campaign drill-down for this segment
          const drillRows = modeRows.filter(
            (r) => ((r as Record<string, unknown>)[segKey] ?? "unknown") === seg.key
          );
          const campaignMap = new Map<
            string,
            { name: string; spend: number; conv: number; msg: number }
          >();
          for (const r of drillRows) {
            const ex = campaignMap.get(r.campaign_id) ?? {
              name: r.campaign_name ?? r.campaign_id,
              spend: 0, conv: 0, msg: 0,
            };
            campaignMap.set(r.campaign_id, {
              ...ex,
              spend: ex.spend + r.spend,
              conv:  ex.conv  + r.conversions,
              msg:   ex.msg   + r.messages,
            });
          }
          const campaigns = [...campaignMap.values()]
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 5);

          return (
            <div key={seg.key}>
              <button onClick={() => toggle(seg.key)} className="w-full text-left">
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-sm capitalize text-[var(--color-text-primary)] flex-1 font-medium">
                    {seg.key}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {fmtMoney(seg.spend)}
                  </span>
                  <span className="text-xs text-[var(--color-text-tertiary)] w-8 text-right">
                    {pct.toFixed(0)}%
                  </span>
                  {cpr && (
                    <span className="text-xs text-[var(--color-text-tertiary)] w-20 text-right">
                      {cpr}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-tertiary)] ml-1">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </div>
                {/* Proportional bar vs total */}
                <div className="h-2 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: seg.color }}
                  />
                </div>
              </button>

              {isOpen && campaigns.length > 0 && (
                <div className="mt-2 pl-4 space-y-1.5 border-l-2 border-[var(--color-border-secondary)]">
                  {campaigns.map((c) => {
                    const cl = cprLabel(c.spend, c.conv, c.msg);
                    return (
                      <div key={c.name} className="flex items-center gap-2">
                        <span className="text-xs text-[var(--color-text-secondary)] truncate flex-1">
                          {c.name}
                        </span>
                        <span className="text-xs font-medium text-[var(--color-text-primary)] shrink-0">
                          {fmtMoney(c.spend)}
                        </span>
                        {cl && (
                          <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                            {cl}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Update `src/app/(dashboard)/executive/ad-ops/page.tsx`**

Add the import at the top:

```ts
import { DemographicSpendCard, type DemoDataRow } from "./demographic-spend-card";
```

Add the data fetch inside the page component, after existing queries:

```ts
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

const { data: demoRows } = await admin
  .from("meta_ad_demographics")
  .select(
    "gender, age_group, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, conversions, messages"
  )
  .eq("date", yesterday)
  .not("adset_id", "is", null); // ad-level rows only — skip legacy campaign-level rows
```

Add the card below `<KpiTabView>` in the JSX:

```tsx
{demoRows && demoRows.length > 0 && (
  <DemographicSpendCard data={demoRows as DemoDataRow[]} />
)}
```

- [ ] **Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Commit**

```bash
git add src/app/\(dashboard\)/executive/ad-ops/demographic-spend-card.tsx \
        src/app/\(dashboard\)/executive/ad-ops/page.tsx
git commit -m "feat(executive): add Demographic Spend card with gender/age toggle and campaign drill-down"
```
