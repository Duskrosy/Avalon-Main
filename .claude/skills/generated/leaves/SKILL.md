---
name: leaves
description: "Skill for the Leaves area of Avalon New. 45 symbols across 20 files."
---

# Leaves

45 symbols | 20 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how cn, Avatar, LeavesView work
- Modifying leaves-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/people/leaves/team-leaves-tab.tsx` | LeaveRow, loadDoc, handleExpand, CreditsModal, getVal (+5) |
| `src/app/(dashboard)/people/leaves/file-leave-tab.tsx` | getBarColor, CreditBar, toDateStr, getMinDate, FileLeaveTab (+1) |
| `src/app/(dashboard)/people/accounts/permissions/permissions-view.tsx` | TierBadge, OverrideToggle, btn, PageGroupSection |
| `src/components/layout/sidebar.tsx` | NavGroupSection, DashboardSection, ProfileStrip |
| `src/app/(dashboard)/people/leaves/leave-history-tab.tsx` | LeaveCard, LeaveHistoryTab, toggleType |
| `src/app/(dashboard)/account/settings/settings-view.tsx` | ProfileTab, AccountSettingsView, switchTab |
| `src/app/(dashboard)/people/leaves/approvals-tab.tsx` | ApprovalCard, act |
| `src/app/api/leaves/route.ts` | POST, PATCH |
| `src/lib/utils.ts` | cn |
| `src/components/ui/avatar.tsx` | Avatar |

## Entry Points

Start here when exploring this area:

- **`cn`** (Function) — `src/lib/utils.ts:3`
- **`Avatar`** (Function) — `src/components/ui/avatar.tsx:20`
- **`LeavesView`** (Function) — `src/app/(dashboard)/people/leaves/leaves-view.tsx:20`
- **`LeaveHistoryTab`** (Function) — `src/app/(dashboard)/people/leaves/leave-history-tab.tsx:224`
- **`toggleType`** (Function) — `src/app/(dashboard)/people/leaves/leave-history-tab.tsx:247`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `cn` | Function | `src/lib/utils.ts` | 3 |
| `Avatar` | Function | `src/components/ui/avatar.tsx` | 20 |
| `LeavesView` | Function | `src/app/(dashboard)/people/leaves/leaves-view.tsx` | 20 |
| `LeaveHistoryTab` | Function | `src/app/(dashboard)/people/leaves/leave-history-tab.tsx` | 224 |
| `toggleType` | Function | `src/app/(dashboard)/people/leaves/leave-history-tab.tsx` | 247 |
| `AccountSettingsView` | Function | `src/app/(dashboard)/account/settings/settings-view.tsx` | 511 |
| `switchTab` | Function | `src/app/(dashboard)/account/settings/settings-view.tsx` | 536 |
| `trackEventServer` | Function | `src/lib/observability/track.ts` | 46 |
| `POST` | Function | `src/app/api/leaves/route.ts` | 60 |
| `PATCH` | Function | `src/app/api/leaves/route.ts` | 144 |
| `POST` | Function | `src/app/api/bookings/route.ts` | 41 |
| `POST` | Function | `src/app/api/sales/volume/route.ts` | 37 |
| `POST` | Function | `src/app/api/learning/complete/route.ts` | 9 |
| `POST` | Function | `src/app/api/ad-ops/requests/route.ts` | 37 |
| `POST` | Function | `src/app/api/ad-ops/deployments/route.ts` | 39 |
| `POST` | Function | `src/app/api/ad-ops/assets/route.ts` | 46 |
| `POST` | Function | `src/app/api/memos/[id]/sign/route.ts` | 6 |
| `FileLeaveTab` | Function | `src/app/(dashboard)/people/leaves/file-leave-tab.tsx` | 213 |
| `handleTypeChange` | Function | `src/app/(dashboard)/people/leaves/file-leave-tab.tsx` | 237 |
| `NavGroupSection` | Function | `src/components/layout/sidebar.tsx` | 75 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `FileLeaveTab → ToDateStr` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 20 calls |
| Confirmed-sales | 8 calls |
| Campaigns | 2 calls |

## How to Explore

1. `gitnexus_context({name: "cn"})` — see callers and callees
2. `gitnexus_query({query: "leaves"})` — find related execution flows
3. Read key files listed above for implementation details
