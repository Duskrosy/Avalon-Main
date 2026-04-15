---
name: campaigns
description: "Skill for the Campaigns area of Avalon New. 63 symbols across 21 files."
---

# Campaigns

63 symbols | 21 files | Cohesion: 64%

## When to Use

- Working with code in `src/`
- Understanding how createAdminClient, fetchShopifyOrderByNumber, DashboardPage work
- Modifying campaigns-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx` | fmt, fmtK, fmtMoney, formatMetricValue, CampaignsView (+23) |
| `src/app/api/creatives/campaigns/route.ts` | currentWeekMonday, guardRead, GET, POST, PATCH |
| `src/app/(dashboard)/page.tsx` | getGreeting, rag, DashboardPage |
| `src/app/api/smm/news/fetch/route.ts` | extractBetween, extractItems, POST |
| `src/app/api/calendar/settings/route.ts` | GET, POST |
| `src/app/api/birthday-cards/[personId]/route.ts` | birthdayStatus, GET |
| `src/app/(dashboard)/executive/sales/page.tsx` | fmtMoney, ExecutiveSalesPage |
| `src/app/(dashboard)/executive/people/page.tsx` | capitalize, ExecutivePeoplePage |
| `src/app/(dashboard)/executive/marketing/page.tsx` | fmtK, ExecutiveMarketingPage |
| `src/app/(dashboard)/executive/creatives/page.tsx` | fmtK, ExecutiveCreativesPage |

## Entry Points

Start here when exploring this area:

- **`createAdminClient`** (Function) — `src/lib/supabase/admin.ts:2`
- **`fetchShopifyOrderByNumber`** (Function) — `src/lib/shopify/client.ts:78`
- **`DashboardPage`** (Function) — `src/app/(dashboard)/page.tsx:110`
- **`GET`** (Function) — `src/app/api/notifications/route.ts:8`
- **`GET`** (Function) — `src/app/api/kanban/route.ts:6`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createAdminClient` | Function | `src/lib/supabase/admin.ts` | 2 |
| `fetchShopifyOrderByNumber` | Function | `src/lib/shopify/client.ts` | 78 |
| `DashboardPage` | Function | `src/app/(dashboard)/page.tsx` | 110 |
| `GET` | Function | `src/app/api/notifications/route.ts` | 8 |
| `GET` | Function | `src/app/api/kanban/route.ts` | 6 |
| `GET` | Function | `src/app/api/smm/groups/route.ts` | 31 |
| `GET` | Function | `src/app/api/sales/shopify-order/route.ts` | 12 |
| `GET` | Function | `src/app/api/learning/[id]/route.ts` | 6 |
| `GET` | Function | `src/app/api/kops/[id]/route.ts` | 6 |
| `GET` | Function | `src/app/api/creatives/campaigns/route.ts` | 70 |
| `POST` | Function | `src/app/api/creatives/campaigns/route.ts` | 93 |
| `PATCH` | Function | `src/app/api/creatives/campaigns/route.ts` | 131 |
| `GET` | Function | `src/app/api/calendar/settings/route.ts` | 27 |
| `POST` | Function | `src/app/api/calendar/settings/route.ts` | 46 |
| `GET` | Function | `src/app/api/birthday-cards/[personId]/route.ts` | 29 |
| `ShopifyPage` | Function | `src/app/(dashboard)/sales-ops/shopify/page.tsx` | 6 |
| `ExecutiveSalesPage` | Function | `src/app/(dashboard)/executive/sales/page.tsx` | 12 |
| `ExecutivePeoplePage` | Function | `src/app/(dashboard)/executive/people/page.tsx` | 26 |
| `ExecutiveMarketingPage` | Function | `src/app/(dashboard)/executive/marketing/page.tsx` | 20 |
| `ExecutiveCreativesPage` | Function | `src/app/(dashboard)/executive/creatives/page.tsx` | 20 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CampaignsView → SkipWs` | cross_community | 6 |
| `CampaignsView → FmtMoney` | intra_community | 3 |
| `CampaignsView → FmtK` | intra_community | 3 |
| `POST → CreateAdminClient` | cross_community | 3 |
| `GET → CreateClient` | cross_community | 3 |
| `GET → GetCurrentUser` | cross_community | 3 |
| `GET → IsOps` | cross_community | 3 |
| `POST → CreateClient` | cross_community | 3 |
| `POST → GetCurrentUser` | cross_community | 3 |
| `POST → IsOps` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 43 calls |

## How to Explore

1. `gitnexus_context({name: "createAdminClient"})` — see callers and callees
2. `gitnexus_query({query: "campaigns"})` — find related execution flows
3. Read key files listed above for implementation details
