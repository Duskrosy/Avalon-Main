---
name: social-sync
description: "Skill for the Social-sync area of Avalon New. 16 symbols across 1 files."
---

# Social-sync

16 symbols | 1 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how POST work
- Modifying social-sync-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/smm/social-sync/route.ts` | isCronRequest, dayAfter, syncFacebook, fetchMetric, syncInstagram (+11) |

## Entry Points

Start here when exploring this area:

- **`POST`** (Function) — `src/app/api/smm/social-sync/route.ts:641`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `POST` | Function | `src/app/api/smm/social-sync/route.ts` | 641 |
| `isCronRequest` | Function | `src/app/api/smm/social-sync/route.ts` | 19 |
| `dayAfter` | Function | `src/app/api/smm/social-sync/route.ts` | 25 |
| `syncFacebook` | Function | `src/app/api/smm/social-sync/route.ts` | 35 |
| `fetchMetric` | Function | `src/app/api/smm/social-sync/route.ts` | 40 |
| `syncInstagram` | Function | `src/app/api/smm/social-sync/route.ts` | 73 |
| `fetchTotalMetric` | Function | `src/app/api/smm/social-sync/route.ts` | 88 |
| `syncYouTube` | Function | `src/app/api/smm/social-sync/route.ts` | 120 |
| `resolveInstagramUserId` | Function | `src/app/api/smm/social-sync/route.ts` | 151 |
| `syncOnePlatform` | Function | `src/app/api/smm/social-sync/route.ts` | 714 |
| `syncPosts` | Function | `src/app/api/smm/social-sync/route.ts` | 186 |
| `fbReach` | Function | `src/app/api/smm/social-sync/route.ts` | 226 |
| `igMediaType` | Function | `src/app/api/smm/social-sync/route.ts` | 302 |
| `igMetric` | Function | `src/app/api/smm/social-sync/route.ts` | 312 |
| `safeInt` | Function | `src/app/api/smm/social-sync/route.ts` | 538 |
| `safeStr` | Function | `src/app/api/smm/social-sync/route.ts` | 547 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Tiktok | 3 calls |
| [id] | 3 calls |
| Campaigns | 1 calls |

## How to Explore

1. `gitnexus_context({name: "POST"})` — see callers and callees
2. `gitnexus_query({query: "social-sync"})` — find related execution flows
3. Read key files listed above for implementation details
