import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { NewsView } from "./news-view";

export default async function MarketingNewsPage() {
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
    if (!["marketing", "creatives", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  const canManage = isManagerOrAbove(currentUser);

  return (
    <div className="max-w-4xl mx-auto">
      <NewsView canManage={canManage} />
    </div>
  );
}
