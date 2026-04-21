import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CreativesDashboard } from "./dashboard-view";

export default async function CreativesDashboardPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  const deptId = currentUser.department_id;

  // Resolve creatives department ID once via admin (bypasses RLS)
  const { data: creativesDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "creatives")
    .single();
  const creativesDeptId = creativesDept?.id ?? "";

  // Verify access: must be creatives dept or OPS
  if (!ops) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", deptId ?? "")
      .maybeSingle();
    if (dept?.slug !== "creatives") redirect("/");
  }

  // ── Compute Monday/Sunday of current week ──────────────────────────────────
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayISO = monday.toISOString().split("T")[0];
  const sundayISO = sunday.toISOString().split("T")[0];

  const todayISO = new Date().toISOString().split("T")[0];

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [
    { data: weekPosts },
    { data: campaign },
    { data: members },
    { count: pendingTasksCount },
    { count: adsApprovedCount },
    { count: requestsInReview },
    { count: overdueRequestsCount },
    { data: contentItems },
    { data: unassignedOrganicData },
    { data: unassignedAdsData },
  ] = await Promise.all([
    // 1. This week's smm_posts
    supabase
      .from("smm_posts")
      .select("id, post_type, status, scheduled_at, published_at")
      .gte("scheduled_at", mondayISO)
      .lte("scheduled_at", sundayISO),

    // 2. This week's creatives campaign
    supabase
      .from("creatives_campaigns")
      .select("id, campaign_name, organic_target, ads_target, notes, week_start")
      .eq("week_start", mondayISO)
      .maybeSingle(),

    // 3. Dept members — always fetch all creatives via admin (bypasses RLS)
    admin
      .from("profiles")
      .select("id, first_name, last_name, avatar_url")
      .eq("department_id", creativesDeptId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),

    // 4. Pending kanban cards
    supabase
      .from("kanban_cards")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", currentUser.id),

    // 5. Approved ad requests this week
    supabase
      .from("ad_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("updated_at", monday.toISOString()),

    // 6. Requests in review
    supabase
      .from("ad_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "review"),

    // 7. Overdue in-flight ad requests (target_date passed, not yet approved/rejected/cancelled)
    supabase
      .from("ad_requests")
      .select("id", { count: "exact", head: true })
      .lt("target_date", todayISO)
      .in("status", ["draft", "submitted", "in_progress", "review"]),

    // 8. Content items this week (for per-status breakdown)
    supabase
      .from("creative_content_items")
      .select("id, status")
      .gte("planned_week_start", mondayISO)
      .lte("planned_week_start", sundayISO),

    // 9. Unassigned organic posts (smm_top_posts with no content-item link)
    supabase.rpc("count_unassigned_organic_posts"),

    // 10. Unassigned ads (meta_ad_stats ad_ids with no content-item link)
    supabase.rpc("count_unassigned_ads"),
  ]);

  const unassignedOrganic = Number(unassignedOrganicData ?? 0);
  const unassignedAds = Number(unassignedAdsData ?? 0);
  const unassignedTotal = unassignedOrganic + unassignedAds;

  // ── Compute post breakdown ─────────────────────────────────────────────────
  const posts = weekPosts ?? [];
  const organicCount = posts.filter((p) => p.post_type === "organic").length;
  const adsCount = posts.filter((p) => p.post_type === "ad").length;

  // ── Targets (campaign or defaults) ─────────────────────────────────────────
  const weeklyOrganicTarget = campaign?.organic_target ?? 25;
  const weeklyAdsTarget = campaign?.ads_target ?? 10;

  // ── Per-status counts (tracker snapshot funnel) ────────────────────────────
  const allItems = contentItems ?? [];
  const statusCounts: Record<string, number> = {
    idea: allItems.filter((i) => i.status === "idea").length,
    in_production: allItems.filter((i) => i.status === "in_production").length,
    submitted: allItems.filter((i) => i.status === "submitted").length,
    approved: allItems.filter((i) => i.status === "approved").length,
    scheduled: allItems.filter((i) => i.status === "scheduled").length,
    published: allItems.filter((i) => i.status === "published").length,
  };

  return (
    <CreativesDashboard
      currentUserId={currentUser.id}
      canManage={isManagerOrAbove(currentUser)}
      members={
        (members ?? []) as { id: string; first_name: string; last_name: string; avatar_url: string | null }[]
      }
      campaign={campaign ?? null}
      organicCount={organicCount}
      adsCount={adsCount}
      weeklyOrganicTarget={weeklyOrganicTarget}
      weeklyAdsTarget={weeklyAdsTarget}
      pendingTasksCount={pendingTasksCount ?? 0}
      requestsInReview={requestsInReview ?? 0}
      overdueRequestsCount={overdueRequestsCount ?? 0}
      weekStart={mondayISO}
      adsApprovedCount={adsApprovedCount ?? 0}
      statusCounts={statusCounts}
      unassignedOrganic={unassignedOrganic}
      unassignedAds={unassignedAds}
      unassignedTotal={unassignedTotal}
    />
  );
}
