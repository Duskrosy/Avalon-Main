---
name: requests
description: "Skill for the Requests area of Avalon New. 15 symbols across 3 files."
---

# Requests

15 symbols | 3 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how RequestsView, openEdit, updateStatus work
- Modifying requests-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(dashboard)/marketing/requests/requests-view.tsx` | MarketingRequestsView, openEdit, submitRequest, cancelRequest, closeModal (+2) |
| `src/app/(dashboard)/ad-ops/requests/requests-view.tsx` | creativeName, RequestsView, openEdit, updateStatus, handleDelete |
| `src/app/(dashboard)/creatives/requests/requests-view.tsx` | CreativesRequestsView, updateStatus, reassign |

## Entry Points

Start here when exploring this area:

- **`RequestsView`** (Function) — `src/app/(dashboard)/ad-ops/requests/requests-view.tsx:40`
- **`openEdit`** (Function) — `src/app/(dashboard)/ad-ops/requests/requests-view.tsx:73`
- **`updateStatus`** (Function) — `src/app/(dashboard)/ad-ops/requests/requests-view.tsx:113`
- **`handleDelete`** (Function) — `src/app/(dashboard)/ad-ops/requests/requests-view.tsx:122`
- **`MarketingRequestsView`** (Function) — `src/app/(dashboard)/marketing/requests/requests-view.tsx:56`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `RequestsView` | Function | `src/app/(dashboard)/ad-ops/requests/requests-view.tsx` | 40 |
| `openEdit` | Function | `src/app/(dashboard)/ad-ops/requests/requests-view.tsx` | 73 |
| `updateStatus` | Function | `src/app/(dashboard)/ad-ops/requests/requests-view.tsx` | 113 |
| `handleDelete` | Function | `src/app/(dashboard)/ad-ops/requests/requests-view.tsx` | 122 |
| `MarketingRequestsView` | Function | `src/app/(dashboard)/marketing/requests/requests-view.tsx` | 56 |
| `openEdit` | Function | `src/app/(dashboard)/marketing/requests/requests-view.tsx` | 90 |
| `submitRequest` | Function | `src/app/(dashboard)/marketing/requests/requests-view.tsx` | 184 |
| `cancelRequest` | Function | `src/app/(dashboard)/marketing/requests/requests-view.tsx` | 195 |
| `closeModal` | Function | `src/app/(dashboard)/marketing/requests/requests-view.tsx` | 100 |
| `handleSaveDraft` | Function | `src/app/(dashboard)/marketing/requests/requests-view.tsx` | 105 |
| `handleSubmitNow` | Function | `src/app/(dashboard)/marketing/requests/requests-view.tsx` | 136 |
| `CreativesRequestsView` | Function | `src/app/(dashboard)/creatives/requests/requests-view.tsx` | 45 |
| `updateStatus` | Function | `src/app/(dashboard)/creatives/requests/requests-view.tsx` | 73 |
| `reassign` | Function | `src/app/(dashboard)/creatives/requests/requests-view.tsx` | 82 |
| `creativeName` | Function | `src/app/(dashboard)/ad-ops/requests/requests-view.tsx` | 36 |

## How to Explore

1. `gitnexus_context({name: "RequestsView"})` — see callers and callees
2. `gitnexus_query({query: "requests"})` — find related execution flows
3. Read key files listed above for implementation details
