# Avalon — Internal Operations Platform

## Overview

**Avalon** is an internal operations management platform built and maintained by **FC International**. It serves as a unified hub for managing people, analytics, sales operations, ad operations, social media management, creatives, marketing, and knowledgebase functions across the organisation.

The platform enforces a 6-tier role system with department-scoped access, Row Level Security (RLS) on every database table, and comprehensive audit logging on all business data writes.

---

## Tech Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 16 (App Router) | Full-stack framework |
| **React** | 19 | UI |
| **TypeScript** | ^5 | Type safety |
| **Tailwind CSS** | v4 (`@import "tailwindcss"`) | Styling |
| **Supabase JS** | ^2 | Database, Auth, Storage |
| **@supabase/ssr** | ^0.9 | Server-side session management |
| **Recharts** | ^3.8.1 | Data visualisation |
| **Zod** | ^3.25 | Runtime input validation |
| **date-fns** | ^4.1 | Date utilities |
| **clsx + tailwind-merge** | latest | Conditional CSS class merging |

---

## Architecture

- **Framework**: Next.js 16 App Router — Server Components, API Route Handlers, Middleware
- **Auth**: Supabase Auth with SSR cookie-based sessions; MFA (TOTP) enforced at login if enrolled
- **Database**: Supabase PostgreSQL — RLS on every table, audit triggers on all business tables
- **Hosting**: Vercel (serverless + edge middleware)
- **Storage**: Supabase Storage — private buckets `kops` and `learning`

### Supabase Client Pattern

| Client | File | Used for |
|--------|------|----------|
| Browser | `src/lib/supabase/client.ts` | Client components (`createClient()`) |
| Server | `src/lib/supabase/server.ts` | Server Components & API routes (`await createClient()`) |
| Admin | `src/lib/supabase/admin.ts` | Service role — bypasses RLS (`createAdminClient()`) — API routes only, never client |

---

## Role System (6 Tiers)

Defined in `src/lib/permissions/get-user.ts`.

| Tier | Slug | Helper |
|------|------|--------|
| 0 | `super_admin` | `isOps()` → true |
| 1 | `ops_admin` | `isOps()` → true |
| 2 | `manager` | `isManagerOrAbove()` → true |
| 3 | `contributor` | Standard staff |
| 4 | `viewer` | Read-only |
| 5 | `auditor` | Audit log access only |

**TypeScript helpers:**
```typescript
isOps(profile)              // tier <= 1
isManagerOrAbove(profile)   // tier <= 2
getUserTier(profile)        // returns 0–5
```

**PostgreSQL RLS helpers** (defined in `00001_foundation.sql`):
```sql
public.is_ops()
public.is_manager_or_above()
public.is_ad_ops_access()   -- creatives + marketing + ad-ops + OPS
public.get_my_tier()
public.get_my_department_id()
```

---

## Department Structure (10 Departments)

Seeded in `00002_people.sql`. Each has a unique `slug` used for nav gating and RLS.

| Slug | Name |
|------|------|
| `ops` | Operations |
| `sales` | Sales |
| `creatives` | Creatives |
| `ad-ops` | Ad Operations |
| `hr` | Human Resources |
| `marketing` | Marketing |
| `fulfillment` | Fulfillment |
| `inventory` | Inventory |
| `marketplaces` | Marketplaces |
| `customer-service` | Customer Service |

---

## Navigation Structure

Defined in `src/lib/permissions/nav.ts`. Sidebar filters groups by user tier and department at runtime.

| Group | Slug | Visible To | Pages (routes) |
|-------|------|------------|----------------|
| **People** | `people` | All (OPS full, others dept-scoped) | Accounts `/people/accounts`, Permissions `/people/accounts/permissions`, Leaves `/people/leaves`, Directory `/people/directory`, Birthdays `/people/birthdays` |
| **Analytics** | `analytics` | All | KPI Dashboard `/analytics/kpis`, Goals `/analytics/goals` |
| **Knowledgebase** | `knowledgebase` | All | KOP Library `/knowledgebase/kops`, Learning `/knowledgebase/learning`, Memos `/knowledgebase/memos` |
| **Productivity** | `productivity` | All | Kanban Board `/productivity/kanban`, Calendar `/productivity/calendar` |
| **Scheduling** | `scheduling` | All | Room Booking `/scheduling/rooms` |
| **Communications** | `communications` | All | Announcements `/communications/announcements`, Notifications `/communications/notifications` |
| **Sales Ops** | `sales-ops` | `sales` dept + OPS | Daily Volume, Confirmed Sales, QA Log, FPS Daily, Downtime Log, Incentive Payouts (+ planned: Consistency, Weekly Report, Monthly Summary) |
| **Creatives** | `creatives` | `creatives` dept + OPS | Dashboard `/creatives/dashboard`, Content `/creatives/content`, Analytics `/creatives/analytics`, Requests `/creatives/requests` |
| **Marketing** | `marketing` | `marketing` + `creatives` + OPS | Competitors `/marketing/competitors`, News Feed `/marketing/news`, Requests `/marketing/requests` |
| **Ad Operations** | `ad-ops` | `ad-ops` dept + OPS | Dashboard `/ad-ops/dashboard`, Live Campaigns, Performance `/ad-ops/performance`, Settings `/ad-ops/settings` (OPS only) |
| **Admin** | `admin` | OPS only (tier ≤ 1) | Observability `/admin/observability` |

---

## Database Schema

### Migration Index

| File | Key Tables |
|------|-----------|
| `00001_foundation.sql` | `departments`, `roles`, `profiles`, `permissions`, `role_permissions`, `user_permission_overrides`, `obs_audit_logs`, `obs_error_logs`, `obs_job_runs`, `obs_alerts`, `obs_app_events`, `feature_flags` |
| `00002_people.sql` | `leaves`, `notifications` (+ dept seed data) |
| `00003_knowledgebase.sql` | `kops`, `kop_versions`, `memos`, `memo_signatures`, `learning_materials`, `learning_completions` |
| `00004_productivity.sql` | `kanban_boards`, `kanban_columns`, `kanban_cards`, `rooms`, `room_bookings`, `announcements` |
| `00005_analytics.sql` | `kpi_definitions`, `kpi_entries`, `goals` |
| `00006_sales.sql` | `sales_daily_volume`, `sales_confirmed_sales`, `sales_qa_log`, `sales_downtime_log`, `sales_consistency`, `sales_incentive_payouts`, `sales_fps_daily` |
| `00007_ad_ops.sql` | `ad_taxonomy_values`, `ad_requests`, `ad_assets`, `ad_asset_versions`, `ad_meta_accounts`, `ad_deployments`, `ad_performance_snapshots`, `ad_meta_sync_runs` |
| `00008_obs_views.sql` | Observability materialised views and alert functions |
| `00009_rls_hardening.sql` | RLS policy audit pass, REVOKE statements |
| `00010_dept_fix.sql` | Department slug corrections |
| `00011_dept_expansion.sql` | Additional department fields |
| `00012_meta_ads.sql` | `meta_campaigns`, `meta_ad_stats` (adds `meta_access_token`, `currency` to `ad_meta_accounts`) |
| `00013_meta_live_data.sql` | Live Meta campaign data tables |
| `00014_account_groups.sql` | `meta_account_groups`, `meta_account_group_members` |
| `00015_smm.sql` | `smm_groups`, `smm_group_platforms`, `smm_posts`, `smm_analytics`, `smm_top_posts` |
| `00016_competitors.sql` | `smm_competitors`, `smm_competitor_accounts`, `smm_competitor_snapshots` |
| `00017_news.sql` | `smm_news_sources` (4 PH sources pre-seeded), `smm_news_items` |
| `00018_creatives_calendar.sql` | `creatives_campaigns`, `user_calendar_settings` |

### Key Table Details

#### Identity & Auth
```
profiles              id (= auth.uid()), email, first_name, last_name, avatar_url,
                      phone, birthday, department_id, role_id, is_active, deleted_at
roles                 id, name, slug, tier (0-5), is_active
permissions           id, action, resource
role_permissions      role_id, permission_id
user_permission_overrides  user_id, permission_id, granted (boolean)
```

#### People
```
leaves                id, user_id, leave_type (vacation|sick|personal|other),
                      start_date, end_date, status (pending|approved|rejected|cancelled),
                      reason, reviewed_by, reviewed_at
notifications         id, user_id, type, title, body, link_url, is_read, created_at
```

#### Knowledgebase
```
kops                  id, department_id, title, description, category, current_version, created_by
kop_versions          id, kop_id, version_number, file_url, file_type, change_notes, uploaded_by
memos                 id, department_id, title, content, created_by
memo_signatures       id, memo_id, user_id, signed_at
learning_materials    id, department_id, title, material_type (video|pdf|presentation|document|link),
                      file_url, external_link, sort_order, created_by
learning_completions  id, user_id, material_id, completed_at
```

#### Productivity
```
kanban_boards   id, department_id, name, created_by
kanban_columns  id, board_id, name, sort_order
kanban_cards    id, column_id, title, description, assigned_to, due_date,
                priority (low|medium|high|urgent), sort_order, created_by
rooms           id, name, capacity, location, is_active
room_bookings   id, room_id, booked_by, title, start_time, end_time, notes
announcements   id, title, content, priority (normal|important|urgent),
                department_id (null = global), expires_at, created_by
```

#### Sales Operations
```
sales_daily_volume      id, agent_id, date, follow_ups, confirmed_total,
                        confirmed_abandoned, confirmed_regular [GENERATED = confirmed_total - abandoned],
                        buffer_approved, buffer_reason, on_leave, excluded_hours
sales_confirmed_sales   id, confirmed_date, hour_range, order_id, agent_id, sale_type,
                        design, quantity, net_value, abandoned_cart, ads_source, payment_mode, status
sales_qa_log            id, agent_id, qa_date, qa_tier (Tier 3|Tier 2|Tier 1|Fail),
                        qa_points, qa_fail, qa_reason, evaluator
                        UNIQUE (agent_id, qa_date)
sales_downtime_log      id, date, agent_id, downtime_type (system|internet|power|tool|other),
                        start_time, end_time, duration_hours, verified
sales_incentive_payouts id, agent_id, period_date, amount,
                        status (draft|approved|paid|disputed), approved_by, paid_at
sales_fps_daily         id, agent_id, date, fps_value
```

#### Ad Operations
```
ad_requests         id, title, brief, requester_id, assignee_id,
                    status (draft|submitted|in_progress|review|approved|rejected|cancelled),
                    target_date, notes
ad_assets           id, request_id, title, asset_type, status, file_url, created_by
ad_asset_versions   id, asset_id, version_number, file_url, change_notes
ad_meta_accounts    id, account_id (Meta), name, meta_access_token, currency, is_active
meta_account_groups id, name, slug
ad_deployments      id, asset_id, platform, status (planned|active|paused|completed|cancelled)
meta_ad_stats       id, account_id, campaign_id, ad_id, metric_date, impressions,
                    clicks, spend, reach, conversions, conversion_value, video_plays,
                    video_plays_25pct, hook_rate, thruplay_rate, ctr, roas
ad_meta_sync_runs   id, status, triggered_by (cron|manual), sync_date, account_results (jsonb)
```

#### SMM & Social
```
smm_groups              id, name, weekly_target, is_active, sort_order
smm_group_platforms     id, group_id, platform (facebook|instagram|tiktok|youtube),
                        page_id, page_name, handle, access_token, is_active
                        UNIQUE (group_id, platform)
smm_posts               id, group_id, platform, post_type (organic|ad|trad_marketing|offline_event),
                        status (idea|draft|scheduled|published|backlog),
                        caption, scheduled_at, published_at, linked_task_id, created_by
smm_analytics           id, platform_id, metric_date, impressions, reach, engagements,
                        follower_count, follower_growth, video_plays, video_plays_3s,
                        avg_play_time_secs,
                        engagement_rate [GENERATED = engagements/reach],
                        hook_rate [GENERATED = video_plays_3s/impressions],
                        data_source (manual|api), last_synced_at
                        UNIQUE (platform_id, metric_date)
smm_top_posts           id, platform_id, post_external_id, post_url, thumbnail_url,
                        caption_preview, post_type, published_at, impressions, reach,
                        engagements, video_plays, avg_play_time_secs, metric_date
                        UNIQUE (platform_id, post_external_id)
```

#### Competitor Tracking
```
smm_competitors            id, name, notes, created_by
smm_competitor_accounts    id, competitor_id, platform, handle, external_id,
                           is_active, last_scraped_at
                           UNIQUE (competitor_id, platform)
smm_competitor_snapshots   id, account_id, snapshot_date, follower_count, post_count,
                           avg_engagement_rate, posting_frequency_week, notes,
                           data_source (auto|manual)
                           UNIQUE (account_id, snapshot_date)
```

#### News / RSS
```
smm_news_sources   id, name, url UNIQUE, category (shoes|height|viral_ph|general), is_active
smm_news_items     id, source_id, title, url UNIQUE, summary, image_url, published_at, fetched_at
```
Pre-seeded sources: Philippine Star, Manila Bulletin, Esquire PH, Rappler.

#### Creatives & Calendar
```
creatives_campaigns      id, week_start DATE UNIQUE (Monday of the week), campaign_name,
                         organic_target, ads_target, notes, created_by
user_calendar_settings   id, user_id UNIQUE, show_tasks, show_leaves, show_rooms,
                         show_birthdays, show_posts (all boolean, default true)
```

#### Observability (all in 00001)
```
obs_audit_logs    id, actor_id, action (INSERT|UPDATE|DELETE), table_name, record_id,
                  old_values (jsonb), new_values (jsonb), created_at
                  APPEND-ONLY — no UPDATE or DELETE grants
obs_error_logs    id, error_type, message, stack_trace, module,
                  severity (low|medium|high|critical), resolved, resolved_by, resolved_at
obs_app_events    id, event_name, category (product|audit|error|performance),
                  actor_id, module, properties (jsonb)
obs_job_runs      id, job_name, status (pending|running|completed|failed),
                  started_at, completed_at, duration_ms, records_processed, error_message
obs_alerts        id, type, severity (info|warning|error|critical), message,
                  acknowledged, acknowledged_by, acknowledged_at
feature_flags     id, name UNIQUE, is_enabled, config (jsonb)
```

---

## API Routes

All routes under `src/app/api/`. Every handler checks auth via `getCurrentUser()`. POST/PATCH/DELETE handlers validate input with Zod.

### Calendar
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/calendar` | GET | Dept-aware multi-source calendar events (tasks, leaves, rooms, birthdays, SMM posts) |
| `/api/calendar/settings` | GET, POST | Per-user calendar visibility settings |

### People
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/users` | GET, POST, PATCH, DELETE | User accounts CRUD |
| `/api/leaves` | GET, POST, PATCH | Leave requests |
| `/api/notifications` | GET, PATCH | Fetch + mark read |

### Productivity
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/kanban/boards` | GET, POST, PATCH, DELETE | Kanban boards |
| `/api/kanban/columns` | GET, POST, PATCH, DELETE | Board columns |
| `/api/kanban/cards` | GET, POST, PATCH, DELETE | Cards |
| `/api/rooms` | GET, POST, PATCH | Rooms |
| `/api/bookings` | GET, POST, PATCH, DELETE | Room bookings |
| `/api/announcements` | GET, POST, PATCH, DELETE | Announcements |

### Knowledgebase
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/kops` | GET, POST, PATCH, DELETE | KOP library |
| `/api/kops/[id]/versions` | GET, POST | KOP version upload |
| `/api/memos` | GET, POST, PATCH | Memos |
| `/api/memos/[id]/sign` | POST | Sign a memo |
| `/api/learning` | GET, POST, PATCH, DELETE | Learning materials |
| `/api/learning/complete` | POST | Mark material complete |

### Analytics
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/kpis` | GET, POST, PATCH | KPI definitions |
| `/api/kpis/entries` | GET, POST, PATCH | KPI data entries |
| `/api/goals` | GET, POST, PATCH, DELETE | Strategic goals |

### Sales Operations
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/sales/volume` | GET, POST, PATCH, DELETE | Daily volume log |
| `/api/sales/confirmed-sales` | GET, POST, PATCH, DELETE | Confirmed sales |
| `/api/sales/qa` | GET, POST, PATCH | QA log |
| `/api/sales/fps` | GET, POST, PATCH | FPS daily |
| `/api/sales/downtime` | GET, POST, PATCH | Downtime log |
| `/api/sales/payouts` | GET, POST, PATCH | Incentive payouts |
| `/api/sales/agents` | GET | Sales agent list |

### Ad Operations
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/ad-ops/requests` | GET, POST, PATCH, DELETE | Creative request workflow |
| `/api/ad-ops/assets` | GET, POST, PATCH, DELETE | Ad assets |
| `/api/ad-ops/deployments` | GET, POST, PATCH | Campaign deployments |
| `/api/ad-ops/taxonomy` | GET, POST, PATCH, DELETE | Taxonomy values |
| `/api/ad-ops/performance` | GET, POST | Performance snapshots |
| `/api/ad-ops/meta-accounts` | GET, POST, PATCH | Meta ad accounts |
| `/api/ad-ops/account-groups` | GET, POST, PATCH, DELETE | Account groups |
| `/api/ad-ops/sync` | POST | Trigger Meta API sync (cron + manual) |

### Creatives
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/creatives/campaigns` | GET, POST, PATCH | Weekly campaign (name, targets) |

### SMM / Social
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/smm/groups` | GET, POST, PATCH, DELETE | SMM groups |
| `/api/smm/platforms` | POST, PATCH, DELETE | Platform accounts per group |
| `/api/smm/posts` | GET, POST, PATCH, DELETE | Social posts |
| `/api/smm/analytics` | GET, POST | Analytics rows (GET = fetch, POST = manual upsert) |
| `/api/smm/top-posts` | GET | Top posts by impressions |
| `/api/smm/social-sync` | POST | Trigger platform sync — Meta Graph API (FB/IG) + YouTube Data API; TikTok manual-only |
| `/api/smm/competitors` | GET, POST, PATCH, DELETE | Competitor CRUD + snapshot upsert |
| `/api/smm/competitors/scrape` | POST | Auto-scrape competitor follower counts (cron + manual) |
| `/api/smm/news` | GET | Paginated news feed with category filter |
| `/api/smm/news/fetch` | POST | Pull RSS feeds and upsert items (cron + manual) |
| `/api/smm/news/sources` | GET, POST, PATCH, DELETE | RSS source management (OPS only write) |

### Observability (Admin)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/obs/audit` | GET | Audit log viewer (OPS only) |
| `/api/obs/errors` | GET, PATCH | Error log + mark resolved |
| `/api/obs/jobs` | GET | Cron job history |
| `/api/obs/alerts` | GET, PATCH | Alerts + acknowledge |
| `/api/obs/usage` | GET | App event analytics |

---

## Cron Jobs

Configured in `vercel.json`. Auth: `Authorization: Bearer $CRON_SECRET` header.

| Route | UTC Schedule | Manila Time | Purpose |
|-------|-------------|-------------|---------|
| `/api/ad-ops/sync` | `0 19 * * *` | 3:00 AM | Sync Meta Ads API (spend, impressions, campaigns) |
| `/api/smm/social-sync` | `0 20 * * *` | 4:00 AM | Sync SMM analytics (FB/IG via Meta Graph, YouTube via Data API) |
| `/api/smm/competitors/scrape` | `0 20 * * *` | 4:00 AM | Scrape competitor follower counts |
| `/api/smm/news/fetch` | `0 22 * * *` | 6:00 AM | Fetch RSS news feeds |

**Note:** Vercel crons require Pro plan or above.

---

## Social Media API Integration

### Facebook & Instagram (Meta Graph API v21.0)

**Token**: `META_ACCESS_TOKEN` env var (global fallback) or per-platform `smm_group_platforms.access_token`.

**Facebook page insights pulled:**
- `page_impressions` — total daily impressions
- `page_impressions_unique` — reach (unique users)
- `page_engaged_users` — engagements
- `fan_count` — total followers

**Instagram business insights pulled:**
- `impressions`, `reach`, `profile_views`
- `followers_count` — total followers

**Competitor scraping via Meta:**
- Facebook: `fan_count` + `posts.summary.total_count`
- Instagram: `followers_count` + `media_count`

**Required token scopes:** `pages_read_engagement`, `instagram_manage_insights`, `ads_read`, `ads_management`, `business_management`, `read_insights`

### YouTube (Data API v3)

**Key**: `YOUTUBE_API_KEY` env var (Google Cloud Console → APIs & Services → Credentials).

**Channel stats pulled (lifetime, not daily):**
- `subscriberCount` → `follower_count`
- `videoCount` → proxy for post count
- `viewCount` → used as `reach` proxy

**Competitor scraping:** Same endpoint — `channels?part=statistics&id={channelId}&key={apiKey}`.

**Note:** Per-day YouTube analytics require YouTube Analytics API (OAuth). Currently only channel-level stats are pulled.

### TikTok

**Status:** Manual entry only. Auto-sync requires TikTok Business API approval (2–4 week review process).

**Competitor scraping:** Best-effort HTML scrape of `tiktok.com/@{handle}` — parses `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON. Fragile; fails silently.

**To enable TikTok auto-sync:**
1. Apply at developers.tiktok.com (Business API, `tiktok.analytics.read` scope)
2. Complete OAuth flow to get `access_token` + `refresh_token`
3. Store token in `smm_group_platforms.access_token` for the TikTok row

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-only, never expose) |
| `META_ACCESS_TOKEN` | Ads/SMM | System-level Meta Graph API token |
| `META_BUSINESS_ID` | Ads | Meta Business Manager ID |
| `META_APP_ID` | Ads | Meta App ID |
| `META_APP_SECRET` | Ads | Meta App Secret |
| `YOUTUBE_API_KEY` | SMM/Competitors | Google Cloud YouTube Data API v3 key |
| `CRON_SECRET` | Crons | Bearer token to authenticate Vercel cron requests |

---

## Security

### Rate Limiting (Middleware — `middleware.ts`)

- **Pages**: 200 requests/minute per IP
- **API routes**: 60 requests/minute per IP
- **Window**: 60 seconds, sliding
- **Implementation**: In-memory `Map` per Vercel worker instance
- **Response on limit**: HTTP 429 with `Retry-After: 60`
- **Note**: For multi-region production, replace with Upstash Redis for cross-instance coordination

### Content Security Policy (set in `middleware.ts` per-request)

```
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
img-src 'self' blob: data: https:
font-src 'self'
connect-src 'self' https://{supabaseHost} wss://{supabaseHost}
frame-src 'none'
object-src 'none'
base-uri 'self'
form-action 'self'
```

### Static Security Headers (`next.config.ts`)

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-DNS-Prefetch-Control` | `on` |

### Authentication

- **Method**: Supabase Auth, email + password
- **Sessions**: Stored in HTTP-only cookies via `@supabase/ssr`
- **Middleware**: Verifies session on every non-static request; unauthenticated → redirect to `/login`; API routes → 401
- **MFA**: TOTP (time-based one-time password) via Supabase — enforced at login if the user has an enrolled TOTP factor. Login page detects AAL2 requirement, creates a challenge, and prompts for 6-digit code before completing session

### Row Level Security

Every table has RLS enabled. Policies use PostgreSQL helper functions:

```sql
-- Global read/write for OPS
USING (public.is_ops())

-- Department-scoped for managers+
USING (public.is_manager_or_above() AND department_id = public.get_my_department_id())

-- Own records only
USING (user_id = auth.uid())

-- SMM access (creatives + marketing + ad-ops + OPS)
USING (public.is_ad_ops_access())
```

### Audit Logging

- `audit_log_trigger()` fires `AFTER INSERT OR UPDATE OR DELETE` on all business tables
- Writes to `obs_audit_logs` (append-only — no UPDATE or DELETE policies granted)
- Captures: actor_id, action, table_name, record_id, old_values (jsonb), new_values (jsonb)

### Input Validation

All POST/PATCH/DELETE API handlers validate request bodies with Zod before processing. Pattern:

```typescript
const parsed = schema.safeParse(await req.json().catch(() => ({})))
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
}
```

---

## Key Patterns

### Permission Check in API Route

```typescript
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions"

const supabase = await createClient()
const user = await getCurrentUser(supabase)
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
if (!isManagerOrAbove(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
```

### Cron Auth (Dual-path)

```typescript
function isCronRequest(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
}

// In handler:
const fromCron = isCronRequest(req)
if (!fromCron) {
  // Fall back to session auth
  const user = await getCurrentUser(supabase)
  if (!user || !isOps(user)) return 401
}
// Use createAdminClient() for writes (bypasses RLS)
```

### Observability Tracking

```typescript
import { trackEventServer } from "@/lib/observability/track"

trackEventServer(supabase, userId, "event.name", {
  module: "module-name",
  properties: { key: "value" }
})
// Fire-and-forget — never awaited, never throws
```

---

## Modules Detail

### People Management
- **Accounts**: Full CRUD, OPS sees all users, managers see own dept. Soft-delete via `deleted_at`.
- **Permissions**: Assign roles via `role_id` on profile; per-user overrides via `user_permission_overrides`.
- **Leaves**: Submit → manager approves/rejects → notification sent. Cancel only while pending.
- **Directory**: Search by name/dept. OPS sees all, others see active staff.
- **Birthdays**: Grouped today / this week / this month.

### Knowledgebase
- **KOPs**: Version-controlled procedures stored in Supabase Storage (`kops` bucket). Inline PDF/Word/Video viewer.
- **Learning Materials**: Progress tracked per user (`learning_completions`). Types: video (HTML5), PDF (iframe), Word (Google Docs viewer), link.
- **Memos**: Sign-off tracking with progress bar showing % signed.

### Productivity
- **Kanban**: Board/List toggle. Dept-filtered boards. OPS gets dept selector. Cards have priority, due date, assignee.
- **Calendar**: Dept-aware multi-source. All depts: own tasks (purple), leaves (orange), rooms (blue), birthdays (pink). Creatives/Marketing/Ad-Ops: additionally SMM post chips (platform-coloured). OPS: all depts + dept filter. Per-user event-type toggles saved to `user_calendar_settings`.
- **Room Booking**: Exclusion constraint prevents double-booking.

### Sales Operations
**Critical business rules:**
- `confirmed_regular` = `confirmed_total − confirmed_abandoned` (generated column, never calculated in code)
- QA: missing QA entry = neutral (not fail); only `qa_tier = 'Fail'` counts as failure
- FPS: leave days and no-data days are **excluded** from score (not zero)
- Incentive payouts: 3 stacked layers (Main, Abandoned, Onhand) — always show all 3
- Cross-month payouts: eligibility determined by confirmation month, delivery by payout month

### Ad Operations
- **Request workflow**: draft → submitted → in_progress → review → approved/rejected/cancelled
- **Fulfillment**: Creatives team sees `/creatives/requests` (assignee view with Accept/Review/Approve transitions)
- **Requester view**: Marketing team submits via `/marketing/requests`
- **Meta Sync**: Pulls account-level spend/impressions daily. Per-account token overrides global `META_ACCESS_TOKEN`.
- **Performance page**: Account group tabs filter by `meta_account_groups`.
- **Dashboard**: Yesterday's performance summary (total spend/impressions/ROAS/conversions, top campaign by ROAS and spend).
- **Currency**: `ad_meta_accounts.currency` flows through to all spend displays. `currencySymbol()` maps USD/PHP/EUR/GBP/SGD/AUD.

### Creatives Dashboard
- **Andromeda Creatives card**: Manager sets weekly campaign name + organic/ad targets. Shows progress bars (organic vs ad post counts vs targets) + Mon–Sun stacked bar chart (green = organic, indigo = ad).
- **Stats row**: Pending tasks, team avatar stack, requests in review count.
- **No redirect buttons** — all stats inline.

### Social Media Management (SMM)
- **SMM Groups**: Named page groups (e.g. "Local", "International"). Each group has platform accounts.
- **Content Manager**: Group tabs → platform sub-tabs → status filters (idea/draft/scheduled/published/backlog). Post type: organic / ad / trad_marketing / offline_event. ⚙ Groups button manages groups/platforms inline.
- **Analytics**: Defaults to auto-sync. If no data: Sync Now button triggers API. If API unavailable: amber banner auto-opens manual entry modal. Charts: Impressions & Reach (line), Engagement Rate (bar), Video Plays + Hook Rate (dual-axis), Follower Count (line). Data source badge: Auto (green) / Manual (amber) / Mixed (blue).
- **Auto-sync status by platform**:
  - Facebook ✅ (Meta Graph API, requires page token)
  - Instagram ✅ (Meta Graph API, requires page token)
  - YouTube ✅ (YouTube Data API v3, requires `YOUTUBE_API_KEY` — channel stats only, not per-day analytics)
  - TikTok ❌ (manual only — awaiting Business API approval)

### Competitor Tracker
- Per competitor: 4-platform grid. Each cell shows follower count, post count, engagement rate, posting frequency.
- Manual fill modal per platform per day.
- Auto-scrape via `/api/smm/competitors/scrape` (daily cron):
  - Facebook/Instagram: Meta Graph API
  - YouTube: YouTube Data API
  - TikTok: best-effort HTML scrape (fragile)

### News Feed
- RSS sources managed by OPS (4 PH sources pre-seeded).
- Categories: `viral_ph`, `shoes`, `height`, `general`.
- Daily fetch at 6AM Manila. Manual refresh button in UI.
- XML parser built in-route (no external RSS library). 8s timeout per feed. Dedup by URL.

### Observability (Admin)
- OPS-only dashboard at `/admin/observability`.
- **Tabs**: Usage (app events, active users), Errors (severity, resolve tracking), Audit (who changed what, filterable), Alerts (acknowledge), Jobs (cron run history).

---

## Deployment Guide

### Prerequisites
1. Vercel account (Pro plan for cron jobs)
2. Supabase project
3. GitHub repository connected to Vercel

### Supabase Setup
1. Create project → note URL and keys
2. Enable Auth → Email/Password provider
3. Enable MFA → TOTP in Auth settings
4. Create Storage buckets: `kops` (private), `learning` (private)
5. Apply migrations in order: `00001` → `00018` via Supabase SQL editor or CLI

### Vercel Setup
1. Connect GitHub repo → Vercel
2. Add environment variables (see table above)
3. Deploy → Vercel auto-builds on push to `main`
4. Verify cron jobs in Vercel dashboard → Cron Jobs tab

### Testing Cron Jobs Manually
```bash
curl -X POST https://your-app.vercel.app/api/smm/news/fetch \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

curl -X POST https://your-app.vercel.app/api/ad-ops/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Running Locally
```bash
cp .env.example .env.local   # fill in all vars
npm install
npm run dev                  # Turbopack dev server
```

---

## Migration Run Order

Run in Supabase SQL Editor in this exact order:

```
00001_foundation.sql
00002_people.sql
00003_knowledgebase.sql
00004_productivity.sql
00005_analytics.sql
00006_sales.sql
00007_ad_ops.sql
00008_obs_views.sql
00009_rls_hardening.sql
00010_dept_fix.sql
00011_dept_expansion.sql
00012_meta_ads.sql
00013_meta_live_data.sql
00014_account_groups.sql
00015_smm.sql
00016_competitors.sql
00017_news.sql
00018_creatives_calendar.sql
```

---

## What's Not Yet Built (Known Gaps)

| Feature | Status | Notes |
|---------|--------|-------|
| Sales Consistency Tracker | Planned | Table exists, UI not built |
| Sales Weekly Agent Report | Planned | Table exists, UI not built |
| Sales Monthly Summary | Planned | Aggregation logic exists in `scoring.ts` |
| TikTok SMM auto-sync | Blocked | Awaiting TikTok Business API approval (2–4 weeks) |
| YouTube per-day analytics | Partial | Requires YouTube Analytics API + OAuth (channel stats work, daily breakdowns don't) |
| Calendar Settings — OPS cross-dept rules | Partial | Per-user toggles built; OPS global overrides not implemented |
| Competitor auto-scrape — TikTok | Partial | Best-effort HTML scrape, unreliable |

---

**Document version**: 1.0
**Last updated**: April 2026
**Maintained by**: FC International Engineering
**Repository**: github.com/Duskrosy/Avalon-Main
