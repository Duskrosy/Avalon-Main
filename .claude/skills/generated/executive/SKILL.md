---
name: executive
description: "Skill for the Executive area of Avalon New. 9 symbols across 3 files."
---

# Executive

9 symbols | 3 files | Cohesion: 85%

## When to Use

- Working with code in `src/`
- Understanding how ExecutiveOverviewPage, LiveAdsPanel, getPresetDates work
- Modifying executive-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/executive/page.tsx` | rag, fmtMoney, fmtK, ExecutiveOverviewPage |
| `src/app/(dashboard)/executive/live-ads-panel.tsx` | fmtMoney, fmtK, LiveAdsPanel |
| `src/app/(dashboard)/executive/date-range-bar.tsx` | getPresetDates, DateRangeBar |

## Entry Points

Start here when exploring this area:

- **`ExecutiveOverviewPage`** (Function) — `src/app/(dashboard)/executive/page.tsx:113`
- **`LiveAdsPanel`** (Function) — `src/app/(dashboard)/executive/live-ads-panel.tsx:59`
- **`getPresetDates`** (Function) — `src/app/(dashboard)/executive/date-range-bar.tsx:8`
- **`DateRangeBar`** (Function) — `src/app/(dashboard)/executive/date-range-bar.tsx:28`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ExecutiveOverviewPage` | Function | `src/app/(dashboard)/executive/page.tsx` | 113 |
| `LiveAdsPanel` | Function | `src/app/(dashboard)/executive/live-ads-panel.tsx` | 59 |
| `getPresetDates` | Function | `src/app/(dashboard)/executive/date-range-bar.tsx` | 8 |
| `DateRangeBar` | Function | `src/app/(dashboard)/executive/date-range-bar.tsx` | 28 |
| `rag` | Function | `src/app/(dashboard)/executive/page.tsx` | 10 |
| `fmtMoney` | Function | `src/app/(dashboard)/executive/page.tsx` | 17 |
| `fmtK` | Function | `src/app/(dashboard)/executive/page.tsx` | 22 |
| `fmtMoney` | Function | `src/app/(dashboard)/executive/live-ads-panel.tsx` | 32 |
| `fmtK` | Function | `src/app/(dashboard)/executive/live-ads-panel.tsx` | 39 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 2 calls |
| Campaigns | 1 calls |

## How to Explore

1. `gitnexus_context({name: "ExecutiveOverviewPage"})` — see callers and callees
2. `gitnexus_query({query: "executive"})` — find related execution flows
3. Read key files listed above for implementation details
