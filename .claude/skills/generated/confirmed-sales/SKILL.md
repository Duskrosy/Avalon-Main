---
name: confirmed-sales
description: "Skill for the Confirmed-sales area of Avalon New. 17 symbols across 12 files."
---

# Confirmed-sales

17 symbols | 12 files | Cohesion: 47%

## When to Use

- Working with code in `src/`
- Understanding how validateBody, POST, PATCH work
- Modifying confirmed-sales-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/sales-ops/confirmed-sales/confirmed-sales-view.tsx` | agentName, ConfirmedSalesView, openEdit, handleDelete |
| `src/app/api/sales/confirmed-sales/route.ts` | POST, PATCH |
| `src/app/api/kanban/cards/route.ts` | POST, PATCH |
| `src/lib/api/validate.ts` | validateBody |
| `src/app/api/users/route.ts` | POST |
| `src/app/api/notifications/route.ts` | PATCH |
| `src/app/api/announcements/route.ts` | POST |
| `src/app/api/sales/downtime/route.ts` | POST |
| `src/app/api/ad-ops/requests/route.ts` | PATCH |
| `src/app/api/ad-ops/performance/route.ts` | POST |

## Entry Points

Start here when exploring this area:

- **`validateBody`** (Function) — `src/lib/api/validate.ts:6`
- **`POST`** (Function) — `src/app/api/users/route.ts:33`
- **`PATCH`** (Function) — `src/app/api/notifications/route.ts:42`
- **`POST`** (Function) — `src/app/api/announcements/route.ts:28`
- **`POST`** (Function) — `src/app/api/sales/downtime/route.ts:36`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `validateBody` | Function | `src/lib/api/validate.ts` | 6 |
| `POST` | Function | `src/app/api/users/route.ts` | 33 |
| `PATCH` | Function | `src/app/api/notifications/route.ts` | 42 |
| `POST` | Function | `src/app/api/announcements/route.ts` | 28 |
| `POST` | Function | `src/app/api/sales/downtime/route.ts` | 36 |
| `POST` | Function | `src/app/api/sales/confirmed-sales/route.ts` | 36 |
| `PATCH` | Function | `src/app/api/sales/confirmed-sales/route.ts` | 59 |
| `POST` | Function | `src/app/api/kanban/cards/route.ts` | 8 |
| `PATCH` | Function | `src/app/api/kanban/cards/route.ts` | 51 |
| `PATCH` | Function | `src/app/api/ad-ops/requests/route.ts` | 71 |
| `POST` | Function | `src/app/api/ad-ops/performance/route.ts` | 34 |
| `PATCH` | Function | `src/app/api/ad-ops/deployments/route.ts` | 78 |
| `PATCH` | Function | `src/app/api/ad-ops/assets/route.ts` | 83 |
| `ConfirmedSalesView` | Function | `src/app/(dashboard)/sales-ops/confirmed-sales/confirmed-sales-view.tsx` | 25 |
| `openEdit` | Function | `src/app/(dashboard)/sales-ops/confirmed-sales/confirmed-sales-view.tsx` | 117 |
| `handleDelete` | Function | `src/app/(dashboard)/sales-ops/confirmed-sales/confirmed-sales-view.tsx` | 171 |
| `agentName` | Function | `src/app/(dashboard)/sales-ops/confirmed-sales/confirmed-sales-view.tsx` | 16 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 28 calls |
| Campaigns | 5 calls |

## How to Explore

1. `gitnexus_context({name: "validateBody"})` — see callers and callees
2. `gitnexus_query({query: "confirmed-sales"})` — find related execution flows
3. Read key files listed above for implementation details
