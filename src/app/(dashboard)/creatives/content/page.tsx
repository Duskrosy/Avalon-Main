import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ContentManager } from "./content-view";

export default async function CreativesContentPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);

  if (!ops) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", currentUser.department_id ?? "")
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  // Fetch SMM groups with their platforms
  const { data: groups } = await supabase
    .from("smm_groups")
    .select(`
      id, name, weekly_target,
      smm_group_platforms(id, platform, page_name, is_active)
    `)
    .eq("is_active", true)
    .order("sort_order");

  // Fetch posts for current month (initial load)
  const now = new Date();
  const firstStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const lastStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const { data: posts } = await supabase
    .from("smm_posts")
    .select(`
      id, group_id, platform, post_type, status, caption, scheduled_at, published_at,
      linked_task_id,
      created_by_profile:profiles!created_by(first_name, last_name)
    `)
    .or(`scheduled_at.gte.${firstStr}T00:00:00Z,status.eq.idea,status.eq.draft,status.eq.backlog`)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  return (
    <ContentManager
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialGroups={(groups ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialPosts={(posts ?? []) as any}
      canManage={ops}
    />
  );
}
