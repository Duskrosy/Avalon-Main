# Avalon

Internal operations platform for Finn Cotton. Built with Next.js 16, Supabase, and Tailwind v4.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Auth, Database, Storage)
- **Vercel** (deployment)

## Local Development

1. Clone the repo
2. Get Supabase credentials from the project owner
3. Create `.env.local` with the three variables below
4. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local` — never commit this file:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Database

Migrations live in `supabase/migrations/`. Apply them in order via the Supabase dashboard or CLI.

## Project Structure

```
src/
├── app/
│   ├── (auth)/         # Login
│   ├── (dashboard)/    # All authenticated pages
│   └── api/            # API routes
├── components/
│   └── layout/         # Sidebar, Topbar
├── lib/
│   ├── supabase/       # Browser, server, and admin clients
│   ├── permissions/    # Auth helpers and nav resolution
│   └── sales/          # Sales scoring engine (pure functions)
└── types/
    └── database.ts     # All table types
```

## Departments

Operations · Sales · Creatives · Ad Operations · HR · Marketing · Fulfillment · Inventory · Marketplaces · Customer Service

## Roles

| Tier | Name | Access |
|------|------|--------|
| 0 | Super Admin | Unrestricted |
| 1 | OPS Admin | Full operational access |
| 2 | Manager | Department-level management |
| 3 | Contributor | Standard staff |
| 4 | Viewer | Read-only |
| 5 | Auditor | Audit logs only |
