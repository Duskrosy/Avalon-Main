# Avalon UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Avalon from hardcoded light-only styling to a fully themed, mobile-responsive Soft Modern design with per-user accent colors, dark mode, and density preferences.

**Architecture:** CSS custom properties define all colors/shadows/radii on `:root` and `.dark`. A React context `ThemeProvider` reads server-fetched preferences, applies CSS classes to `<html>`, and persists changes via API. Mobile gets a bottom tab bar + slide-up nav sheet, with the sidebar hidden below 1024px.

**Tech Stack:** Next.js 16, Tailwind CSS 4, Supabase (Postgres), Lucide React, React Context API

**Spec:** `docs/superpowers/specs/2026-04-15-avalon-ui-redesign.md`

---

## Phase 1: Foundation

### Task 1: Install lucide-react

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install lucide-react
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('lucide-react')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install lucide-react icon library"
```

---

### Task 2: Database migration for user_preferences

**Files:**
- Create: `supabase/migrations/00050_user_preferences.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- 00050_user_preferences.sql
-- Add user_preferences JSONB column to profiles for theme/accent/density storage

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{}';

COMMENT ON COLUMN profiles.user_preferences IS 'User UI preferences: {theme, accent, density}';
```

- [ ] **Step 2: Update the Profile type**

In `src/types/database.ts`, add `user_preferences` to the `Profile` type:

```typescript
export type UserPreferences = {
  theme?: "light" | "dark" | "system";
  accent?: "blue" | "violet" | "teal" | "rose" | "amber" | "emerald" | "orange" | "indigo";
  density?: "comfortable" | "compact";
};
```

Add to the `Profile` type after the `updated_by` field:

```typescript
  user_preferences: UserPreferences;
```

- [ ] **Step 3: Run migration locally**

```bash
npx supabase db push
```

Or if using remote: apply via Supabase dashboard SQL editor.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00050_user_preferences.sql src/types/database.ts
git commit -m "feat: add user_preferences JSONB column to profiles"
```

---

### Task 3: CSS custom properties and theme tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace globals.css with the full theme token system**

Replace the entire contents of `src/app/globals.css` with:

```css
@import "tailwindcss";

/* ── Light theme (default) ─────────────────────────────────── */
:root {
  /* Surfaces */
  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #F8FAFC;
  --color-bg-tertiary: #F1F5F9;
  --color-surface-card: #FFFFFF;
  --color-surface-hover: #F8FAFC;
  --color-surface-active: #F1F5F9;

  /* Borders */
  --color-border-primary: #E2E8F0;
  --color-border-secondary: #F1F5F9;

  /* Text */
  --color-text-primary: #0F172A;
  --color-text-secondary: #64748B;
  --color-text-tertiary: #94A3B8;
  --color-text-inverted: #FFFFFF;

  /* Accent — default: blue */
  --color-accent: #2563EB;
  --color-accent-hover: #1D4ED8;
  --color-accent-light: #EFF6FF;
  --color-accent-text: #FFFFFF;

  /* Semantic */
  --color-success: #059669;
  --color-success-light: #ECFDF5;
  --color-success-text: #065F46;
  --color-warning: #D97706;
  --color-warning-light: #FFFBEB;
  --color-warning-text: #92400E;
  --color-error: #DC2626;
  --color-error-light: #FEF2F2;
  --color-error-text: #991B1B;
  --color-info: #2563EB;
  --color-info-light: #EFF6FF;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06);
  --shadow-lg: 0 4px 6px rgba(0,0,0,0.04), 0 12px 24px rgba(0,0,0,0.08);

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;
}

/* ── Dark theme ────────────────────────────────────────────── */
.dark {
  --color-bg-primary: #0F1117;
  --color-bg-secondary: #1A1D27;
  --color-bg-tertiary: #242735;
  --color-surface-card: #1E2130;
  --color-surface-hover: #252839;
  --color-surface-active: #2E3248;

  --color-border-primary: #2E3248;
  --color-border-secondary: #252839;

  --color-text-primary: #F1F5F9;
  --color-text-secondary: #94A3B8;
  --color-text-tertiary: #64748B;
  --color-text-inverted: #0F172A;

  --color-accent: #60A5FA;
  --color-accent-hover: #93C5FD;
  --color-accent-light: rgba(96,165,250,0.12);
  --color-accent-text: #0F172A;

  --color-success: #34D399;
  --color-success-light: rgba(52,211,153,0.12);
  --color-success-text: #34D399;
  --color-warning: #FBBF24;
  --color-warning-light: rgba(251,191,36,0.12);
  --color-warning-text: #FBBF24;
  --color-error: #FB7185;
  --color-error-light: rgba(251,113,133,0.12);
  --color-error-text: #FB7185;
  --color-info: #60A5FA;
  --color-info-light: rgba(96,165,250,0.12);

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.3);
  --shadow-lg: 0 4px 6px rgba(0,0,0,0.2), 0 12px 24px rgba(0,0,0,0.4);
}

/* ── Accent overrides ──────────────────────────────────────── */
/* Light mode accents */
.accent-violet  { --color-accent: #7C3AED; --color-accent-hover: #6D28D9; --color-accent-light: #F5F3FF; }
.accent-teal    { --color-accent: #0D9488; --color-accent-hover: #0F766E; --color-accent-light: #F0FDFA; }
.accent-rose    { --color-accent: #E11D48; --color-accent-hover: #BE123C; --color-accent-light: #FFF1F2; }
.accent-amber   { --color-accent: #D97706; --color-accent-hover: #B45309; --color-accent-light: #FFFBEB; }
.accent-emerald { --color-accent: #059669; --color-accent-hover: #047857; --color-accent-light: #ECFDF5; }
.accent-orange  { --color-accent: #EA580C; --color-accent-hover: #C2410C; --color-accent-light: #FFF7ED; }
.accent-indigo  { --color-accent: #4F46E5; --color-accent-hover: #4338CA; --color-accent-light: #EEF2FF; }

/* Dark mode accent overrides */
.dark.accent-violet  { --color-accent: #A78BFA; --color-accent-hover: #C4B5FD; --color-accent-light: rgba(167,139,250,0.12); }
.dark.accent-teal    { --color-accent: #2DD4BF; --color-accent-hover: #5EEAD4; --color-accent-light: rgba(45,212,191,0.12); }
.dark.accent-rose    { --color-accent: #FB7185; --color-accent-hover: #FDA4AF; --color-accent-light: rgba(251,113,133,0.12); }
.dark.accent-amber   { --color-accent: #FBBF24; --color-accent-hover: #FCD34D; --color-accent-light: rgba(251,191,36,0.12); }
.dark.accent-emerald { --color-accent: #34D399; --color-accent-hover: #6EE7B7; --color-accent-light: rgba(52,211,153,0.12); }
.dark.accent-orange  { --color-accent: #FB923C; --color-accent-hover: #FDBA74; --color-accent-light: rgba(251,146,60,0.12); }
.dark.accent-indigo  { --color-accent: #818CF8; --color-accent-hover: #A5B4FC; --color-accent-light: rgba(129,140,248,0.12); }

/* ── Compact density ───────────────────────────────────────── */
.density-compact {
  --density-padding-y: 0.375rem;
  --density-padding-x: 0.5rem;
  --density-gap: 0.5rem;
  --density-text: 0.75rem;
}

/* ── System theme via media query ──────────────────────────── */
@media (prefers-color-scheme: dark) {
  .theme-system {
    --color-bg-primary: #0F1117;
    --color-bg-secondary: #1A1D27;
    --color-bg-tertiary: #242735;
    --color-surface-card: #1E2130;
    --color-surface-hover: #252839;
    --color-surface-active: #2E3248;
    --color-border-primary: #2E3248;
    --color-border-secondary: #252839;
    --color-text-primary: #F1F5F9;
    --color-text-secondary: #94A3B8;
    --color-text-tertiary: #64748B;
    --color-text-inverted: #0F172A;
    --color-accent: #60A5FA;
    --color-accent-hover: #93C5FD;
    --color-accent-light: rgba(96,165,250,0.12);
    --color-accent-text: #0F172A;
    --color-success: #34D399;
    --color-success-light: rgba(52,211,153,0.12);
    --color-success-text: #34D399;
    --color-warning: #FBBF24;
    --color-warning-light: rgba(251,191,36,0.12);
    --color-warning-text: #FBBF24;
    --color-error: #FB7185;
    --color-error-light: rgba(251,113,133,0.12);
    --color-error-text: #FB7185;
    --color-info: #60A5FA;
    --color-info-light: rgba(96,165,250,0.12);
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
    --shadow-md: 0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.3);
    --shadow-lg: 0 4px 6px rgba(0,0,0,0.2), 0 12px 24px rgba(0,0,0,0.4);
  }
}

/* System theme accent overrides follow same pattern */
@media (prefers-color-scheme: dark) {
  .theme-system.accent-violet  { --color-accent: #A78BFA; --color-accent-hover: #C4B5FD; --color-accent-light: rgba(167,139,250,0.12); }
  .theme-system.accent-teal    { --color-accent: #2DD4BF; --color-accent-hover: #5EEAD4; --color-accent-light: rgba(45,212,191,0.12); }
  .theme-system.accent-rose    { --color-accent: #FB7185; --color-accent-hover: #FDA4AF; --color-accent-light: rgba(251,113,133,0.12); }
  .theme-system.accent-amber   { --color-accent: #FBBF24; --color-accent-hover: #FCD34D; --color-accent-light: rgba(251,191,36,0.12); }
  .theme-system.accent-emerald { --color-accent: #34D399; --color-accent-hover: #6EE7B7; --color-accent-light: rgba(52,211,153,0.12); }
  .theme-system.accent-orange  { --color-accent: #FB923C; --color-accent-hover: #FDBA74; --color-accent-light: rgba(251,146,60,0.12); }
  .theme-system.accent-indigo  { --color-accent: #818CF8; --color-accent-hover: #A5B4FC; --color-accent-light: rgba(129,140,248,0.12); }
}

/* ── Global resets ─────────────────────────────────────────── */
body {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

/* Smooth transitions when theme changes */
html.transitioning,
html.transitioning *,
html.transitioning *::before,
html.transitioning *::after {
  transition: background-color 200ms ease, border-color 200ms ease, color 200ms ease, box-shadow 200ms ease !important;
}
```

- [ ] **Step 2: Verify Tailwind still builds**

```bash
npm run build
```

Expected: Build succeeds (CSS custom properties are valid in all Tailwind contexts).

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add CSS custom property theme system with light/dark/accent/density tokens"
```

---

### Task 4: ThemeProvider context and flash-prevention script

**Files:**
- Create: `src/components/providers/theme-provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create ThemeProvider**

Create `src/components/providers/theme-provider.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { UserPreferences } from "@/types/database";

type Theme = "light" | "dark" | "system";
type Accent = "blue" | "violet" | "teal" | "rose" | "amber" | "emerald" | "orange" | "indigo";
type Density = "comfortable" | "compact";

type ThemeContextValue = {
  theme: Theme;
  accent: Accent;
  density: Density;
  resolvedTheme: "light" | "dark"; // actual applied theme after system resolution
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDOM(theme: Theme, accent: Accent, density: Density) {
  const root = document.documentElement;
  const resolved = theme === "system" ? getSystemTheme() : theme;

  // Add transition class briefly
  root.classList.add("transitioning");

  // Theme
  root.classList.remove("dark", "theme-system");
  if (theme === "dark") root.classList.add("dark");
  if (theme === "system") root.classList.add("theme-system");

  // Accent
  const accentClasses = ["accent-violet", "accent-teal", "accent-rose", "accent-amber", "accent-emerald", "accent-orange", "accent-indigo"];
  root.classList.remove(...accentClasses);
  if (accent !== "blue") root.classList.add(`accent-${accent}`);

  // Density
  root.classList.remove("density-compact");
  if (density === "compact") root.classList.add("density-compact");

  // Remove transition class after animation
  setTimeout(() => root.classList.remove("transitioning"), 250);

  return resolved;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistToServer(userId: string, prefs: Partial<UserPreferences>) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    fetch(`/api/users/${userId}/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => {}); // silent fail — localStorage is the backup
  }, 500);
}

export function ThemeProvider({
  children,
  userId,
  initialPreferences,
}: {
  children: React.ReactNode;
  userId: string;
  initialPreferences: UserPreferences;
}) {
  const [theme, setThemeState] = useState<Theme>(initialPreferences.theme ?? "light");
  const [accent, setAccentState] = useState<Accent>(initialPreferences.accent ?? "blue");
  const [density, setDensityState] = useState<Density>(initialPreferences.density ?? "comfortable");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  // Apply on mount and when preferences change
  useEffect(() => {
    const resolved = applyThemeToDOM(theme, accent, density);
    setResolvedTheme(resolved);

    // Persist to localStorage for flash-prevention script
    localStorage.setItem("avalon-theme", JSON.stringify({ theme, accent, density }));
  }, [theme, accent, density]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = applyThemeToDOM(theme, accent, density);
      setResolvedTheme(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, accent, density]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persistToServer(userId, { theme: t, accent, density });
  }, [userId, accent, density]);

  const setAccent = useCallback((a: Accent) => {
    setAccentState(a);
    persistToServer(userId, { theme, accent: a, density });
  }, [userId, theme, density]);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    persistToServer(userId, { theme, accent, density: d });
  }, [userId, theme, accent]);

  return (
    <ThemeContext value={{ theme, accent, density, resolvedTheme, setTheme, setAccent, setDensity }}>
      {children}
    </ThemeContext>
  );
}
```

- [ ] **Step 2: Update root layout with flash-prevention script**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avalon",
  description: "Internal operations platform for Finn Cotton",
};

// Inline script to prevent flash of wrong theme on load
const themeScript = `
(function(){
  try {
    var s = JSON.parse(localStorage.getItem('avalon-theme') || '{}');
    var t = s.theme || 'light';
    var a = s.accent || 'blue';
    var d = s.density || 'comfortable';
    var r = document.documentElement;
    if (t === 'dark') r.classList.add('dark');
    else if (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) r.classList.add('theme-system');
    else if (t === 'system') r.classList.add('theme-system');
    if (a !== 'blue') r.classList.add('accent-' + a);
    if (d === 'compact') r.classList.add('density-compact');
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/providers/theme-provider.tsx src/app/layout.tsx
git commit -m "feat: add ThemeProvider context with flash-prevention script"
```

---

### Task 5: Preferences API endpoint

**Files:**
- Create: `src/app/api/users/[id]/preferences/route.ts`

- [ ] **Step 1: Create the preferences API endpoint**

Create `src/app/api/users/[id]/preferences/route.ts`:

```tsx
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

const VALID_THEMES = ["light", "dark", "system"];
const VALID_ACCENTS = ["blue", "violet", "teal", "rose", "amber", "emerald", "orange", "indigo"];
const VALID_DENSITIES = ["comfortable", "compact"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.id !== id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const update: Record<string, string> = {};

  if (body.theme && VALID_THEMES.includes(body.theme)) update.theme = body.theme;
  if (body.accent && VALID_ACCENTS.includes(body.accent)) update.accent = body.accent;
  if (body.density && VALID_DENSITIES.includes(body.density)) update.density = body.density;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid preferences provided" }, { status: 400 });
  }

  // Merge into existing JSONB
  const { error } = await supabase.rpc("merge_user_preferences", {
    p_user_id: id,
    p_prefs: update,
  });

  // Fallback if RPC doesn't exist yet: direct update
  if (error) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_preferences")
      .eq("id", id)
      .single();

    const existing = (profile?.user_preferences as Record<string, string>) ?? {};
    const merged = { ...existing, ...update };

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ user_preferences: merged })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/users/[id]/preferences/route.ts
git commit -m "feat: add PATCH /api/users/[id]/preferences endpoint"
```

---

## Phase 2: App Shell — Sidebar, Topbar, Layout

### Task 6: Sidebar — Lucide icons + theme tokens

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Rewrite sidebar with Lucide icons and theme tokens**

Replace the entire `src/components/layout/sidebar.tsx` with the version that:
1. Imports Lucide icons instead of using emoji `GROUP_ICONS`
2. Replaces all hardcoded `gray-*`, `white`, etc. with `var(--color-*)` tokens
3. Adds `hidden lg:flex` so it hides on mobile
4. Adds a dark mode quick toggle in the profile strip gear dropdown

Key changes:
- `GROUP_ICONS` becomes a map of `slug → LucideIcon` component references
- All `bg-white` → `bg-[var(--color-bg-primary)]`
- All `text-gray-900` → `text-[var(--color-text-primary)]`
- All `text-gray-500` → `text-[var(--color-text-secondary)]`
- All `text-gray-400` → `text-[var(--color-text-tertiary)]`
- All `border-gray-200` → `border-[var(--color-border-primary)]`
- All `border-gray-100` → `border-[var(--color-border-secondary)]`
- All `bg-gray-100` (active states) → `bg-[var(--color-surface-active)]`
- All `hover:bg-gray-50` → `hover:bg-[var(--color-surface-hover)]`
- The `<aside>` gets `hidden lg:flex` added to existing classes
- Profile strip dropdown gets a dark mode toggle row

Full replacement code:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/providers/theme-provider";
import type { NavGroup } from "@/lib/permissions/nav";
import {
  ChevronDown,
  Settings,
  Users,
  BarChart3,
  BookOpen,
  CheckSquare,
  Calendar,
  MessageSquare,
  DollarSign,
  Palette,
  Megaphone,
  Play,
  Package,
  LayoutDashboard,
  Sun,
  Moon,
  LogOut,
  UserCog,
  Pencil,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Icon map ───────────────────────────────────────────────
const GROUP_ICONS: Record<string, LucideIcon> = {
  people: Users,
  analytics: BarChart3,
  knowledgebase: BookOpen,
  productivity: CheckSquare,
  scheduling: Calendar,
  communications: MessageSquare,
  "sales-ops": DollarSign,
  creatives: Palette,
  marketing: Megaphone,
  "ad-ops": Play,
  operations: Package,
  admin: Settings,
};

// ─── Types ──────────────────────────────────────────────────
type Department = { name: string; slug: string };

type SidebarProps = {
  navigation: NavGroup[];
  userName: string;
  userInitials: string;
  userAvatarUrl?: string | null;
  departmentName: string;
  isOps: boolean;
  departments: Department[];
};

// ─── Helpers ────────────────────────────────────────────────
function activeGroups(navigation: NavGroup[], pathname: string): Set<string> {
  const active = new Set<string>();
  for (const group of navigation) {
    for (const item of group.items) {
      if (pathname === item.route || pathname.startsWith(item.route + "/")) {
        active.add(group.slug);
      }
    }
  }
  return active;
}

// ─── Collapsible nav group ──────────────────────────────────
function NavGroupSection({
  group,
  pathname,
  defaultOpen,
}: {
  group: NavGroup;
  pathname: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const IconComponent = GROUP_ICONS[group.slug];

  useEffect(() => {
    const isActive = group.items.some(
      (item) => pathname === item.route || pathname.startsWith(item.route + "/")
    );
    if (isActive) setOpen(true);
  }, [pathname, group.items]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors",
          open
            ? "text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
        )}
      >
        <div className="flex items-center gap-2.5">
          {IconComponent && <IconComponent size={18} strokeWidth={1.5} className="shrink-0" />}
          <span className="font-medium">{group.name}</span>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-[var(--color-text-tertiary)] transition-transform shrink-0",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-[var(--color-border-secondary)] pl-3">
          {group.items.map((item) => {
            const active = pathname === item.route || pathname.startsWith(item.route + "/");
            return (
              <Link
                key={item.slug}
                href={item.route}
                className={cn(
                  "block px-3 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors",
                  active
                    ? "text-[var(--color-text-primary)] font-medium bg-[var(--color-surface-active)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Executive / Dashboard section ──────────────────────────
const EXEC_TABS = [
  { label: "Overview",      href: "/executive" },
  { label: "Sales",         href: "/executive/sales" },
  { label: "Ad Operations", href: "/executive/ad-ops" },
  { label: "Creatives",     href: "/executive/creatives" },
  { label: "Marketing",     href: "/executive/marketing" },
  { label: "People",        href: "/executive/people" },
];

function DashboardSection({ pathname, isOps }: { pathname: string; isOps: boolean }) {
  const isExecRoute = pathname === "/executive" || pathname.startsWith("/executive/");
  const isHomeRoot = pathname === "/";
  const [open, setOpen] = useState(isExecRoute || isHomeRoot);

  useEffect(() => {
    if (isExecRoute || isHomeRoot) setOpen(true);
  }, [isExecRoute, isHomeRoot]);

  if (!isOps) {
    return (
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors",
          isHomeRoot
            ? "bg-[var(--color-surface-active)] text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
        )}
      >
        <LayoutDashboard size={18} strokeWidth={1.5} />
        Dashboard
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors",
          open
            ? "text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
        )}
      >
        <div className="flex items-center gap-2.5">
          <LayoutDashboard size={18} strokeWidth={1.5} />
          <span className="font-medium">Executive</span>
        </div>
        <ChevronDown
          size={14}
          className={cn("text-[var(--color-text-tertiary)] transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-[var(--color-border-secondary)] pl-3">
          {EXEC_TABS.map((tab) => {
            const active =
              tab.href === "/executive"
                ? pathname === "/executive"
                : pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "block px-3 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors",
                  active
                    ? "text-[var(--color-text-primary)] font-medium bg-[var(--color-surface-active)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Profile strip with gear dropdown ───────────────────────
function ProfileStrip({
  userName,
  userInitials,
  userAvatarUrl,
  departmentName,
}: {
  userName: string;
  userInitials: string;
  userAvatarUrl?: string | null;
  departmentName: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isDark = theme === "dark";

  return (
    <div ref={ref} className="relative shrink-0 border-t border-[var(--color-border-secondary)] px-3 py-3">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-[var(--color-surface-card)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden z-50">
          <Link
            href="/account/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <UserCog size={16} strokeWidth={1.5} />
            <span>Account Settings</span>
          </Link>
          <Link
            href="/account/settings?tab=profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors border-t border-[var(--color-border-secondary)]"
          >
            <Pencil size={16} strokeWidth={1.5} />
            <span>Edit my Profile</span>
          </Link>

          {/* Dark mode quick toggle */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--color-border-secondary)]">
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              {isDark ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />}
              <span>Dark mode</span>
            </div>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                isDark ? "bg-[var(--color-accent)]" : "bg-[var(--color-text-tertiary)]"
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                  isDark ? "translate-x-4.5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-colors border-t border-[var(--color-border-secondary)]"
          >
            <LogOut size={16} strokeWidth={1.5} />
            <span>Sign out</span>
          </button>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <Avatar url={userAvatarUrl} initials={userInitials} size="sm" className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate leading-tight">{userName}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] truncate">{departmentName}</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Account & settings"
          className={cn(
            "p-1.5 rounded-[var(--radius-sm)] transition-colors shrink-0",
            open
              ? "text-[var(--color-text-primary)] bg-[var(--color-surface-active)]"
              : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-active)]"
          )}
        >
          <Settings size={15} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────
export function Sidebar({
  navigation,
  userName,
  userInitials,
  userAvatarUrl,
  departmentName,
  isOps,
  departments,
}: SidebarProps) {
  const pathname = usePathname();
  const active = activeGroups(navigation, pathname);
  const mainNav = navigation.filter((g) => g.slug !== "account");

  return (
    <aside className="w-64 h-screen bg-[var(--color-bg-primary)] border-r border-[var(--color-border-primary)] flex-col fixed left-0 top-0 hidden lg:flex">
      <div className="px-6 py-5 border-b border-[var(--color-border-secondary)] shrink-0">
        <Link href="/" className="text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">
          Avalon
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        <DashboardSection pathname={pathname} isOps={isOps} />
        {mainNav.map((group) => (
          <NavGroupSection
            key={group.slug}
            group={group}
            pathname={pathname}
            defaultOpen={active.has(group.slug)}
          />
        ))}
      </nav>

      <ProfileStrip
        userName={userName}
        userInitials={userInitials}
        userAvatarUrl={userAvatarUrl}
        departmentName={departmentName}
      />
    </aside>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: sidebar with Lucide icons, theme tokens, hidden on mobile"
```

---

### Task 7: Mobile navigation — bottom tab bar + nav sheet

**Files:**
- Create: `src/components/layout/mobile-nav.tsx`

- [ ] **Step 1: Create mobile-nav.tsx**

Create `src/components/layout/mobile-nav.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/permissions/nav";
import {
  LayoutDashboard, Bell, Search, Briefcase, Menu, X, ChevronDown,
  Users, BarChart3, BookOpen, CheckSquare, Calendar, MessageSquare,
  DollarSign, Palette, Megaphone, Play, Package, Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const GROUP_ICONS: Record<string, LucideIcon> = {
  people: Users, analytics: BarChart3, knowledgebase: BookOpen,
  productivity: CheckSquare, scheduling: Calendar, communications: MessageSquare,
  "sales-ops": DollarSign, creatives: Palette, marketing: Megaphone,
  "ad-ops": Play, operations: Package, admin: Settings,
};

type MobileNavProps = {
  navigation: NavGroup[];
  deptSlug: string;
  unreadCount: number;
};

// ─── Nav Sheet (slides up from bottom) ──────────────────────
function NavSheet({
  navigation,
  open,
  onClose,
}: {
  navigation: NavGroup[];
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Close on route change
  useEffect(() => { onClose(); }, [pathname]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 lg:hidden"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden max-h-[80vh] bg-[var(--color-bg-primary)] border-t border-[var(--color-border-primary)] rounded-t-[var(--radius-xl)] shadow-[var(--shadow-lg)] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-secondary)]">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Navigation</span>
          <button onClick={onClose} className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-hover)]">
            <X size={18} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>

        <nav className="py-2 px-3 space-y-0.5">
          {/* Dashboard / Home */}
          <Link
            href="/"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors",
              pathname === "/" || pathname === "/executive"
                ? "bg-[var(--color-surface-active)] text-[var(--color-text-primary)] font-medium"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            )}
          >
            <LayoutDashboard size={18} strokeWidth={1.5} />
            Dashboard
          </Link>

          {navigation.filter(g => g.slug !== "account").map((group) => {
            const Icon = GROUP_ICONS[group.slug];
            const isExpanded = expanded === group.slug;
            const isActive = group.items.some(
              (item) => pathname === item.route || pathname.startsWith(item.route + "/")
            );

            return (
              <div key={group.slug}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : group.slug)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors",
                    isActive || isExpanded
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {Icon && <Icon size={18} strokeWidth={1.5} />}
                    <span className="font-medium">{group.name}</span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={cn("text-[var(--color-text-tertiary)] transition-transform", isExpanded && "rotate-180")}
                  />
                </button>
                {isExpanded && (
                  <div className="ml-8 mt-0.5 space-y-0.5 border-l border-[var(--color-border-secondary)] pl-3">
                    {group.items.map((item) => {
                      const active = pathname === item.route || pathname.startsWith(item.route + "/");
                      return (
                        <Link
                          key={item.slug}
                          href={item.route}
                          className={cn(
                            "block px-3 py-2 rounded-[var(--radius-sm)] text-sm transition-colors",
                            active
                              ? "text-[var(--color-text-primary)] font-medium bg-[var(--color-surface-active)]"
                              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                          )}
                        >
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );
}

// ─── Bottom Tab Bar ─────────────────────────────────────────
export function MobileNav({ navigation, deptSlug, unreadCount }: MobileNavProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Find the user's primary department route
  const deptRoute = deptSlug ? `/${deptSlug}` : "/";

  const tabs = [
    { label: "Home", icon: LayoutDashboard, href: "/", match: (p: string) => p === "/" || p.startsWith("/executive") },
    { label: "Alerts", icon: Bell, href: "/communications/notifications", match: (p: string) => p.startsWith("/communications/notifications"), badge: unreadCount },
    { label: "Search", icon: Search, href: "#search", match: () => false },
    { label: "My Dept", icon: Briefcase, href: deptRoute, match: (p: string) => p.startsWith(deptRoute) && deptRoute !== "/" },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-[var(--color-bg-primary)] border-t border-[var(--color-border-primary)] safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[44px] rounded-[var(--radius-md)] px-2 py-1 transition-colors",
                  active ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
                )}
              >
                <div className="relative">
                  <tab.icon size={22} strokeWidth={1.5} />
                  {tab.badge && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[var(--color-error)] text-white text-[10px] font-semibold">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => setSheetOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[44px] rounded-[var(--radius-md)] px-2 py-1 transition-colors",
              sheetOpen ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
            )}
          >
            <Menu size={22} strokeWidth={1.5} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <NavSheet navigation={navigation} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
```

- [ ] **Step 2: Add slide-up animation to globals.css**

Append to `src/app/globals.css`:

```css
/* ── Mobile nav sheet animation ────────────────────────────── */
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 250ms ease-out;
}

/* Safe area bottom padding for bottom nav */
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/mobile-nav.tsx src/app/globals.css
git commit -m "feat: mobile bottom tab bar + navigation sheet"
```

---

### Task 8: Topbar — theme tokens + mobile topbar

**Files:**
- Modify: `src/components/layout/topbar.tsx`

- [ ] **Step 1: Rewrite topbar with theme tokens and responsive behavior**

Replace `src/components/layout/topbar.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { NotificationDropdown } from "./notification-dropdown";

type TopbarProps = {
  unreadCount: number;
  birthdayBanner: { name: string; daysUntil: number } | null;
  userName?: string;
  userInitials?: string;
  userAvatarUrl?: string | null;
};

export function Topbar({ unreadCount, birthdayBanner, userName, userInitials, userAvatarUrl }: TopbarProps) {
  const [showBanner, setShowBanner] = useState(!!birthdayBanner);

  return (
    <div>
      {showBanner && birthdayBanner && (
        <div className="bg-[var(--color-warning-light)] border-b border-[var(--color-border-primary)] px-4 py-2 flex items-center justify-between">
          <p className="text-sm text-[var(--color-warning-text)]">
            🎂{" "}
            {birthdayBanner.daysUntil === 0
              ? `It's ${birthdayBanner.name}'s birthday today!`
              : birthdayBanner.daysUntil === 1
              ? `${birthdayBanner.name}'s birthday is tomorrow!`
              : `${birthdayBanner.name}'s birthday is in ${birthdayBanner.daysUntil} days!`}
          </p>
          <button
            onClick={() => setShowBanner(false)}
            className="text-[var(--color-warning)] hover:text-[var(--color-warning-text)] text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Desktop topbar */}
      <header className="h-14 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)] items-center justify-between px-6 hidden lg:flex">
        <div />
        <div className="flex items-center gap-4">
          <NotificationDropdown unreadCount={unreadCount} />
        </div>
      </header>

      {/* Mobile topbar */}
      <header className="h-12 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)] flex items-center justify-between px-4 lg:hidden">
        <Link href="/" className="text-base font-semibold text-[var(--color-text-primary)] tracking-tight">
          Avalon
        </Link>
        <div className="flex items-center gap-3">
          <NotificationDropdown unreadCount={unreadCount} />
          {userInitials && (
            <Link href="/account/settings">
              <Avatar url={userAvatarUrl} initials={userInitials} size="sm" />
            </Link>
          )}
        </div>
      </header>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/topbar.tsx
git commit -m "feat: topbar with theme tokens + mobile variant"
```

---

### Task 9: Dashboard layout — responsive shell with ThemeProvider

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Update dashboard layout to wrap in ThemeProvider, add MobileNav, make responsive**

Replace `src/app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, resolveNavigation } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { MfaBanner } from "@/components/layout/mfa-banner";
import { PostHogProvider } from "@/lib/posthog/provider";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { ThemeProvider } from "@/components/providers/theme-provider";
import type { UserPreferences } from "@/types/database";

async function getBirthdayBanner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentUserId: string
) {
  const today = new Date();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, birthday")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("birthday", "is", null);

  if (!profiles) return null;

  let closest: { name: string; daysUntil: number } | null = null;

  for (const p of profiles) {
    if (p.id === currentUserId || !p.birthday) continue;

    const bday = new Date(p.birthday);
    const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());

    if (thisYear < today) {
      thisYear.setFullYear(today.getFullYear() + 1);
    }

    const diffDays = Math.ceil(
      (thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays <= 7 && (!closest || diffDays < closest.daysUntil)) {
      closest = { name: p.first_name, daysUntil: diffDays };
    }
  }

  return closest;
}

async function getUnreadCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  try {
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const userIsOps = isOps(user);
  const userTier = user.role.tier;
  const deptSlug = user.department?.slug ?? "";

  const { data: overrideRows } = await supabase
    .from("nav_page_overrides")
    .select("nav_slug, visible")
    .eq("user_id", user.id);

  const navOverrides: Record<string, boolean> = {};
  for (const row of overrideRows ?? []) {
    navOverrides[row.nav_slug] = row.visible;
  }

  const navigation = resolveNavigation(userTier, deptSlug, navOverrides);

  const [unreadCount, birthdayBanner] = await Promise.all([
    getUnreadCount(supabase, user.id),
    getBirthdayBanner(supabase, user.id),
  ]);

  let departments: { name: string; slug: string }[] = [];
  if (userIsOps) {
    const { data: depts } = await supabase
      .from("departments")
      .select("name, slug")
      .eq("is_active", true)
      .neq("slug", "ops")
      .order("name");
    departments = depts ?? [];
  }

  const userName = `${user.first_name} ${user.last_name}`;
  const userInitials = `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
  const userAvatarUrl = user.avatar_url ?? null;
  const userPreferences = ((user as unknown as Record<string, unknown>).user_preferences ?? {}) as UserPreferences;

  return (
    <PostHogProvider userId={user.id} userEmail={user.email}>
      <ThemeProvider userId={user.id} initialPreferences={userPreferences}>
        <div className="min-h-screen bg-[var(--color-bg-secondary)]">
          <Sidebar
            navigation={navigation}
            userName={userName}
            userInitials={userInitials}
            userAvatarUrl={userAvatarUrl}
            departmentName={user.department?.name ?? ""}
            isOps={userIsOps}
            departments={departments}
          />

          {/* Desktop content area */}
          <div className="lg:ml-64">
            <Topbar
              unreadCount={unreadCount}
              birthdayBanner={birthdayBanner}
              userName={userName}
              userInitials={userInitials}
              userAvatarUrl={userAvatarUrl}
            />
            {userTier <= 2 && <MfaBanner />}
            <main className="p-4 lg:p-6 pb-20 lg:pb-6">{children}</main>
          </div>

          {/* Mobile bottom nav */}
          <MobileNav
            navigation={navigation}
            deptSlug={deptSlug}
            unreadCount={unreadCount}
          />

          <FeedbackWidget />
        </div>
      </ThemeProvider>
    </PostHogProvider>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat: responsive dashboard layout with ThemeProvider + MobileNav"
```

---

## Phase 3: Settings — Appearance Tab

### Task 10: Appearance tab in Account Settings

**Files:**
- Modify: `src/app/(dashboard)/account/settings/settings-view.tsx`
- Modify: `src/app/(dashboard)/account/settings/page.tsx`

- [ ] **Step 1: Update the settings page.tsx to pass user_preferences**

Replace `src/app/(dashboard)/account/settings/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AccountSettingsView } from "./settings-view";
import type { UserPreferences } from "@/types/database";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const u = user as unknown as Record<string, unknown>;

  return (
    <AccountSettingsView
      userId={user.id}
      initialProfile={{
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url ?? null,
        bio: u.bio as string | null ?? null,
        job_title: u.job_title as string | null ?? null,
        fun_fact: u.fun_fact as string | null ?? null,
      }}
      allowPasswordChange={(u.allow_password_change as boolean | null) ?? true}
      requireMfa={(u.require_mfa as boolean | null) ?? true}
      mustChangePassword={(u.must_change_password as boolean | null) ?? false}
      initialPreferences={(u.user_preferences ?? {}) as UserPreferences}
    />
  );
}
```

- [ ] **Step 2: Add Appearance tab to settings-view.tsx**

In `src/app/(dashboard)/account/settings/settings-view.tsx`, add the Appearance tab. This involves:

1. Import `useTheme` from the ThemeProvider
2. Add an `AppearanceTab` component with theme/accent/density selectors
3. Update the tab switcher to include "Appearance"

Add this new component before the `AccountSettingsView` export:

```tsx
// ─── Appearance tab ──────────────────────────────────────────

import { useTheme } from "@/components/providers/theme-provider";
import { Sun, Moon, Monitor, Check } from "lucide-react";

const ACCENTS = [
  { name: "blue",    color: "#2563EB", darkColor: "#60A5FA" },
  { name: "violet",  color: "#7C3AED", darkColor: "#A78BFA" },
  { name: "teal",    color: "#0D9488", darkColor: "#2DD4BF" },
  { name: "rose",    color: "#E11D48", darkColor: "#FB7185" },
  { name: "amber",   color: "#D97706", darkColor: "#FBBF24" },
  { name: "emerald", color: "#059669", darkColor: "#34D399" },
  { name: "orange",  color: "#EA580C", darkColor: "#FB923C" },
  { name: "indigo",  color: "#4F46E5", darkColor: "#818CF8" },
] as const;

function AppearanceTab() {
  const { theme, accent, density, resolvedTheme, setTheme, setAccent, setDensity } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="max-w-xl space-y-8">
      {/* Theme */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Theme</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Choose how Avalon looks to you.</p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Monitor },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-[var(--radius-lg)] border-2 transition-all",
                theme === value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                  : "border-[var(--color-border-primary)] hover:border-[var(--color-text-tertiary)] bg-[var(--color-surface-card)]"
              )}
            >
              <Icon size={20} strokeWidth={1.5} className={theme === value ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"} />
              <span className={cn("text-sm font-medium", theme === value ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]")}>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Accent color */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Accent color</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Personalizes buttons, links, and highlights.</p>
        <div className="flex gap-3 flex-wrap">
          {ACCENTS.map((a) => (
            <button
              key={a.name}
              onClick={() => setAccent(a.name as typeof accent)}
              title={a.name.charAt(0).toUpperCase() + a.name.slice(1)}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all ring-2 ring-offset-2",
                accent === a.name
                  ? "ring-[var(--color-accent)] ring-offset-[var(--color-bg-primary)]"
                  : "ring-transparent ring-offset-transparent hover:ring-[var(--color-border-primary)] hover:ring-offset-[var(--color-bg-primary)]"
              )}
              style={{ backgroundColor: isDark ? a.darkColor : a.color }}
            >
              {accent === a.name && <Check size={14} strokeWidth={2.5} className="text-white" />}
            </button>
          ))}
        </div>
      </section>

      {/* Density */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Display density</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Controls spacing and text size across the app.</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: "comfortable", label: "Comfortable", desc: "More breathing room" },
            { value: "compact", label: "Compact", desc: "Fits more on screen" },
          ] as const).map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setDensity(value)}
              className={cn(
                "flex flex-col items-start gap-1 p-4 rounded-[var(--radius-lg)] border-2 transition-all text-left",
                density === value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                  : "border-[var(--color-border-primary)] hover:border-[var(--color-text-tertiary)] bg-[var(--color-surface-card)]"
              )}
            >
              <span className={cn("text-sm font-medium", density === value ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]")}>{label}</span>
              <span className="text-xs text-[var(--color-text-tertiary)]">{desc}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

Update the tab list and rendering in `AccountSettingsView` to add the third tab:

Change the tab type from `"profile" | "security"` to `"profile" | "appearance" | "security"`.

Add `{ key: "appearance", label: "Appearance" }` to the tabs array between Profile and Security.

Add the rendering case:
```tsx
{tab === "appearance" && <AppearanceTab />}
```

Also add the `initialPreferences` prop to the `AccountSettingsView` type and pass it through.

Migrate all hardcoded colors in settings-view.tsx to use `var(--color-*)` tokens following the same pattern as sidebar.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/account/settings/settings-view.tsx src/app/(dashboard)/account/settings/page.tsx
git commit -m "feat: Appearance tab with theme/accent/density selectors"
```

---

## Phase 4: Shared Component Migration

### Task 11: Migrate shared UI components to theme tokens

**Files:**
- Modify: `src/components/ui/toast.tsx`
- Modify: `src/components/ui/skeleton.tsx`
- Modify: `src/components/ui/empty-state.tsx`
- Modify: `src/components/ui/error-boundary.tsx`
- Modify: `src/components/ui/password-input.tsx`
- Modify: `src/components/ui/avatar.tsx`
- Modify: `src/components/layout/page-shell.tsx`
- Modify: `src/components/layout/mfa-banner.tsx`
- Modify: `src/components/layout/notification-dropdown.tsx`
- Modify: `src/components/feedback/feedback-widget.tsx`

- [ ] **Step 1: Migrate each component**

Apply these token replacements consistently across all files:

| Find | Replace |
|------|---------|
| `bg-white` | `bg-[var(--color-bg-primary)]` |
| `bg-gray-50` | `bg-[var(--color-bg-secondary)]` |
| `bg-gray-100` | `bg-[var(--color-bg-tertiary)]` |
| `bg-gray-200` (skeleton pulse) | `bg-[var(--color-border-primary)]` |
| `text-gray-900` | `text-[var(--color-text-primary)]` |
| `text-gray-800` | `text-[var(--color-text-primary)]` |
| `text-gray-700` | `text-[var(--color-text-primary)]` |
| `text-gray-600` | `text-[var(--color-text-secondary)]` |
| `text-gray-500` | `text-[var(--color-text-secondary)]` |
| `text-gray-400` | `text-[var(--color-text-tertiary)]` |
| `border-gray-200` | `border-[var(--color-border-primary)]` |
| `border-gray-100` | `border-[var(--color-border-secondary)]` |
| `border-gray-50` | `border-[var(--color-border-secondary)]` |
| `bg-green-600` | `bg-[var(--color-success)]` |
| `bg-red-600` | `bg-[var(--color-error)]` |
| `bg-gray-800` (toast info) | `bg-[var(--color-text-primary)]` |
| `bg-red-50` | `bg-[var(--color-error-light)]` |
| `text-red-600` | `text-[var(--color-error)]` |
| `bg-amber-50` | `bg-[var(--color-warning-light)]` |
| `border-amber-200` | `border-[var(--color-border-primary)]` |
| `text-amber-600`/`700`/`800` | `text-[var(--color-warning-text)]` |
| `bg-gray-900` (buttons) | `bg-[var(--color-text-primary)]` |
| `hover:bg-gray-800`/`700` | `hover:bg-[var(--color-text-secondary)]` |
| `hover:bg-gray-100` | `hover:bg-[var(--color-surface-active)]` |
| `hover:bg-gray-50` | `hover:bg-[var(--color-surface-hover)]` |

For `page-shell.tsx` specifically:
```tsx
<h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{title}</h1>
{description && <p className="text-sm text-[var(--color-text-secondary)] mt-1">{description}</p>}
```

For `skeleton.tsx`, replace all `bg-gray-200` with `bg-[var(--color-border-primary)]`, `bg-gray-100` with `bg-[var(--color-bg-tertiary)]`, and `bg-white` with `bg-[var(--color-surface-card)]`, `border-gray-200` with `border-[var(--color-border-primary)]`.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/
git commit -m "feat: migrate shared UI components to theme tokens"
```

---

## Phase 5: View File Migration

Each task in this phase migrates one department's view files. Apply the same color replacement table from Task 11, plus add responsive classes where needed.

### Task 12: Migrate People module views

**Files:**
- Modify: `src/app/(dashboard)/people/accounts/accounts-view.tsx`
- Modify: `src/app/(dashboard)/people/accounts/permissions/permissions-view.tsx`
- Modify: `src/app/(dashboard)/people/directory/directory-view.tsx`
- Modify: `src/app/(dashboard)/people/birthdays/birthdays-view.tsx`
- Modify: `src/app/(dashboard)/people/leaves/leaves-view.tsx`

- [ ] **Step 1: Apply token replacements to all 5 files**

Use the same mapping table from Task 11. Additionally for tables:
- Add `overflow-x-auto` wrapper around `<table>` elements
- On mobile (`<768px`), consider adding `text-xs` for table cells

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/people/
git commit -m "feat: migrate People module views to theme tokens"
```

---

### Task 13: Migrate Operations module views

**Files:**
- Modify: `src/app/(dashboard)/operations/orders/orders-view.tsx`
- Modify: `src/app/(dashboard)/operations/catalog/catalog-view.tsx`
- Modify: `src/app/(dashboard)/operations/dispatch/dispatch-view.tsx`
- Modify: `src/app/(dashboard)/operations/issues/issues-view.tsx`
- Modify: `src/app/(dashboard)/operations/distressed/distressed-view.tsx`
- Modify: `src/app/(dashboard)/operations/remittance/remittance-view.tsx`
- Modify: `src/app/(dashboard)/operations/courier/courier-view.tsx`
- Modify: `src/app/(dashboard)/operations/inventory/inventory-view.tsx`

- [ ] **Step 1: Apply token replacements to all 8 files**

Same mapping table. These are data-heavy views — ensure tables have `overflow-x-auto` wrappers.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/operations/
git commit -m "feat: migrate Operations module views to theme tokens"
```

---

### Task 14: Migrate Sales-Ops module views

**Files:**
- Modify: `src/app/(dashboard)/sales-ops/fps-daily/fps-daily-view.tsx`
- Modify: `src/app/(dashboard)/sales-ops/qa-log/qa-log-view.tsx`
- Modify: `src/app/(dashboard)/sales-ops/downtime-log/downtime-log-view.tsx`
- Modify: `src/app/(dashboard)/sales-ops/incentive-payouts/payouts-view.tsx`
- Modify: `src/app/(dashboard)/sales-ops/consistency/consistency-view.tsx`
- Modify: `src/app/(dashboard)/sales-ops/weekly-agent-report/weekly-report-view.tsx`
- Modify: `src/app/(dashboard)/sales-ops/monthly-summary/monthly-summary-view.tsx`
- Modify: `src/app/(dashboard)/sales-ops/daily-volume/daily-volume-view.tsx`
- Modify: `src/app/(dashboard)/sales-ops/confirmed-sales/confirmed-sales-view.tsx`

- [ ] **Step 1: Apply token replacements to all 9 files**

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/sales-ops/
git commit -m "feat: migrate Sales-Ops module views to theme tokens"
```

---

### Task 15: Migrate Ad-Ops module views

**Files:**
- Modify: `src/app/(dashboard)/ad-ops/requests/requests-view.tsx`
- Modify: `src/app/(dashboard)/ad-ops/library/library-view.tsx`
- Modify: `src/app/(dashboard)/ad-ops/deployments/deployments-view.tsx`
- Modify: `src/app/(dashboard)/ad-ops/performance/performance-view.tsx`
- Modify: `src/app/(dashboard)/ad-ops/live/live-ads-view.tsx`
- Modify: `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx`
- Modify: `src/app/(dashboard)/ad-ops/settings/settings-view.tsx`
- Modify: `src/app/(dashboard)/ad-ops/dashboard/` (page.tsx if it has inline view)

- [ ] **Step 1: Apply token replacements to all files**

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/ad-ops/
git commit -m "feat: migrate Ad-Ops module views to theme tokens"
```

---

### Task 16: Migrate Creatives + Marketing module views

**Files:**
- Modify: `src/app/(dashboard)/creatives/requests/requests-view.tsx`
- Modify: `src/app/(dashboard)/creatives/dashboard/dashboard-view.tsx`
- Modify: `src/app/(dashboard)/creatives/analytics/analytics-view.tsx`
- Modify: `src/app/(dashboard)/creatives/content/content-view.tsx`
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`
- Modify: `src/app/(dashboard)/marketing/requests/requests-view.tsx`
- Modify: `src/app/(dashboard)/marketing/news/news-view.tsx`
- Modify: `src/app/(dashboard)/marketing/competitors/competitors-view.tsx`

- [ ] **Step 1: Apply token replacements to all 8 files**

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/creatives/ src/app/(dashboard)/marketing/
git commit -m "feat: migrate Creatives + Marketing module views to theme tokens"
```

---

### Task 17: Migrate remaining modules (Comms, Scheduling, Productivity, KB, Analytics, Admin, Executive, Team Activity)

**Files:**
- Modify: `src/app/(dashboard)/communications/announcements/announcements-view.tsx`
- Modify: `src/app/(dashboard)/scheduling/rooms/room-booking-view.tsx`
- Modify: `src/app/(dashboard)/productivity/calendar/calendar-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/kops/kops-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/learning/learning-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/memos/memos-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/memos/[id]/memo-detail-view.tsx`
- Modify: `src/app/(dashboard)/analytics/goals/goals-view.tsx`
- Modify: `src/app/(dashboard)/team-activity/team-activity-view.tsx`
- Modify: `src/app/(dashboard)/account/security/security-view.tsx`
- Modify: All page.tsx files with inline hardcoded colors (executive pages, admin pages, operations/page.tsx, sales-ops/page.tsx, dashboard/[dept]/page.tsx, productivity/overview/page.tsx, productivity/kanban/page.tsx, communications/notifications/page.tsx)

- [ ] **Step 1: Apply token replacements to all files**

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/
git commit -m "feat: migrate remaining module views to theme tokens"
```

---

## Phase 6: Final Polish

### Task 18: Migrate auth pages (login) to theme tokens

**Files:**
- Modify: All files in `src/app/(auth)/`

- [ ] **Step 1: Apply token replacements**

The login page should use theme tokens so it respects the user's system preference (via the flash-prevention script reading localStorage).

- [ ] **Step 2: Commit**

```bash
git add src/app/(auth)/
git commit -m "feat: migrate auth pages to theme tokens"
```

---

### Task 19: Final build verification + visual QA

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 2: Start dev server and test**

```bash
npm run dev
```

Test checklist:
- [ ] Light theme loads by default (no flash)
- [ ] Dark mode toggle works from sidebar gear dropdown
- [ ] Dark mode toggle works from Settings > Appearance
- [ ] System theme follows OS preference
- [ ] All 8 accent colors work in both light and dark mode
- [ ] Compact density reduces spacing globally
- [ ] Mobile: bottom nav shows on viewport < 1024px
- [ ] Mobile: sidebar hides on viewport < 1024px
- [ ] Mobile: "More" tab opens full nav sheet
- [ ] Mobile: navigation sheet closes on route change
- [ ] Preferences persist across page refreshes (localStorage)
- [ ] Preferences persist across sign-out/sign-in (server persistence)
- [ ] All Lucide icons render in sidebar (no emoji)
- [ ] No hardcoded gray/white classes visible in dark mode (white boxes, invisible text)

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: visual QA fixes for theme system"
```
