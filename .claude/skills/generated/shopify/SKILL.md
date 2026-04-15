---
name: shopify
description: "Skill for the Shopify area of Avalon New. 13 symbols across 4 files."
---

# Shopify

13 symbols | 4 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how fetchShopifyOrders, GET, extractAgentHandle work
- Modifying shopify-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/shopify/client.ts` | getShopifyToken, shopifyGet, fetchShopifyOrders, extractAgentHandle, buildOrderRow |
| `src/app/(dashboard)/sales-ops/shopify/shopify-reconciliation.tsx` | fmtMoney, agentName, getStatsRange, ShopifyReconciliation |
| `src/app/api/sales/shopify-stats/route.ts` | toManilaRange, GET |
| `src/app/api/sales/shopify-sync/route.ts` | isCronRequest, POST |

## Entry Points

Start here when exploring this area:

- **`fetchShopifyOrders`** (Function) — `src/lib/shopify/client.ts:121`
- **`GET`** (Function) — `src/app/api/sales/shopify-stats/route.ts:20`
- **`extractAgentHandle`** (Function) — `src/lib/shopify/client.ts:181`
- **`buildOrderRow`** (Function) — `src/lib/shopify/client.ts:205`
- **`POST`** (Function) — `src/app/api/sales/shopify-sync/route.ts:20`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `fetchShopifyOrders` | Function | `src/lib/shopify/client.ts` | 121 |
| `GET` | Function | `src/app/api/sales/shopify-stats/route.ts` | 20 |
| `extractAgentHandle` | Function | `src/lib/shopify/client.ts` | 181 |
| `buildOrderRow` | Function | `src/lib/shopify/client.ts` | 205 |
| `POST` | Function | `src/app/api/sales/shopify-sync/route.ts` | 20 |
| `ShopifyReconciliation` | Function | `src/app/(dashboard)/sales-ops/shopify/shopify-reconciliation.tsx` | 116 |
| `getShopifyToken` | Function | `src/lib/shopify/client.ts` | 12 |
| `shopifyGet` | Function | `src/lib/shopify/client.ts` | 57 |
| `toManilaRange` | Function | `src/app/api/sales/shopify-stats/route.ts` | 13 |
| `isCronRequest` | Function | `src/app/api/sales/shopify-sync/route.ts` | 12 |
| `fmtMoney` | Function | `src/app/(dashboard)/sales-ops/shopify/shopify-reconciliation.tsx` | 75 |
| `agentName` | Function | `src/app/(dashboard)/sales-ops/shopify/shopify-reconciliation.tsx` | 79 |
| `getStatsRange` | Function | `src/app/(dashboard)/sales-ops/shopify/shopify-reconciliation.tsx` | 99 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 5 calls |
| Campaigns | 2 calls |

## How to Explore

1. `gitnexus_context({name: "fetchShopifyOrders"})` — see callers and callees
2. `gitnexus_query({query: "shopify"})` — find related execution flows
3. Read key files listed above for implementation details
