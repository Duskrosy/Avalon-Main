---
name: id
description: "Skill for the [id] area of Avalon New. 152 symbols across 109 files."
---

# [id]

152 symbols | 109 files | Cohesion: 48%

## When to Use

- Working with code in `src/`
- Understanding how createClient, isOps, GET work
- Modifying [id]-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/sales/qa/route.ts` | GET, POST, PATCH, DELETE |
| `src/lib/permissions/get-user.ts` | isOps, getCurrentUser, isManagerOrAbove |
| `src/app/api/smm/analytics/route.ts` | guard, GET, POST |
| `src/app/api/sales/volume/route.ts` | GET, PATCH, DELETE |
| `src/app/api/sales/payouts/route.ts` | DELETE, GET, PATCH |
| `src/app/api/sales/consistency/route.ts` | GET, POST, PATCH |
| `src/app/api/obs/alerts/route.ts` | POST, GET, PATCH |
| `src/app/api/memos/[id]/route.ts` | DELETE, GET, PATCH |
| `src/app/api/users/[id]/avatar/route.ts` | canEditOthers, DELETE, POST |
| `src/app/api/sales/downtime/route.ts` | GET, PATCH, DELETE |

## Entry Points

Start here when exploring this area:

- **`createClient`** (Function) — `src/lib/supabase/server.ts:3`
- **`isOps`** (Function) — `src/lib/permissions/get-user.ts:30`
- **`GET`** (Function) — `src/app/auth/callback/route.ts:11`
- **`POST`** (Function) — `src/app/api/rooms/route.ts:21`
- **`GET`** (Function) — `src/app/api/learning/route.ts:6`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createClient` | Function | `src/lib/supabase/server.ts` | 3 |
| `isOps` | Function | `src/lib/permissions/get-user.ts` | 30 |
| `GET` | Function | `src/app/auth/callback/route.ts` | 11 |
| `POST` | Function | `src/app/api/rooms/route.ts` | 21 |
| `GET` | Function | `src/app/api/learning/route.ts` | 6 |
| `GET` | Function | `src/app/api/kpis/route.ts` | 6 |
| `GET` | Function | `src/app/api/kops/route.ts` | 6 |
| `GET` | Function | `src/app/api/goals/route.ts` | 7 |
| `GET` | Function | `src/app/api/directory/route.ts` | 5 |
| `GET` | Function | `src/app/api/calendar/route.ts` | 22 |
| `GET` | Function | `src/app/api/leaves/route.ts` | 9 |
| `DELETE` | Function | `src/app/api/bookings/route.ts` | 94 |
| `DELETE` | Function | `src/app/api/announcements/route.ts` | 87 |
| `DELETE` | Function | `src/app/api/users/[id]/route.ts` | 120 |
| `GET` | Function | `src/app/api/smm/top-posts/route.ts` | 5 |
| `GET` | Function | `src/app/api/smm/news/route.ts` | 27 |
| `GET` | Function | `src/app/api/smm/debug-posts/route.ts` | 10 |
| `GET` | Function | `src/app/api/smm/debug-metrics/route.ts` | 9 |
| `ExecutiveLayout` | Function | `src/app/(dashboard)/executive/layout.tsx` | 8 |
| `GET` | Function | `src/app/api/smm/analytics/route.ts` | 39 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → CreateClient` | cross_community | 3 |
| `POST → GetCurrentUser` | cross_community | 3 |
| `POST → IsOps` | cross_community | 3 |
| `GET → CreateClient` | cross_community | 3 |
| `GET → GetCurrentUser` | cross_community | 3 |
| `POST → CreateClient` | cross_community | 3 |
| `POST → GetCurrentUser` | cross_community | 3 |
| `DELETE → IsManagerOrAbove` | cross_community | 3 |
| `POST → IsManagerOrAbove` | cross_community | 3 |
| `POST → CreateClient` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Campaigns | 34 calls |
| Confirmed-sales | 12 calls |

## How to Explore

1. `gitnexus_context({name: "createClient"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
