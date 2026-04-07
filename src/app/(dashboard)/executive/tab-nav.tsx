"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Overview",      href: "/executive",            icon: "◈" },
  { label: "Sales",         href: "/executive/sales",      icon: "💰" },
  { label: "Ad Operations", href: "/executive/ad-ops",     icon: "🎬" },
  { label: "Creatives",     href: "/executive/creatives",  icon: "🎨" },
  { label: "Marketing",     href: "/executive/marketing",  icon: "📊" },
  { label: "People",        href: "/executive/people",     icon: "👥" },
];

export function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-0 -mb-px overflow-x-auto">
      {TABS.map((tab) => {
        const active =
          tab.href === "/executive"
            ? pathname === "/executive"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              active
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="text-xs leading-none">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
