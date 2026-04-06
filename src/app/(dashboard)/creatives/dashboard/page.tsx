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

  // Get SMM groups for weekly target
  const { data: groups } = await supabase
    .from("smm_groups")
    .select("id, name, weekly_target")
    .eq("is_active", true)
    .order("sort_order");

  // Get this week's post count (Mon–Sun)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const { count: weekPostCount } = await supabase
    .from("smm_posts")
    .select("id", { count: "exact", head: true })
    .in("status", ["scheduled", "published"])
    .gte("scheduled_at", monday.toISOString())
    .lte("scheduled_at", sunday.toISOString());

  // Pending kanban cards assigned to current user (if not OPS)
  let pendingCards: number | null = null;
  if (!ops && currentUser.id) {
    const { count } = await supabase
      .from("kanban_cards")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", currentUser.id);
    pendingCards = count ?? 0;
  }

  // Team members in creatives dept
  const { data: members } = deptId
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("department_id", deptId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("first_name")
    : { data: [] };

  const weeklyTarget = (groups ?? []).reduce((sum, g) => sum + g.weekly_target, 0) || 25;

  return (
    <CreativesDashboard
      weekPostCount={weekPostCount ?? 0}
      weeklyTarget={weeklyTarget}
      pendingCards={pendingCards}
      members={(members ?? []) as { id: string; first_name: string; last_name: string }[]}
      canManage={isManagerOrAbove(currentUser)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      groups={(groups ?? []) as any}
    />
  );
}
