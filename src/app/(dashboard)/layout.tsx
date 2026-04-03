import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, resolveNavigation } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MfaBanner } from "@/components/layout/mfa-banner";

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
  // Notifications table will be created in migration 00002.
  // Return 0 until then.
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

  const navigation = resolveNavigation(userTier, deptSlug);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        navigation={navigation}
        userName={userName}
        userInitials={userInitials}
        departmentName={user.department?.name ?? ""}
        isOps={userIsOps}
        departments={departments}
      />
      <div className="ml-64">
        <Topbar unreadCount={unreadCount} birthdayBanner={birthdayBanner} />
        {userTier <= 2 && <MfaBanner />}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
