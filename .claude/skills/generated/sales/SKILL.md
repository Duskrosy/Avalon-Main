---
name: sales
description: "Skill for the Sales area of Avalon New. 18 symbols across 4 files."
---

# Sales

18 symbols | 4 files | Cohesion: 76%

## When to Use

- Working with code in `src/`
- Understanding how resolveQaPoints, resolveQaFail, computeDailyFps work
- Modifying sales-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/sales/scoring.ts` | resolveQaPoints, resolveQaFail, computeDailyFps, computeMonthlyFps, computeMtdConfirmedRegular (+10) |
| `src/app/api/sales/weekly-report/route.ts` | GET |
| `src/app/api/sales/payouts/route.ts` | POST |
| `src/app/api/sales/fps/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`resolveQaPoints`** (Function) — `src/lib/sales/scoring.ts:39`
- **`resolveQaFail`** (Function) — `src/lib/sales/scoring.ts:44`
- **`computeDailyFps`** (Function) — `src/lib/sales/scoring.ts:53`
- **`computeMonthlyFps`** (Function) — `src/lib/sales/scoring.ts:112`
- **`computeMtdConfirmedRegular`** (Function) — `src/lib/sales/scoring.ts:126`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `resolveQaPoints` | Function | `src/lib/sales/scoring.ts` | 39 |
| `resolveQaFail` | Function | `src/lib/sales/scoring.ts` | 44 |
| `computeDailyFps` | Function | `src/lib/sales/scoring.ts` | 53 |
| `computeMonthlyFps` | Function | `src/lib/sales/scoring.ts` | 112 |
| `computeMtdConfirmedRegular` | Function | `src/lib/sales/scoring.ts` | 126 |
| `computeGateStatus` | Function | `src/lib/sales/scoring.ts` | 134 |
| `computeMonthlyFpsWithConsistency` | Function | `src/lib/sales/scoring.ts` | 148 |
| `GET` | Function | `src/app/api/sales/weekly-report/route.ts` | 11 |
| `POST` | Function | `src/app/api/sales/payouts/route.ts` | 42 |
| `GET` | Function | `src/app/api/sales/fps/route.ts` | 14 |
| `computeStdVolPts` | Function | `src/lib/sales/scoring.ts` | 7 |
| `computeBufferPts` | Function | `src/lib/sales/scoring.ts` | 14 |
| `isNoDataDay` | Function | `src/lib/sales/scoring.ts` | 21 |
| `computeFinalVolPts` | Function | `src/lib/sales/scoring.ts` | 25 |
| `computeMainTierPayout` | Function | `src/lib/sales/scoring.ts` | 169 |
| `computeAbandonedPayout` | Function | `src/lib/sales/scoring.ts` | 183 |
| `computeOnhandPayout` | Function | `src/lib/sales/scoring.ts` | 190 |
| `computeTotalPayout` | Function | `src/lib/sales/scoring.ts` | 207 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → IsNoDataDay` | cross_community | 4 |
| `GET → ComputeStdVolPts` | cross_community | 4 |
| `GET → ComputeBufferPts` | cross_community | 4 |
| `GET → IsNoDataDay` | cross_community | 4 |
| `GET → ComputeStdVolPts` | cross_community | 4 |
| `GET → ComputeBufferPts` | cross_community | 4 |
| `GET → ResolveQaPoints` | intra_community | 3 |
| `GET → ResolveQaFail` | intra_community | 3 |
| `GET → ResolveQaPoints` | intra_community | 3 |
| `GET → ResolveQaFail` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 7 calls |
| Confirmed-sales | 1 calls |

## How to Explore

1. `gitnexus_context({name: "resolveQaPoints"})` — see callers and callees
2. `gitnexus_query({query: "sales"})` — find related execution flows
3. Read key files listed above for implementation details
