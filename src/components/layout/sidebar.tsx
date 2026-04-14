"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import type { NavGroup } from "@/lib/permissions/nav";

// ─── Icons ───────────────────────────────────────────────────────────────────

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const GROUP_ICONS: Record<string, string> = {
  people:         "👥",
  analytics:      "📊",
  knowledgebase:  "📚",
  productivity:   "✅",
  scheduling:     "📅",
  communications: "📢",
  "sales-ops":    "💰",
  creatives:      "🎨",
  marketing:      "📣",
  "ad-ops":       "🎬",
  operations:     "📦",
  admin:          "🔧",
};

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Collapsible nav group ────────────────────────────────────────────────────

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
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
          open ? "text-gray-900" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm leading-none">{GROUP_ICONS[group.slug] ?? "·"}</span>
          <span className="font-medium">{group.name}</span>
        </div>
        <ChevronDown className={cn("text-gray-400 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
          {group.items.map((item) => {
            const active = pathname === item.route || pathname.startsWith(item.route + "/");
            return (
              <Link
                key={item.slug}
                href={item.route}
                className={cn(
                  "block px-3 py-1.5 rounded-md text-sm transition-colors",
                  active
                    ? "text-gray-900 font-medium bg-gray-100"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
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

// ─── Executive / Dashboard section ───────────────────────────────────────────

const EXEC_TABS = [
  { label: "Overview",      href: "/executive" },
  { label: "Sales",         href: "/executive/sales" },
  { label: "Ad Operations", href: "/executive/ad-ops" },
  { label: "Creatives",     href: "/executive/creatives" },
  { label: "Marketing",     href: "/executive/marketing" },
  { label: "People",        href: "/executive/people" },
];

function DashboardSection({
  pathname,
  isOps,
}: {
  pathname: string;
  isOps: boolean;
}) {
  const isExecRoute = pathname === "/executive" || pathname.startsWith("/executive/");
  const isHomeRoot  = pathname === "/";
  const [open, setOpen] = useState(isExecRoute || isHomeRoot);

  useEffect(() => {
    if (isExecRoute || isHomeRoot) setOpen(true);
  }, [isExecRoute, isHomeRoot]);

  if (!isOps) {
    return (
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isHomeRoot ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
        )}
      >
        <span className="text-sm">🏠</span>
        Dashboard
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
          open ? "text-gray-900" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm">🏛️</span>
          <span className="font-medium">Executive</span>
        </div>
        <ChevronDown className={cn("text-gray-400 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
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
                  "block px-3 py-1.5 rounded-md text-sm transition-colors",
                  active ? "text-gray-900 font-medium bg-gray-100" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
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

// ─── Profile strip with gear dropdown ────────────────────────────────────────

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

  return (
    <div ref={ref} className="relative shrink-0 border-t border-gray-100 px-3 py-3">
      {/* Dropdown — floats above the strip */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
          <Link
            href="/account/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="text-base leading-none">⚙️</span>
            <span>Account Settings</span>
          </Link>
          <Link
            href="/account/settings?tab=profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50"
          >
            <span className="text-base leading-none">✏️</span>
            <span>Edit my Profile</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
          >
            <span className="text-base leading-none">🚪</span>
            <span>Sign out</span>
          </button>
        </div>
      )}

      {/* Strip */}
      <div className="flex items-center gap-2.5">
        <Avatar url={userAvatarUrl} initials={userInitials} size="sm" className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate leading-tight">{userName}</p>
          <p className="text-xs text-gray-400 truncate">{departmentName}</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Account & settings"
          className={cn(
            "p-1.5 rounded-md transition-colors shrink-0",
            open ? "text-gray-700 bg-gray-100" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          )}
        >
          <GearIcon />
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

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
    <aside className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0">
      <div className="px-6 py-5 border-b border-gray-100 shrink-0">
        <Link href="/" className="text-lg font-semibold text-gray-900 tracking-tight">
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
