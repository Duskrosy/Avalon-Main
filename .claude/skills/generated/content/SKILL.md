---
name: content
description: "Skill for the Content area of Avalon New. 10 symbols across 2 files."
---

# Content

10 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how SmmSettingsPanel, createGroup, updateGroupTarget work
- Modifying content-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` | SmmSettingsPanel, createGroup, updateGroupTarget, deleteGroup, togglePlatform (+2) |
| `src/app/(dashboard)/creatives/content/content-view.tsx` | fmtK, ContentManager, handleDelete |

## Entry Points

Start here when exploring this area:

- **`SmmSettingsPanel`** (Function) — `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx:27`
- **`createGroup`** (Function) — `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx:72`
- **`updateGroupTarget`** (Function) — `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx:95`
- **`deleteGroup`** (Function) — `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx:104`
- **`togglePlatform`** (Function) — `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx:114`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `SmmSettingsPanel` | Function | `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` | 27 |
| `createGroup` | Function | `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` | 72 |
| `updateGroupTarget` | Function | `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` | 95 |
| `deleteGroup` | Function | `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` | 104 |
| `togglePlatform` | Function | `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` | 114 |
| `connectTikTok` | Function | `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` | 159 |
| `isTikTokConnected` | Function | `src/app/(dashboard)/creatives/content/smm-settings-panel.tsx` | 223 |
| `ContentManager` | Function | `src/app/(dashboard)/creatives/content/content-view.tsx` | 189 |
| `handleDelete` | Function | `src/app/(dashboard)/creatives/content/content-view.tsx` | 335 |
| `fmtK` | Function | `src/app/(dashboard)/creatives/content/content-view.tsx` | 62 |

## How to Explore

1. `gitnexus_context({name: "SmmSettingsPanel"})` — see callers and callees
2. `gitnexus_query({query: "content"})` — find related execution flows
3. Read key files listed above for implementation details
