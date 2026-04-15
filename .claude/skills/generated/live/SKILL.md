---
name: live
description: "Skill for the Live area of Avalon New. 19 symbols across 1 files."
---

# Live

19 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how LiveAdsView, loadThumbnails, handleCampaignToggle work
- Modifying live-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | fmtMoney, fmtMoneyDec, fmtK, fmt, spendPct (+14) |

## Entry Points

Start here when exploring this area:

- **`LiveAdsView`** (Function) — `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx:90`
- **`loadThumbnails`** (Function) — `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx:159`
- **`handleCampaignToggle`** (Function) — `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx:176`
- **`handleAdsetToggle`** (Function) — `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx:200`
- **`openAdsetCapEditor`** (Function) — `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx:224`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LiveAdsView` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 90 |
| `loadThumbnails` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 159 |
| `handleCampaignToggle` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 176 |
| `handleAdsetToggle` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 200 |
| `openAdsetCapEditor` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 224 |
| `handleSaveAdsetCap` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 230 |
| `handleClearAdsetCap` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 254 |
| `handleAdToggle` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 274 |
| `openCapEditor` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 298 |
| `handleSaveCap` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 305 |
| `handleClearCap` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 325 |
| `toggleAdset` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 343 |
| `fmtMoney` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 55 |
| `fmtMoneyDec` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 59 |
| `fmtK` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 63 |
| `fmt` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 68 |
| `spendPct` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 69 |
| `progressColor` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 73 |
| `roasColor` | Function | `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx` | 82 |

## How to Explore

1. `gitnexus_context({name: "LiveAdsView"})` — see callers and callees
2. `gitnexus_query({query: "live"})` — find related execution flows
3. Read key files listed above for implementation details
