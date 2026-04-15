---
name: meta
description: "Skill for the Meta area of Avalon New. 19 symbols across 8 files."
---

# Meta

19 symbols | 8 files | Cohesion: 54%

## When to Use

- Working with code in `src/`
- Understanding how fetchAccountInsights, fetchCampaigns, fetchAdInsights work
- Modifying meta-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/meta/client.ts` | buildInsightsUrl, fetchAccountInsights, fetchCampaigns, fetchAdInsights, resolveToken (+6) |
| `src/app/api/ad-ops/sync/route.ts` | isCronRequest, POST |
| `src/app/api/ad-ops/today-stats/route.ts` | GET |
| `src/app/api/ad-ops/custom-conversions/route.ts` | GET |
| `src/app/api/ad-ops/live-ads/thumbnails/route.ts` | GET |
| `src/app/api/ad-ops/live-ads/ad/route.ts` | POST |
| `src/app/api/ad-ops/live-ads/route.ts` | POST |
| `src/app/api/ad-ops/live-ads/enforce-caps/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`fetchAccountInsights`** (Function) — `src/lib/meta/client.ts:92`
- **`fetchCampaigns`** (Function) — `src/lib/meta/client.ts:110`
- **`fetchAdInsights`** (Function) — `src/lib/meta/client.ts:133`
- **`GET`** (Function) — `src/app/api/ad-ops/today-stats/route.ts:9`
- **`POST`** (Function) — `src/app/api/ad-ops/sync/route.ts:20`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `fetchAccountInsights` | Function | `src/lib/meta/client.ts` | 92 |
| `fetchCampaigns` | Function | `src/lib/meta/client.ts` | 110 |
| `fetchAdInsights` | Function | `src/lib/meta/client.ts` | 133 |
| `GET` | Function | `src/app/api/ad-ops/today-stats/route.ts` | 9 |
| `POST` | Function | `src/app/api/ad-ops/sync/route.ts` | 20 |
| `resolveToken` | Function | `src/lib/meta/client.ts` | 8 |
| `fetchAdThumbnails` | Function | `src/lib/meta/client.ts` | 217 |
| `updateAdStatus` | Function | `src/lib/meta/client.ts` | 282 |
| `GET` | Function | `src/app/api/ad-ops/custom-conversions/route.ts` | 14 |
| `GET` | Function | `src/app/api/ad-ops/live-ads/thumbnails/route.ts` | 13 |
| `POST` | Function | `src/app/api/ad-ops/live-ads/ad/route.ts` | 22 |
| `updateCampaignStatus` | Function | `src/lib/meta/client.ts` | 244 |
| `fetchCampaignSpend` | Function | `src/lib/meta/client.ts` | 370 |
| `POST` | Function | `src/app/api/ad-ops/live-ads/route.ts` | 231 |
| `GET` | Function | `src/app/api/ad-ops/live-ads/enforce-caps/route.ts` | 12 |
| `buildInsightsUrl` | Function | `src/lib/meta/client.ts` | 70 |
| `isCronRequest` | Function | `src/app/api/ad-ops/sync/route.ts` | 12 |
| `sumAction` | Function | `src/lib/meta/client.ts` | 181 |
| `normaliseAdInsight` | Function | `src/lib/meta/client.ts` | 187 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → CreateClient` | cross_community | 3 |
| `POST → GetCurrentUser` | cross_community | 3 |
| `POST → CreateClient` | cross_community | 3 |
| `POST → GetCurrentUser` | cross_community | 3 |
| `POST → IsManagerOrAbove` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 12 calls |
| Campaigns | 7 calls |
| Live-ads | 1 calls |

## How to Explore

1. `gitnexus_context({name: "fetchAccountInsights"})` — see callers and callees
2. `gitnexus_query({query: "meta"})` — find related execution flows
3. Read key files listed above for implementation details
