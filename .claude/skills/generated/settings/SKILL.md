---
name: settings
description: "Skill for the Settings area of Avalon New. 18 symbols across 2 files."
---

# Settings

18 symbols | 2 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how startBusy, endBusy, api work
- Modifying settings-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | startBusy, endBusy, api, updateGroup, deleteGroup (+11) |
| `src/app/(dashboard)/account/settings/settings-view.tsx` | getCroppedBlob, handleUpload |

## Entry Points

Start here when exploring this area:

- **`startBusy`** (Function) — `src/app/(dashboard)/ad-ops/settings/settings-view.tsx:56`
- **`endBusy`** (Function) — `src/app/(dashboard)/ad-ops/settings/settings-view.tsx:57`
- **`api`** (Function) — `src/app/(dashboard)/ad-ops/settings/settings-view.tsx:59`
- **`updateGroup`** (Function) — `src/app/(dashboard)/ad-ops/settings/settings-view.tsx:98`
- **`deleteGroup`** (Function) — `src/app/(dashboard)/ad-ops/settings/settings-view.tsx:111`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `startBusy` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 56 |
| `endBusy` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 57 |
| `api` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 59 |
| `updateGroup` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 98 |
| `deleteGroup` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 111 |
| `removeAccount` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 164 |
| `moveAccount` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 178 |
| `toggleAccount` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 191 |
| `AccountChip` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 271 |
| `AdOpsSettings` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 46 |
| `isBusy` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 55 |
| `createGroup` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 78 |
| `openAddAccount` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 135 |
| `addAccount` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 142 |
| `startEditGroup` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 208 |
| `saveGroupName` | Function | `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | 213 |
| `getCroppedBlob` | Function | `src/app/(dashboard)/account/settings/settings-view.tsx` | 26 |
| `handleUpload` | Function | `src/app/(dashboard)/account/settings/settings-view.tsx` | 72 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AdOpsSettings → StartBusy` | cross_community | 4 |
| `AdOpsSettings → Api` | cross_community | 4 |
| `AdOpsSettings → EndBusy` | cross_community | 4 |
| `AccountChip → StartBusy` | intra_community | 3 |
| `AccountChip → Api` | intra_community | 3 |
| `AccountChip → EndBusy` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "startBusy"})` — see callers and callees
2. `gitnexus_query({query: "settings"})` — find related execution flows
3. Read key files listed above for implementation details
