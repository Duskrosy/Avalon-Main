---
name: dashboard
description: "Skill for the Dashboard area of Avalon New. 11 symbols across 2 files."
---

# Dashboard

11 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how CreativesDashboard, AdDashboard work
- Modifying dashboard-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | avatarColor, initials, weekProgress, contentStatus, weekLabel (+1) |
| `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx` | countByStatus, currencySymbol, fmtCurrency, fmtK, AdDashboard |

## Entry Points

Start here when exploring this area:

- **`CreativesDashboard`** (Function) — `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx:232`
- **`AdDashboard`** (Function) — `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx:94`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CreativesDashboard` | Function | `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | 232 |
| `AdDashboard` | Function | `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx` | 94 |
| `avatarColor` | Function | `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | 56 |
| `initials` | Function | `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | 60 |
| `weekProgress` | Function | `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | 66 |
| `contentStatus` | Function | `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | 76 |
| `weekLabel` | Function | `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx` | 90 |
| `countByStatus` | Function | `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx` | 75 |
| `currencySymbol` | Function | `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx` | 79 |
| `fmtCurrency` | Function | `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx` | 84 |
| `fmtK` | Function | `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx` | 88 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreativesDashboard → WeekProgress` | intra_community | 3 |
| `AdDashboard → CurrencySymbol` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "CreativesDashboard"})` — see callers and callees
2. `gitnexus_query({query: "dashboard"})` — find related execution flows
3. Read key files listed above for implementation details
