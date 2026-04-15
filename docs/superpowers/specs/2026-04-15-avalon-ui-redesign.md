# Avalon UI Redesign — Soft Modern Design Spec

**Date**: 2026-04-15
**Status**: Draft
**Scope**: Full app theming, mobile responsive, settings UI, icon overhaul

---

## 1. Goals

- Migrate from hardcoded Tailwind color classes to a semantic CSS custom property system
- Support light, dark, and system-follow themes
- Support 8 user-selectable accent colors, all WCAG AA compliant in both modes
- Support comfortable/compact density toggle
- Full mobile-responsive layout with bottom navigation
- Replace all emoji nav icons with Lucide React SVG icons
- Store all user preferences in Supabase (per-account persistence)
- Achieve a Soft Modern (Linear/Vercel) aesthetic throughout

## 2. Design Decisions

### 2.1 Style: Soft Modern

- Clean surfaces with subtle depth (soft multi-layer shadows)
- Rounded corners: 8px inputs, 12px cards/modals, 20px large feature cards
- Transitions: 150-200ms ease-out on all interactive elements
- No heavy gradients, no decorative animation
- Focus rings: 2px offset, uses accent color

### 2.2 Typography

Keep **Inter** (already loaded via `next/font/google`). Tighten the type scale:

| Role | Size | Weight | Line-height | Tailwind |
|------|------|--------|-------------|----------|
| Page title | 24px | 600 | 1.25 | `text-2xl font-semibold` |
| Section heading | 16px | 600 | 1.4 | `text-base font-semibold` |
| Body | 14px | 400 | 1.5 | `text-sm` |
| Label | 12px | 500 | 1.4 | `text-xs font-medium` |
| Caption | 11px | 400 | 1.4 | `text-[11px]` |

### 2.3 Icons

Replace emoji-based `GROUP_ICONS` in sidebar with **Lucide React** (`lucide-react` package).

| Nav Group | Emoji (current) | Lucide Icon |
|-----------|----------------|-------------|
| people | `👥` | `Users` |
| analytics | `📊` | `BarChart3` |
| knowledgebase | `📚` | `BookOpen` |
| productivity | `✅` | `CheckSquare` |
| scheduling | `📅` | `Calendar` |
| communications | `📢` | `MessageSquare` |
| sales-ops | `💰` | `DollarSign` |
| creatives | `🎨` | `Palette` |
| marketing | `📣` | `Megaphone` |
| ad-ops | `🎬` | `Play` |
| operations | `📦` | `Package` |
| admin | `🔧` | `Settings` |
| executive/dashboard | `🏛️`/`🏠` | `LayoutDashboard` |

All icons: 18px size, 1.5px stroke width, `currentColor` fill.

## 3. Theme System Architecture

### 3.1 CSS Custom Properties

Define all colors as CSS custom properties in `globals.css`. Tailwind CSS 4 supports `@theme` for custom property registration.

```css
@import "tailwindcss";

/* ── Light theme (default) ─────────────────────────── */
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

  /* Accent (default: blue) */
  --color-accent: #2563EB;
  --color-accent-hover: #1D4ED8;
  --color-accent-light: #EFF6FF;
  --color-accent-text: #FFFFFF;

  /* Semantic */
  --color-success: #059669;
  --color-success-light: #ECFDF5;
  --color-warning: #D97706;
  --color-warning-light: #FFFBEB;
  --color-error: #DC2626;
  --color-error-light: #FEF2F2;
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

  /* Density */
  --density-padding-y: 0.5rem;    /* py-2 */
  --density-padding-x: 0.75rem;   /* px-3 */
  --density-gap: 0.75rem;         /* gap-3 */
  --density-text: 0.875rem;       /* text-sm / 14px */
  --density-table-padding: 0.75rem;
}

/* ── Dark theme ────────────────────────────────────── */
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

  /* Accent (default: blue — uses lighter variant in dark) */
  --color-accent: #60A5FA;
  --color-accent-hover: #93C5FD;
  --color-accent-light: rgba(96,165,250,0.12);
  --color-accent-text: #0F172A;

  --color-success: #34D399;
  --color-success-light: rgba(52,211,153,0.12);
  --color-warning: #FBBF24;
  --color-warning-light: rgba(251,191,36,0.12);
  --color-error: #FB7185;
  --color-error-light: rgba(251,113,133,0.12);
  --color-info: #60A5FA;
  --color-info-light: rgba(96,165,250,0.12);

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.3);
  --shadow-lg: 0 4px 6px rgba(0,0,0,0.2), 0 12px 24px rgba(0,0,0,0.4);
}

/* ── Compact density ───────────────────────────────── */
.density-compact {
  --density-padding-y: 0.375rem;   /* py-1.5 */
  --density-padding-x: 0.5rem;     /* px-2 */
  --density-gap: 0.5rem;           /* gap-2 */
  --density-text: 0.75rem;         /* text-xs / 12px */
  --density-table-padding: 0.5rem;
}

/* ── System preference ─────────────────────────────── */
@media (prefers-color-scheme: dark) {
  .theme-system {
    /* Same values as .dark */
  }
}
```

### 3.2 Accent Color Definitions

Each accent overrides `--color-accent-*` variables. Applied as a CSS class on `<html>`.

| Name | Class | Light `--color-accent` | Dark `--color-accent` | `--color-accent-light` (light) | `--color-accent-light` (dark) |
|------|-------|----------------------|---------------------|-------------------------------|------------------------------|
| Blue (default) | `accent-blue` | `#2563EB` | `#60A5FA` | `#EFF6FF` | `rgba(96,165,250,0.12)` |
| Violet | `accent-violet` | `#7C3AED` | `#A78BFA` | `#F5F3FF` | `rgba(167,139,250,0.12)` |
| Teal | `accent-teal` | `#0D9488` | `#2DD4BF` | `#F0FDFA` | `rgba(45,212,191,0.12)` |
| Rose | `accent-rose` | `#E11D48` | `#FB7185` | `#FFF1F2` | `rgba(251,113,133,0.12)` |
| Amber | `accent-amber` | `#D97706` | `#FBBF24` | `#FFFBEB` | `rgba(251,191,36,0.12)` |
| Emerald | `accent-emerald` | `#059669` | `#34D399` | `#ECFDF5` | `rgba(52,211,153,0.12)` |
| Orange | `accent-orange` | `#EA580C` | `#FB923C` | `#FFF7ED` | `rgba(251,146,60,0.12)` |
| Indigo | `accent-indigo` | `#4F46E5` | `#818CF8` | `#EEF2FF` | `rgba(129,140,248,0.12)` |

### 3.3 Theme Provider

A React context provider wrapping the app at `src/components/providers/theme-provider.tsx`:

```
ThemeProvider
├── Reads user preferences from props (server-fetched)
├── Manages state: theme ("light" | "dark" | "system"), accent, density
├── Applies CSS classes to <html>: "dark" | "", accent-{name}, density-compact | ""
├── Listens to system prefers-color-scheme when theme === "system"
├── Exposes setTheme(), setAccent(), setDensity() that:
│   1. Update local state immediately (optimistic)
│   2. Persist to localStorage (instant on reload)
│   3. PATCH /api/users/[id]/preferences (server persistence)
└── Provides useTheme() hook for consuming components
```

**Flash prevention**: On initial page load, a small inline `<script>` in root layout reads `localStorage` and applies the theme class to `<html>` before React hydrates. This prevents the white-flash-then-dark-mode problem.

### 3.4 Database Schema

Add a `user_preferences` JSONB column to the `profiles` table:

```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{}';
```

Shape:
```json
{
  "theme": "light",
  "accent": "blue",
  "density": "comfortable"
}
```

API endpoint: `PATCH /api/users/[id]/preferences` — accepts partial updates, merges into existing JSONB.

## 4. Mobile Responsive Design

### 4.1 Breakpoints

| Name | Width | Behavior |
|------|-------|----------|
| Mobile | < 768px | Bottom nav, single column, stacked layouts |
| Tablet | 768-1023px | Bottom nav, two-column where appropriate |
| Desktop | >= 1024px | Fixed sidebar (256px), full layout |

### 4.2 Navigation: Desktop

Current fixed sidebar (256px) remains unchanged for >= 1024px. The `ml-64` offset stays on desktop.

### 4.3 Navigation: Mobile (< 1024px)

**Bottom tab bar** with 4 persistent tabs + 1 "More" overflow:

| Tab | Icon | Route |
|-----|------|-------|
| Home | `LayoutDashboard` | `/` or `/executive` |
| Notifications | `Bell` (with badge) | Notification sheet |
| Search | `Search` | Global search sheet |
| My Dept | `Briefcase` | User's primary department section |
| More | `Menu` | Full nav drawer (slides up as bottom sheet) |

**"More" bottom sheet**: Contains the full sidebar navigation in a scrollable sheet. Swipe-down to dismiss. Same collapsible groups as desktop sidebar.

**Top bar on mobile**: Slimmer (48px height). Shows "Avalon" logo left, avatar right (taps to settings dropdown).

### 4.4 Layout Adaptations

The dashboard layout wrapper changes based on viewport:

```
Desktop (>= 1024px):
┌──────────┬─────────────────────────────┐
│  Sidebar │  Topbar                     │
│  (fixed) │  Main content (ml-64)       │
│          │                             │
└──────────┴─────────────────────────────┘

Mobile (< 1024px):
┌─────────────────────────────────────────┐
│  Mobile Topbar (48px)                   │
├─────────────────────────────────────────┤
│  Main content (full width, pb-16)       │
│                                         │
├─────────────────────────────────────────┤
│  Bottom Tab Bar (fixed, 64px)           │
└─────────────────────────────────────────┘
```

### 4.5 View-Level Responsive Rules

Each view file gets responsive treatment:

- **Tables**: Show as cards on mobile (< 768px), standard table on tablet+
- **Side-by-side layouts**: Stack vertically on mobile
- **Modals**: Full-screen sheets on mobile, centered modals on desktop
- **Forms**: Full-width inputs on mobile, max-w-xl on desktop
- **Charts**: Simplified on mobile (fewer labels, horizontal bar instead of vertical)
- **Filters/toolbars**: Collapsible into a filter sheet on mobile

### 4.6 Touch Targets

All interactive elements must be >= 44x44px on mobile:
- Nav items, buttons, links, toggles, checkboxes
- Table row actions get an action menu (not inline tiny buttons)

## 5. Settings: Appearance Tab

### 5.1 Location

Add an "Appearance" tab to `/account/settings` alongside "My Profile" and "Security & 2FA".

Tab order: **My Profile** | **Appearance** | **Security & 2FA**

### 5.2 Appearance Tab Contents

```
Appearance
├── Theme
│   ├── Light (radio/card selector with sun icon)
│   ├── Dark (radio/card selector with moon icon)
│   └── System (radio/card selector with monitor icon)
│
├── Accent Color
│   ├── 8 color swatches in a row (circle, 32px)
│   ├── Selected shows checkmark overlay
│   └── Each swatch shows the accent color
│
└── Display Density
    ├── Comfortable (radio/card with preview)
    └── Compact (radio/card with preview)
```

All changes apply **instantly** (no save button needed). Persistence happens in the background via debounced PATCH.

### 5.3 Quick Toggle in Sidebar Profile Strip

The gear dropdown in the sidebar profile strip gets an additional item:

```
┌──────────────────────────┐
│ ⚙ Account Settings       │
│ ✏ Edit my Profile         │
│ ───────────────────────── │
│ 🌙 Dark Mode    [toggle]  │  ← NEW: inline switch
│ ───────────────────────── │
│ 🚪 Sign out               │
└──────────────────────────┘
```

This is a convenience shortcut — toggles between light/dark (skips "system"). Uses the same `setTheme()` from ThemeProvider.

## 6. Color Migration Strategy

### 6.1 Mapping Rules

Every hardcoded Tailwind class maps to a CSS variable via Tailwind's arbitrary value syntax or custom utility classes.

| Current Class | Semantic Token | New Class |
|--------------|----------------|-----------|
| `bg-white` | `--color-bg-primary` | `bg-[var(--color-bg-primary)]` |
| `bg-gray-50` | `--color-bg-secondary` | `bg-[var(--color-bg-secondary)]` |
| `bg-gray-100` | `--color-bg-tertiary` | `bg-[var(--color-bg-tertiary)]` |
| `text-gray-900` | `--color-text-primary` | `text-[var(--color-text-primary)]` |
| `text-gray-500`/`600` | `--color-text-secondary` | `text-[var(--color-text-secondary)]` |
| `text-gray-400` | `--color-text-tertiary` | `text-[var(--color-text-tertiary)]` |
| `border-gray-200` | `--color-border-primary` | `border-[var(--color-border-primary)]` |
| `border-gray-100` | `--color-border-secondary` | `border-[var(--color-border-secondary)]` |
| `bg-blue-600`/`500` | `--color-accent` | `bg-[var(--color-accent)]` |
| `text-blue-600` | `--color-accent` | `text-[var(--color-accent)]` |
| `bg-red-50` | `--color-error-light` | `bg-[var(--color-error-light)]` |
| `text-red-600` | `--color-error` | `text-[var(--color-error)]` |
| `bg-green-50` | `--color-success-light` | `bg-[var(--color-success-light)]` |
| `text-green-600`/`700` | `--color-success` | `text-[var(--color-success)]` |
| `bg-amber-50` | `--color-warning-light` | `bg-[var(--color-warning-light)]` |
| `text-amber-600`/`700`/`800` | `--color-warning` | `text-[var(--color-warning)]` |
| `hover:bg-gray-50` | `--color-surface-hover` | `hover:bg-[var(--color-surface-hover)]` |
| `hover:bg-gray-100` | `--color-surface-active` | `hover:bg-[var(--color-surface-active)]` |

### 6.2 Tailwind CSS 4 Utility Approach

Tailwind CSS 4 natively resolves CSS custom properties in arbitrary values. Use the `var()` syntax directly:

- `bg-[var(--color-bg-primary)]` for backgrounds
- `text-[var(--color-text-primary)]` for text
- `border-[var(--color-border-primary)]` for borders

For frequently used combinations, define shorthand utility classes in `globals.css`:

```css
@utility surface-primary {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}
@utility surface-card {
  background-color: var(--color-surface-card);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-primary);
}
```

This keeps the most common patterns short while individual token overrides use `var()` syntax.

### 6.3 Migration Approach

Batch migration of all 107 view files. Each file:
1. Replace hardcoded color classes with semantic token classes
2. Add responsive classes (mobile-first) where layouts need adaptation
3. Ensure touch targets >= 44px on interactive elements

## 7. New Components Required

| Component | Location | Purpose |
|-----------|----------|---------|
| `ThemeProvider` | `src/components/providers/theme-provider.tsx` | Context for theme/accent/density state |
| `MobileNav` | `src/components/layout/mobile-nav.tsx` | Bottom tab bar + "More" sheet |
| `MobileTopbar` | `src/components/layout/mobile-topbar.tsx` | Slim top bar for mobile |
| `ThemeToggle` | `src/components/ui/theme-toggle.tsx` | Sun/moon toggle switch |
| `AccentPicker` | `src/components/ui/accent-picker.tsx` | Color swatch selector |
| `DensityPicker` | `src/components/ui/density-picker.tsx` | Comfortable/Compact card selector |
| `BottomSheet` | `src/components/ui/bottom-sheet.tsx` | Reusable swipe-to-dismiss sheet for mobile |
| `ResponsiveTable` | `src/components/ui/responsive-table.tsx` | Table on desktop, cards on mobile |

## 8. Files Modified

### Core Infrastructure
- `src/app/globals.css` — CSS custom properties, theme classes, Tailwind theme registration
- `src/app/layout.tsx` — Flash-prevention script, theme class on `<html>`
- `src/app/(dashboard)/layout.tsx` — Responsive shell, conditional sidebar/bottom nav
- `src/components/layout/sidebar.tsx` — Lucide icons, theme tokens, hidden on mobile
- `src/components/layout/topbar.tsx` — Theme tokens, responsive sizing
- `package.json` — Add `lucide-react`

### Settings
- `src/app/(dashboard)/account/settings/settings-view.tsx` — Add Appearance tab
- `src/app/(dashboard)/account/settings/page.tsx` — Pass preferences to view

### API
- `src/app/api/users/[id]/preferences/route.ts` — New endpoint for preference PATCH
- `supabase/migrations/XXXXX_user_preferences.sql` — Add user_preferences column

### All 107 View Files
- Replace hardcoded color classes with semantic tokens
- Add responsive breakpoint classes
- Ensure mobile touch targets

## 9. Migration Order

1. **Foundation**: globals.css tokens, ThemeProvider, flash-prevention script, Lucide install
2. **Shell**: Sidebar (Lucide + tokens), Topbar (tokens), Dashboard layout (responsive wrapper)
3. **Mobile Nav**: MobileNav, MobileTopbar, BottomSheet
4. **Settings**: Appearance tab (theme/accent/density pickers), API endpoint, DB migration
5. **Quick Toggle**: Dark mode switch in sidebar gear dropdown
6. **View Migration**: All 107 files — tokens + responsive (batch by department)
   - People (accounts, permissions, directory, birthdays)
   - Operations (orders, catalog, dispatch, issues, distressed, remittance, courier, inventory)
   - Sales-ops (shopify, fps-daily, tracker, pipeline)
   - Ad-ops (dashboard, library, calendar)
   - Creatives, Marketing, Communications
   - Scheduling, Productivity, Knowledgebase
   - Admin, Executive, Analytics

## 10. Non-Goals (Explicitly Out of Scope)

- Custom theme builder (users pick from 8 preset accents, not arbitrary colors)
- Per-page theme overrides
- Animation/motion preferences (prefers-reduced-motion is respected but not user-togglable)
- PWA/service worker for offline mobile
- Native mobile app wrapper
