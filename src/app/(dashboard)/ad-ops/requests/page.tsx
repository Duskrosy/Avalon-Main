import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { RequestsView } from "./requests-view";

export default async function AdRequestsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: creatives } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("status", "active")
    .in("department_id", (
      await supabase.from("departments").select("id").in("slug", ["creatives", "ad-ops"])
    ).data?.map((d) => d.id) ?? [])
    .order("first_name");

  return (
    <RequestsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      creatives={(creatives ?? []) as any}
      currentUserId={currentUser.id}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
