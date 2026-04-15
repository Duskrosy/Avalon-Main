---
name: competitors
description: "Skill for the Competitors area of Avalon New. 12 symbols across 2 files."
---

# Competitors

12 symbols | 2 files | Cohesion: 79%

## When to Use

- Working with code in `src/`
- Understanding how GET, POST, PATCH work
- Modifying competitors-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/marketing/competitors/competitors-view.tsx` | emptyFillForm, CompetitorsView, openFillModal, handleAddPlatformAccount, handleDelete (+2) |
| `src/app/api/smm/competitors/route.ts` | guard, GET, POST, PATCH, DELETE |

## Entry Points

Start here when exploring this area:

- **`GET`** (Function) — `src/app/api/smm/competitors/route.ts:75`
- **`POST`** (Function) — `src/app/api/smm/competitors/route.ts:192`
- **`PATCH`** (Function) — `src/app/api/smm/competitors/route.ts:220`
- **`DELETE`** (Function) — `src/app/api/smm/competitors/route.ts:346`
- **`CompetitorsView`** (Function) — `src/app/(dashboard)/marketing/competitors/competitors-view.tsx:106`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `GET` | Function | `src/app/api/smm/competitors/route.ts` | 75 |
| `POST` | Function | `src/app/api/smm/competitors/route.ts` | 192 |
| `PATCH` | Function | `src/app/api/smm/competitors/route.ts` | 220 |
| `DELETE` | Function | `src/app/api/smm/competitors/route.ts` | 346 |
| `CompetitorsView` | Function | `src/app/(dashboard)/marketing/competitors/competitors-view.tsx` | 106 |
| `openFillModal` | Function | `src/app/(dashboard)/marketing/competitors/competitors-view.tsx` | 176 |
| `handleAddPlatformAccount` | Function | `src/app/(dashboard)/marketing/competitors/competitors-view.tsx` | 216 |
| `handleDelete` | Function | `src/app/(dashboard)/marketing/competitors/competitors-view.tsx` | 231 |
| `guard` | Function | `src/app/api/smm/competitors/route.ts` | 40 |
| `emptyFillForm` | Function | `src/app/(dashboard)/marketing/competitors/competitors-view.tsx` | 74 |
| `formatNumber` | Function | `src/app/(dashboard)/marketing/competitors/competitors-view.tsx` | 85 |
| `CompetitorCard` | Function | `src/app/(dashboard)/marketing/competitors/competitors-view.tsx` | 527 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `DELETE → CreateClient` | cross_community | 3 |
| `DELETE → GetCurrentUser` | cross_community | 3 |
| `DELETE → IsOps` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 4 calls |
| Campaigns | 4 calls |

## How to Explore

1. `gitnexus_context({name: "GET"})` — see callers and callees
2. `gitnexus_query({query: "competitors"})` — find related execution flows
3. Read key files listed above for implementation details
