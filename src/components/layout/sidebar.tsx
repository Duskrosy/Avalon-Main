"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/permissions/nav";

const GROUP_ICONS: Record<string, string> = {
  people: "👥",
  analytics: "📊",
  knowledgebase: "📚",
  productivity: "✅",
  scheduling: "📅",
  communications: "📢",
  "sales-ops": "💰",
  "ad-ops": "🎬",
  admin: "🔧",
};

type Department = {
  name: string;
  slug: string;
};

type SidebarProps = {
  navigation: NavGroup[];
  userName: string;
  userInitials: string;
  departmentName: string;
  isOps: boolean;
  departments: Department[];
};

export function Sidebar({
  navigation,
  userName,
  userInitials,
  departmentName,
  isOps,
  departments,
}: SidebarProps) {
  const pathname = usePathname();
  const [dashExpanded, setDashExpanded] = useState(true);

  const isDashboardActive =
    pathname === "/" || pathname.startsWith("/dashboard/");

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-gray-100">
        <Link href="/" className="text-xl font-semibold text-gray-900">
          Avalon
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {isOps ? (
          <div className="mb-1">
            <button
              onClick={() => setDashExpanded(!dashExpanded)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm",
                isDashboardActive
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🏠</span>
                Dashboard
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  "transition-transform",
                  dashExpanded && "rotate-180"
                )}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {dashExpanded && (
              <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-200 pl-3">
                <Link
                  href="/"
                  className={cn(
                    "block px-3 py-1.5 rounded-md text-sm",
                    pathname === "/"
                      ? "text-gray-900 font-medium bg-gray-50"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  Overview
                </Link>
                {departments.map((dept) => (
                  <Link
                    key={dept.slug}
                    href={`/dashboard/${dept.slug}`}
                    className={cn(
                      "block px-3 py-1.5 rounded-md text-sm",
                      pathname === `/dashboard/${dept.slug}`
                        ? "text-gray-900 font-medium bg-gray-50"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    {dept.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/"
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1",
              pathname === "/"
                ? "bg-gray-100 text-gray-900 font-medium"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <span className="text-base">🏠</span>
            Dashboard
          </Link>
        )}

        {navigation.map((group) => (
          <div key={group.slug} className="mt-5">
            <p className="px-3 mb-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
              {group.name}
            </p>
            {group.items.map((item) => {
              const href = item.route;
              const active =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={item.slug}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                    active
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <span className="text-base">
                    {GROUP_ICONS[group.slug] || "•"}
                  </span>
                  {item.name}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-medium shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {userName}
            </p>
            <p className="text-xs text-gray-500 truncate">{departmentName}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
