---
name: accounts
description: "Skill for the Accounts area of Avalon New. 8 symbols across 1 files."
---

# Accounts

8 symbols | 1 files | Cohesion: 93%

## When to Use

- Working with code in `src/`
- Understanding how AccountsView, canEdit, handleForceSignOut work
- Modifying accounts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/people/accounts/accounts-view.tsx` | AccountsView, canEdit, handleForceSignOut, handleDeactivate, handleReactivate (+3) |

## Entry Points

Start here when exploring this area:

- **`AccountsView`** (Function) — `src/app/(dashboard)/people/accounts/accounts-view.tsx:327`
- **`canEdit`** (Function) — `src/app/(dashboard)/people/accounts/accounts-view.tsx:343`
- **`handleForceSignOut`** (Function) — `src/app/(dashboard)/people/accounts/accounts-view.tsx:351`
- **`handleDeactivate`** (Function) — `src/app/(dashboard)/people/accounts/accounts-view.tsx:362`
- **`handleReactivate`** (Function) — `src/app/(dashboard)/people/accounts/accounts-view.tsx:378`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AccountsView` | Function | `src/app/(dashboard)/people/accounts/accounts-view.tsx` | 327 |
| `canEdit` | Function | `src/app/(dashboard)/people/accounts/accounts-view.tsx` | 343 |
| `handleForceSignOut` | Function | `src/app/(dashboard)/people/accounts/accounts-view.tsx` | 351 |
| `handleDeactivate` | Function | `src/app/(dashboard)/people/accounts/accounts-view.tsx` | 362 |
| `handleReactivate` | Function | `src/app/(dashboard)/people/accounts/accounts-view.tsx` | 378 |
| `handlePermanentDelete` | Function | `src/app/(dashboard)/people/accounts/accounts-view.tsx` | 398 |
| `UserModal` | Function | `src/app/(dashboard)/people/accounts/accounts-view.tsx` | 71 |
| `setField` | Function | `src/app/(dashboard)/people/accounts/accounts-view.tsx` | 119 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Leaves | 1 calls |

## How to Explore

1. `gitnexus_context({name: "AccountsView"})` — see callers and callees
2. `gitnexus_query({query: "accounts"})` — find related execution flows
3. Read key files listed above for implementation details
