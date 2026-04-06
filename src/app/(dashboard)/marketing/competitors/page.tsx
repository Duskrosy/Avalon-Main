import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CompetitorsView } from "./competitors-view";

export default async function MarketingCompetitorsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  if (!ops && currentUser.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", currentUser.department_id)
      .maybeSingle();
    if (!["marketing", "creatives", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  const canManage = isManagerOrAbove(currentUser);

  return (
    <div className="max-w-6xl mx-auto">
      <CompetitorsView canManage={canManage} />
    </div>
  );
}
