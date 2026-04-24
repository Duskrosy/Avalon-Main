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
import { AvalonMark } from "@/components/brand/avalon-mark";

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
          <Link
            href="#feedback"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              window.dispatchEvent(new CustomEvent("open-feedback"));
            }}
            className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors border-t border-[var(--color-border-secondary)]"
          >
            <MessageSquare size={16} strokeWidth={1.5} />
            <span>Send Feedback</span>
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
                  "inline-block h-3.5 w-3.5 rounded-full bg-[var(--color-bg-primary)] transition-transform",
                  isDark ? "translate-x-[18px]" : "translate-x-[2px]"
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
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-[var(--color-text-primary)]"
          aria-label="Avalon — Home"
        >
          <AvalonMark size={22} className="text-[var(--color-accent)]" />
          <span
            style={{ fontFamily: "var(--font-serif, 'Cormorant Garamond', serif)" }}
            className="text-xl font-semibold tracking-[0.14em]"
          >
            AVALON
          </span>
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
