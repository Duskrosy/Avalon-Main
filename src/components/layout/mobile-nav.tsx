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
  useEffect(() => { if (open) onClose(); }, [pathname]);

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

  const deptRoute = deptSlug ? `/dashboard/${deptSlug}` : "/";

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
                  {tab.badge !== undefined && tab.badge > 0 && (
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
