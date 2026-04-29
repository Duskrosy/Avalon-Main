import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CreativesRequestsView } from "./requests-view";

export default async function CreativesRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const forceRequester = params.as === "requester";
  const supabase = await createClient();
  const admin = createAdminClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // Determine user context
  let userDeptSlug: string | null = null;
  if (currentUser.department_id) {
    const { data: dept } = await admin
      .from("departments")
      .select("slug")
      .eq("id", currentUser.department_id)
      .maybeSingle();
    userDeptSlug = dept?.slug ?? null;
  }
  const isCreativesDept = userDeptSlug === "creatives";
  const isOpsUser = isOps(currentUser);

  // Fetch creatives members for assignee dropdown
  const { data: creativesDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "creatives")
    .single();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url")
    .eq("department_id", creativesDept?.id ?? "")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  return (
    <div className="max-w-5xl mx-auto">
      <CreativesRequestsView
        members={profiles ?? []}
        currentUserId={currentUser.id}
        canManage={(isCreativesDept || isOpsUser) && !forceRequester}
        isCreativesDept={isCreativesDept && !forceRequester}
        isOps={isOpsUser && !forceRequester}
      />
    </div>
  );
}
