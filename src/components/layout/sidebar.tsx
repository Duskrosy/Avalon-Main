"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
  "ad-ops":       "🎬",
  admin:          "🔧",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Department = { name: string; slug: string };

type SidebarProps = {
  navigation: NavGroup[];
  userName: string;
  userInitials: string;
  departmentName: string;
  isOps: boolean;
  departments: Department[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the slugs of groups that contain the current path */
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

// ─── Collapsible group ────────────────────────────────────────────────────────

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

  // Re-expand if we navigate into this group from outside
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
        <ChevronDown
          className={cn("text-gray-400 transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
          {group.items.map((item) => {
            const active =
              pathname === item.route || pathname.startsWith(item.route + "/");
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

// ─── Dashboard section (special — has dept sub-items for OPS) ────────────────

function DashboardSection({
  pathname,
  isOps,
  departments,
}: {
  pathname: string;
  isOps: boolean;
  departments: Department[];
}) {
  const isDashboardRoot = pathname === "/";
  const isDeptRoute = pathname.startsWith("/dashboard/");
  const isAnyDashboard = isDashboardRoot || isDeptRoute;

  const [open, setOpen] = useState(isAnyDashboard || isOps);

  useEffect(() => {
    if (isAnyDashboard) setOpen(true);
  }, [isAnyDashboard]);

  if (!isOps) {
    return (
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isDashboardRoot
            ? "bg-gray-100 text-gray-900"
            : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
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
          <span className="text-sm">🏠</span>
          <span className="font-medium">Dashboard</span>
        </div>
        <ChevronDown
          className={cn("text-gray-400 transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
          <Link
            href="/"
            className={cn(
              "block px-3 py-1.5 rounded-md text-sm transition-colors",
              isDashboardRoot
                ? "text-gray-900 font-medium bg-gray-100"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            )}
          >
            Overview
          </Link>
          {departments.map((dept) => {
            const href = `/dashboard/${dept.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={dept.slug}
                href={href}
                className={cn(
                  "block px-3 py-1.5 rounded-md text-sm transition-colors",
                  active
                    ? "text-gray-900 font-medium bg-gray-100"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                )}
              >
                {dept.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({
  navigation,
  userName,
  userInitials,
  departmentName,
  isOps,
  departments,
}: SidebarProps) {
  const pathname = usePathname();
  const active = activeGroups(navigation, pathname);

  // Filter out the Account group — Security lives in the bottom profile strip
  const mainNav = navigation.filter((g) => g.slug !== "account");

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0">

      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-100 shrink-0">
        <Link href="/" className="text-lg font-semibold text-gray-900 tracking-tight">
          Avalon
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        <DashboardSection
          pathname={pathname}
          isOps={isOps}
          departments={departments}
        />

        {mainNav.map((group) => (
          <NavGroupSection
            key={group.slug}
            group={group}
            pathname={pathname}
            defaultOpen={active.has(group.slug)}
          />
        ))}
      </nav>

      {/* Profile strip */}
      <div className="shrink-0 border-t border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            <p className="text-xs text-gray-400 truncate">{departmentName}</p>
          </div>
          <Link
            href="/account/security"
            title="Account security"
            className="text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            <ShieldIcon />
          </Link>
        </div>
      </div>
    </aside>
  );
}
