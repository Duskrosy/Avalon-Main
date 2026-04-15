---
name: login
description: "Skill for the Login area of Avalon New. 18 symbols across 8 files."
---

# Login

18 symbols | 8 files | Cohesion: 94%

## When to Use

- Working with code in `src/`
- Understanding how createClient, trackEvent, handleSignOut work
- Modifying login-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/(auth)/login/page.tsx` | LoginInner, goTo, handleLogin, handleMfaVerify, handleDiscord (+2) |
| `src/app/(dashboard)/account/settings/settings-view.tsx` | handleSubmit, DiscordSection, handleLink, handleUnlink |
| `src/app/auth/confirm/page.tsx` | AuthConfirmInner, handleAuth |
| `src/lib/supabase/client.ts` | createClient |
| `src/lib/observability/track.ts` | trackEvent |
| `src/components/layout/topbar.tsx` | handleSignOut |
| `src/components/layout/sidebar.tsx` | handleSignOut |
| `src/components/layout/mfa-banner.tsx` | MfaBanner |

## Entry Points

Start here when exploring this area:

- **`createClient`** (Function) — `src/lib/supabase/client.ts:2`
- **`trackEvent`** (Function) — `src/lib/observability/track.ts:18`
- **`handleSignOut`** (Function) — `src/components/layout/topbar.tsx:15`
- **`MfaBanner`** (Function) — `src/components/layout/mfa-banner.tsx:5`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createClient` | Function | `src/lib/supabase/client.ts` | 2 |
| `trackEvent` | Function | `src/lib/observability/track.ts` | 18 |
| `handleSignOut` | Function | `src/components/layout/topbar.tsx` | 15 |
| `MfaBanner` | Function | `src/components/layout/mfa-banner.tsx` | 5 |
| `handleSignOut` | Function | `src/components/layout/sidebar.tsx` | 242 |
| `AuthConfirmInner` | Function | `src/app/auth/confirm/page.tsx` | 21 |
| `handleAuth` | Function | `src/app/auth/confirm/page.tsx` | 33 |
| `LoginInner` | Function | `src/app/(auth)/login/page.tsx` | 8 |
| `goTo` | Function | `src/app/(auth)/login/page.tsx` | 53 |
| `handleLogin` | Function | `src/app/(auth)/login/page.tsx` | 62 |
| `handleMfaVerify` | Function | `src/app/(auth)/login/page.tsx` | 112 |
| `handleDiscord` | Function | `src/app/(auth)/login/page.tsx` | 151 |
| `handleMagic` | Function | `src/app/(auth)/login/page.tsx` | 164 |
| `handleForceChange` | Function | `src/app/(auth)/login/page.tsx` | 190 |
| `handleSubmit` | Function | `src/app/(dashboard)/account/settings/settings-view.tsx` | 147 |
| `DiscordSection` | Function | `src/app/(dashboard)/account/settings/settings-view.tsx` | 248 |
| `handleLink` | Function | `src/app/(dashboard)/account/settings/settings-view.tsx` | 263 |
| `handleUnlink` | Function | `src/app/(dashboard)/account/settings/settings-view.tsx` | 277 |

## How to Explore

1. `gitnexus_context({name: "createClient"})` — see callers and callees
2. `gitnexus_query({query: "login"})` — find related execution flows
3. Read key files listed above for implementation details
