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
    name: "Sales Ops",
    slug: "sales-ops",
    departments: ["sales"],
    items: [
      { name: "Daily Volume", slug: "daily-volume", route: "/sales-ops/daily-volume" },
      { name: "Confirmed Sales", slug: "confirmed-sales", route: "/sales-ops/confirmed-sales" },
      { name: "QA Log", slug: "qa-log", route: "/sales-ops/qa-log" },
      { name: "FPS Daily", slug: "fps-daily", route: "/sales-ops/fps-daily" },
      { name: "Consistency", slug: "consistency", route: "/sales-ops/consistency" },
      { name: "Downtime Log", slug: "downtime-log", route: "/sales-ops/downtime-log" },
      { name: "Incentive Payouts", slug: "incentive-payouts", route: "/sales-ops/incentive-payouts" },
      { name: "Weekly Report", slug: "weekly-report", route: "/sales-ops/weekly-agent-report" },
      { name: "Monthly Summary", slug: "monthly-summary", route: "/sales-ops/monthly-summary" },
    ],
  },
  {
    name: "Ad Operations",
    slug: "ad-ops",
    departments: ["ad-ops"],
    items: [
      { name: "Dashboard",      slug: "ad-dashboard",   route: "/ad-ops/dashboard" },
      { name: "Requests",       slug: "ad-requests",    route: "/ad-ops/requests" },
      { name: "Asset Library",  slug: "ad-library",     route: "/ad-ops/library" },
      { name: "Deployments",    slug: "ad-deployments", route: "/ad-ops/deployments" },
      { name: "Performance",    slug: "ad-performance", route: "/ad-ops/performance" },
    ],
  },
  {
    name: "Admin",
    slug: "admin",
    minTier: 1, // OPS only
    items: [
      { name: "Observability", slug: "observability", route: "/admin/observability", minTier: 1 },
    ],
  },
];

export function resolveNavigation(
  userTier: number,
  departmentSlug: string
): NavGroup[] {
  const ops = userTier <= 1;

  return NAV_GROUPS
    .filter((group) => {
      // Tier gate
      if (group.minTier !== undefined && userTier > group.minTier) return false;
      // Department gate — OPS sees everything
      if (group.departments && !ops) {
        if (!group.departments.includes(departmentSlug)) return false;
      }
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.minTier !== undefined && userTier > item.minTier) return false;
        if (item.departments && !ops) {
          if (!item.departments.includes(departmentSlug)) return false;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
