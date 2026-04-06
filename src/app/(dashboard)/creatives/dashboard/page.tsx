import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CreativesDashboard } from "./dashboard-view";

export default async function CreativesDashboardPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  const deptId = currentUser.department_id;

  // Verify access: must be creatives dept or OPS
  if (!ops) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", deptId ?? "")
      .maybeSingle();
    if (dept?.slug !== "creatives") redirect("/");
  }

  // ── Compute Monday/Sunday of current week (calendar date comparison) ──────────
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayISO = monday.toISOString().split("T")[0];
  const sundayISO = sunday.toISOString().split("T")[0];

  // ── Fetch all data in parallel ─────────────────────────────────────────────────
  const [
    { data: groups },
    { data: weekPosts },
    { data: campaign },
    { data: members },
    { count: pendingTasksCount },
    { count: adsApprovedCount },
    { count: requestsInReview },
  ] = await Promise.all([
    // 1. SMM groups (for fallback weekly target)
    supabase
      .from("smm_groups")
      .select("id, name, weekly_target")
      .eq("is_active", true)
      .order("sort_order"),

    // 2. This week's smm_posts (all statuses, to bucket by post_type)
    supabase
      .from("smm_posts")
      .select("id, post_type, status, scheduled_at, published_at")
      .gte("scheduled_at", mondayISO)
      .lte("scheduled_at", sundayISO),

    // 3. This week's creatives campaign
    supabase
      .from("creatives_campaigns")
      .select("id, campaign_name, organic_target, ads_target, notes, week_start")
      .eq("week_start", mondayISO)
      .maybeSingle(),

    // 4. Dept members (creatives dept — or all if OPS with no deptId)
    deptId
      ? supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("department_id", deptId)
          .eq("status", "active")
          .is("deleted_at", null)
          .order("first_name")
      : supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("status", "active")
          .is("deleted_at", null)
          .order("first_name"),

    // 5. Pending kanban cards for current user
    supabase
      .from("kanban_cards")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", currentUser.id),

    // 6. Ad requests approved this week
    supabase
      .from("ad_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("updated_at", monday.toISOString()),

    // 7. Ad requests in review (assigned to creatives / in review status)
    supabase
      .from("ad_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "review"),
  ]);

  // ── Compute post breakdown ─────────────────────────────────────────────────────
  const posts = weekPosts ?? [];
  const organicCount = posts.filter((p) => p.post_type === "organic").length;
  const adsCount = posts.filter((p) => p.post_type === "ad").length;

  // ── Targets ──────────────────────────────────────────────────────────────────
  const groupsTotal = (groups ?? []).reduce((sum, g) => sum + g.weekly_target, 0);
  const weeklyOrganicTarget =
    campaign?.organic_target ?? (groupsTotal > 0 ? groupsTotal : 25);
  const weeklyAdsTarget = campaign?.ads_target ?? 10;

  // ── Weekly posts by day (Mon–Sun) for mini chart ──────────────────────────────
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeklyPostsByDay = days.map((day, i) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + i);
    const iso = date.toISOString().split("T")[0];
    const dayPosts = posts.filter((p) =>
      ((p.scheduled_at ?? p.published_at) ?? "").startsWith(iso)
    );
    return {
      day,
      organic: dayPosts.filter((p) => p.post_type === "organic").length,
      ad: dayPosts.filter((p) => p.post_type === "ad").length,
    };
  });

  return (
    <CreativesDashboard
      currentUserId={currentUser.id}
      canManage={isManagerOrAbove(currentUser)}
      members={
        (members ?? []) as { id: string; first_name: string; last_name: string }[]
      }
      campaign={campaign ?? null}
      organicCount={organicCount}
      adsCount={adsCount}
      weeklyOrganicTarget={weeklyOrganicTarget}
      weeklyAdsTarget={weeklyAdsTarget}
      pendingTasksCount={pendingTasksCount ?? 0}
      requestsInReview={requestsInReview ?? 0}
      weekStart={mondayISO}
      weeklyPostsByDay={weeklyPostsByDay}
      adsApprovedCount={adsApprovedCount ?? 0}
    />
  );
}
