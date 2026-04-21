import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import TrackerView from "./tracker-view";

export default async function CreativesTrackerPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: items }, { data: profiles }, { data: posts }, { data: platforms }] =
    await Promise.all([
      // All content items
      admin
        .from("creative_content_items")
        .select(
          `*,
          assigned_profile:profiles!assigned_to(id, first_name, last_name),
          creator_profile:profiles!created_by(id, first_name, last_name),
          assignees:content_item_assignees(
            user_id,
            profile:profiles!user_id(id, first_name, last_name, avatar_url)
          )`
        )
        .order("created_at", { ascending: false }),
      // Profiles for assignment dropdown
      admin
        .from("profiles")
        .select("id, first_name, last_name, department_id, avatar_url")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("first_name"),
      // Published smm_posts for linking
      admin
        .from("smm_posts")
        .select(
          "id, platform, caption, status, published_at, scheduled_at, created_by"
        )
        .eq("status", "published")
        // 14-day window for tracker "Gather post" modal — recent posts only
        .gte(
          "published_at",
          new Date(Date.now() - 14 * 86400_000).toISOString()
        )
        .order("published_at", { ascending: false })
        .limit(200),
      // 4. Platform connections (for sync display)
      admin
        .from("smm_group_platforms")
        .select("id, group_id, platform, page_name, is_active, token_expires_at")
        .eq("is_active", true),
    ]);

  return (
    <TrackerView
      items={items ?? []}
      profiles={profiles ?? []}
      posts={posts ?? []}
      platforms={platforms ?? []}
      currentUserId={user.id}
      isManager={isManagerOrAbove(user)}
      currentDeptId={user.department_id ?? null}
    />
  );
}
