// Navigation definition for the new permission model.
// Groups and items are shown/hidden based on user tier and department.
// This replaces the old 4-table (master_groups/views/department_views/user_view_overrides) system.

export type NavItem = {
  name: string;
  slug: string;
  route: string;
  // If set, only users in these department slugs (or OPS) can see this item
  departments?: string[];
  // Minimum tier to see this item (lower number = more access)
  minTier?: number;
};

export type NavGroup = {
  name: string;
  slug: string;
  items: NavItem[];
  // If set, only these departments (or OPS) see this entire group
  departments?: string[];
  // Minimum tier to see this group
  minTier?: number;
};

export const NAV_GROUPS: NavGroup[] = [
  {
    name: "People",
    slug: "people",
    items: [
      { name: "Accounts", slug: "accounts", route: "/people/accounts" },
      { name: "Permissions", slug: "permissions", route: "/people/accounts/permissions", minTier: 2 },
      { name: "Leaves & Absences", slug: "leaves", route: "/people/leaves" },
      { name: "Directory", slug: "directory", route: "/people/directory" },
      { name: "Birthdays", slug: "birthdays", route: "/people/birthdays" },
    ],
  },
  {
    name: "Analytics",
    slug: "analytics",
    items: [
      { name: "KPI Dashboard", slug: "kpi-dashboard", route: "/analytics/kpis" },
      { name: "Goals & Deadlines", slug: "goals", route: "/analytics/goals" },
    ],
  },
  {
    name: "Knowledgebase",
    slug: "knowledgebase",
    items: [
      { name: "KOP Library", slug: "kops", route: "/knowledgebase/kops" },
      { name: "Learning Materials", slug: "learning", route: "/knowledgebase/learning" },
      { name: "Memos", slug: "memos", route: "/knowledgebase/memos" },
    ],
  },
  {
    name: "Productivity",
    slug: "productivity",
    items: [
      { name: "Kanban Board", slug: "kanban", route: "/productivity/kanban" },
      { name: "Calendar", slug: "calendar", route: "/productivity/calendar" },
      { name: "Team Activity", slug: "team-activity", route: "/team-activity", minTier: 2 },
    ],
  },
  {
    name: "Scheduling",
    slug: "scheduling",
    items: [
      { name: "Room Booking", slug: "rooms", route: "/scheduling/rooms" },
    ],
  },
  {
    name: "Communications",
    slug: "communications",
    items: [
      { name: "Announcements", slug: "announcements", route: "/communications/announcements" },
      { name: "Notifications", slug: "notifications", route: "/communications/notifications" },
    ],
  },
  {
    name: "Sales Agent",
    slug: "sales-agent",
    departments: ["sales"],
    items: [
      { name: "Chat Sales", slug: "confirmed-sales", route: "/sales-agent/confirmed-sales" },
    ],
  },
  {
    name: "Sales Ops",
    slug: "sales-ops",
    departments: ["sales"],
    minTier: 2,
    items: [
      { name: "Chat Volume", slug: "daily-volume", route: "/sales-ops/daily-volume" },
      { name: "Chat QA", slug: "qa-log", route: "/sales-ops/qa-log" },
      { name: "Chat FPS", slug: "fps-daily", route: "/sales-ops/fps-daily" },
      { name: "Agent Consistency", slug: "consistency", route: "/sales-ops/consistency" },
      { name: "Downtime Log", slug: "downtime-log", route: "/sales-ops/downtime-log" },
      { name: "Incentive Payouts", slug: "incentive-payouts", route: "/sales-ops/incentive-payouts" },
      { name: "Weekly Agent Report", slug: "weekly-report", route: "/sales-ops/weekly-agent-report" },
      { name: "Monthly Summary", slug: "monthly-summary", route: "/sales-ops/monthly-summary" },
      { name: "Shopify Orders", slug: "shopify", route: "/sales-ops/shopify", minTier: 2 },
    ],
  },
  {
    name: "Creatives",
    slug: "creatives",
    departments: ["creatives", "ad-ops", "marketing"],
    items: [
      { name: "Dashboard",      slug: "creatives-dashboard",      route: "/creatives/dashboard" },
      { name: "Planner",        slug: "creatives-tracker",        route: "/creatives/planner" },
      { name: "Tracker",        slug: "creatives-tracker-ledger", route: "/creatives/tracker" },
      { name: "Posted Content", slug: "creatives-posted-content", route: "/creatives/posted-content" },
      { name: "Analytics",      slug: "creatives-analytics",      route: "/creatives/analytics" },
      { name: "Performance",    slug: "creatives-performance",    route: "/creatives/performance" },
      { name: "Settings",       slug: "creatives-settings",       route: "/creatives/settings" },
    ],
  },
  {
    name: "Marketing",
    slug: "marketing",
    departments: ["marketing", "creatives"],
    items: [
      { name: "Competitors", slug: "marketing-competitors", route: "/marketing/competitors" },
      { name: "News Feed",   slug: "marketing-news",        route: "/marketing/news" },
    ],
  },
  {
    name: "Ad Operations",
    slug: "ad-ops",
    departments: ["ad-ops"],
    items: [
      { name: "Live Ads",       slug: "live-ads",       route: "/ad-ops/live" },
      { name: "Dashboard",      slug: "ad-dashboard",   route: "/ad-ops/dashboard" },
      { name: "Live Campaigns", slug: "ad-campaigns",   route: "/ad-ops/campaigns" },
      { name: "Performance",    slug: "ad-performance", route: "/ad-ops/performance" },
      { name: "Settings",       slug: "ad-settings",    route: "/ad-ops/settings", minTier: 1 },
    ],
  },
  {
    name: "Operations",
    slug: "operations",
    departments: ["fulfillment", "inventory", "customer-service", "sales"],
    items: [
      { name: "Catalog",    slug: "ops-catalog",    route: "/operations/catalog" },
      { name: "Inventory",  slug: "ops-inventory",  route: "/operations/inventory" },
      { name: "Orders",     slug: "ops-orders",     route: "/operations/orders" },
      { name: "Dispatch",   slug: "ops-dispatch",   route: "/operations/dispatch" },
      { name: "Issues",     slug: "ops-issues",     route: "/operations/issues" },
      { name: "Distressed", slug: "ops-distressed", route: "/operations/distressed" },
      { name: "Courier",    slug: "ops-courier",    route: "/operations/courier" },
      { name: "Remittance", slug: "ops-remittance", route: "/operations/remittance" },
    ],
  },
  {
    name: "Admin",
    slug: "admin",
    minTier: 1, // OPS only
    items: [
      { name: "Observability", slug: "observability", route: "/admin/observability", minTier: 1 },
      { name: "Calendar Events", slug: "admin-calendar-events", route: "/admin/calendar-events", minTier: 1 },
      { name: "Development", slug: "admin-development", route: "/admin/development", minTier: 1 },
    ],
  },
  {
    // departments: [] means visible to ALL departments (no dept gate)
    name: "Services",
    slug: "services",
    departments: [],
    items: [
      { name: "Request for Creatives", slug: "creatives-requests", route: "/creatives/requests" },
    ],
  },
  {
    name: "Pulse",
    slug: "pulse",
    departments: [],
    items: [
      { name: "Tickets", slug: "pulse-tickets", route: "/pulse/tickets" },
    ],
  },
];

/**
 * Resolves which nav groups and items a user can see.
 *
 * navOverrides (optional) — per-user overrides from the nav_page_overrides table:
 *   slug → true  (Grant)   forces the item visible even if tier/dept gates would hide it
 *   slug → false (Deny)    forces the item hidden even if tier/dept gates would show it
 *   slug absent  (Inherit) applies default tier + dept logic
 *
 * Grant overrides also bypass group-level gates — if an item in a normally
 * dept-restricted group is granted, that group becomes visible just for that item.
 */
export function resolveNavigation(
  userTier: number,
  departmentSlug: string,
  navOverrides: Record<string, boolean> = {}
): NavGroup[] {
  const ops = userTier <= 1;

  return NAV_GROUPS
    .map((group) => {
      const items = group.items.filter((item) => {
        // Explicit deny always wins
        if (navOverrides[item.slug] === false) return false;
        // Explicit grant bypasses all gates
        if (navOverrides[item.slug] === true) return true;
        // Item-level tier gate
        if (item.minTier !== undefined && userTier > item.minTier) return false;
        // Item-level dept gate
        if (item.departments && !ops && !item.departments.includes(departmentSlug)) return false;
        // Group-level tier gate
        if (group.minTier !== undefined && userTier > group.minTier) return false;
        // Group-level dept gate (empty array means visible to all departments)
        if (group.departments && group.departments.length > 0 && !ops && !group.departments.includes(departmentSlug)) return false;
        return true;
      });

      if (items.length === 0) return null;
      return { ...group, items };
    })
    .filter((g): g is NavGroup => g !== null);
}
