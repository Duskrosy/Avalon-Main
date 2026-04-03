import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { LibraryView } from "./library-view";

export default async function AdLibraryPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: taxonomy } = await supabase
    .from("ad_taxonomy_values")
    .select("category, value")
    .eq("is_active", true)
    .order("sort_order")
    .order("value");

  const contentTypes: string[] = [];
  const funnelStages: string[] = [];
  const formats: string[] = [];

  for (const row of taxonomy ?? []) {
    if (row.category === "content_type") contentTypes.push(row.value);
    else if (row.category === "funnel_stage") funnelStages.push(row.value);
    else if (row.category === "ad_format") formats.push(row.value);
  }

  return (
    <LibraryView
      contentTypes={contentTypes}
      funnelStages={funnelStages}
      formats={formats}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
