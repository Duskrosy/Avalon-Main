import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MarketingRequestsView } from "./requests-view";

export default async function MarketingRequestsPage() {
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
    if (!["marketing", "creatives"].includes(dept?.slug ?? "")) redirect("/");
  }

  const currentUserName = `${currentUser.first_name} ${currentUser.last_name}`;

  return (
    <div className="max-w-5xl mx-auto">
      <MarketingRequestsView
        currentUserId={currentUser.id}
        currentUserName={currentUserName}
      />
    </div>
  );
}
