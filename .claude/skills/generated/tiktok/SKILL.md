---
name: tiktok
description: "Skill for the Tiktok area of Avalon New. 11 symbols across 5 files."
---

# Tiktok

11 symbols | 5 files | Cohesion: 72%

## When to Use

- Working with code in `src/`
- Understanding how exchangeCodeForTokens, fetchTikTokUserInfo, fetchTikTokVideoList work
- Modifying tiktok-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/tiktok/client.ts` | exchangeCodeForTokens, checkTikTokError, fetchTikTokUserInfo, fetchTikTokVideoList, fetchTikTokVideoStats (+1) |
| `src/app/api/tiktok/callback/route.ts` | contentUrl, GET |
| `src/app/api/smm/social-sync/route.ts` | syncTikTokAccount |
| `src/lib/tiktok/server.ts` | getValidTikTokToken |
| `src/app/api/tiktok/debug/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`exchangeCodeForTokens`** (Function) — `src/lib/tiktok/client.ts:40`
- **`fetchTikTokUserInfo`** (Function) — `src/lib/tiktok/client.ts:125`
- **`fetchTikTokVideoList`** (Function) — `src/lib/tiktok/client.ts:147`
- **`fetchTikTokVideoStats`** (Function) — `src/lib/tiktok/client.ts:180`
- **`GET`** (Function) — `src/app/api/tiktok/callback/route.ts:16`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `exchangeCodeForTokens` | Function | `src/lib/tiktok/client.ts` | 40 |
| `fetchTikTokUserInfo` | Function | `src/lib/tiktok/client.ts` | 125 |
| `fetchTikTokVideoList` | Function | `src/lib/tiktok/client.ts` | 147 |
| `fetchTikTokVideoStats` | Function | `src/lib/tiktok/client.ts` | 180 |
| `GET` | Function | `src/app/api/tiktok/callback/route.ts` | 16 |
| `getValidTikTokToken` | Function | `src/lib/tiktok/server.ts` | 18 |
| `refreshTikTokToken` | Function | `src/lib/tiktok/client.ts` | 64 |
| `GET` | Function | `src/app/api/tiktok/debug/route.ts` | 9 |
| `checkTikTokError` | Function | `src/lib/tiktok/client.ts` | 113 |
| `contentUrl` | Function | `src/app/api/tiktok/callback/route.ts` | 10 |
| `syncTikTokAccount` | Function | `src/app/api/smm/social-sync/route.ts` | 170 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → CheckTikTokError` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 3 calls |
| Campaigns | 2 calls |

## How to Explore

1. `gitnexus_context({name: "exchangeCodeForTokens"})` — see callers and callees
2. `gitnexus_query({query: "tiktok"})` — find related execution flows
3. Read key files listed above for implementation details
