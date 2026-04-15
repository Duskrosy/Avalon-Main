import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, resolveNavigation } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { MfaBanner } from "@/components/layout/mfa-banner";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { PostHogProvider } from "@/lib/posthog/provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import type { UserPreferences } from "@/types/database";

async function getBirthdayBanner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentUserId: string
) {
  const today = new Date();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, birthday")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("birthday", "is", null);

  if (!profiles) return null;

  let closest: { name: string; daysUntil: number } | null = null;

  for (const p of profiles) {
    if (p.id === currentUserId || !p.birthday) continue;

    const bday = new Date(p.birthday);
    const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());

    if (thisYear < today) {
      thisYear.setFullYear(today.getFullYear() + 1);
    }

    const diffDays = Math.ceil(
      (thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays <= 7 && (!closest || diffDays < closest.daysUntil)) {
      closest = { name: p.first_name, daysUntil: diffDays };
    }
  }

  return closest;
}

async function getUnreadCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  try {
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const userIsOps = isOps(user);
  const userTier = user.role.tier;
  const deptSlug = user.department?.slug ?? "";

  const { data: overrideRows } = await supabase
    .from("nav_page_overrides")
    .select("nav_slug, visible")
    .eq("user_id", user.id);

  const navOverrides: Record<string, boolean> = {};
  for (const row of overrideRows ?? []) {
    navOverrides[row.nav_slug] = row.visible;
  }

  const navigation = resolveNavigation(userTier, deptSlug, navOverrides);

  const [unreadCount, birthdayBanner] = await Promise.all([
    getUnreadCount(supabase, user.id),
    getBirthdayBanner(supabase, user.id),
  ]);

  let departments: { name: string; slug: string }[] = [];
  if (userIsOps) {
    const { data: depts } = await supabase
      .from("departments")
      .select("name, slug")
      .eq("is_active", true)
      .neq("slug", "ops")
      .order("name");
    departments = depts ?? [];
  }

  const userName = `${user.first_name} ${user.last_name}`;
  const userInitials = `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
  const userAvatarUrl = user.avatar_url ?? null;
  const userPreferences = ((user as unknown as Record<string, unknown>).user_preferences ?? {}) as UserPreferences;

  return (
    <PostHogProvider userId={user.id} userEmail={user.email}>
      <ThemeProvider userId={user.id} initialPreferences={userPreferences}>
        <div className="min-h-screen bg-[var(--color-bg-secondary)]">
          <Sidebar
            navigation={navigation}
            userName={userName}
            userInitials={userInitials}
            userAvatarUrl={userAvatarUrl}
            departmentName={user.department?.name ?? ""}
            isOps={userIsOps}
            departments={departments}
          />

          {/* Desktop content area */}
          <div className="lg:ml-64">
            <Topbar
              unreadCount={unreadCount}
              birthdayBanner={birthdayBanner}
              userName={userName}
              userInitials={userInitials}
              userAvatarUrl={userAvatarUrl}
            />
            {userTier <= 2 && <MfaBanner />}
            <main className="p-4 lg:p-6 pb-20 lg:pb-6">{children}</main>
          </div>

          {/* Mobile bottom nav */}
          <MobileNav
            navigation={navigation}
            deptSlug={deptSlug}
            unreadCount={unreadCount}
          />

          <FeedbackWidget />
        </div>
      </ThemeProvider>
    </PostHogProvider>
  );
}
