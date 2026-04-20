"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { label: "Overview",      href: "/executive",            icon: "◈" },
  { label: "Planning",      href: "/executive/planning",   icon: "🗓" },
  { label: "Sales",         href: "/executive/sales",      icon: "💰" },
  { label: "Ad Operations", href: "/executive/ad-ops",     icon: "🎬" },
  { label: "Creatives",     href: "/executive/creatives",  icon: "🎨" },
  { label: "Marketing",     href: "/executive/marketing",  icon: "📊" },
  { label: "People",        href: "/executive/people",     icon: "👥" },
  { label: "Development",   href: "/executive/development", icon: "🛠" },
];

export function TabNav() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const qs           = searchParams.toString();

  return (
    <nav className="flex gap-0 -mb-px overflow-x-auto">
      {TABS.map((tab) => {
        const active =
          tab.href === "/executive"
            ? pathname === "/executive"
            : pathname.startsWith(tab.href);
        const href = qs ? `${tab.href}?${qs}` : tab.href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              active
                ? "border-[var(--color-text-primary)] text-[var(--color-text-primary)]"
                : "border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-primary)]"
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
