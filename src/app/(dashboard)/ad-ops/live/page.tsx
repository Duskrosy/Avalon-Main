import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { LiveAdsView } from "./live-ads-view";

export default async function LiveAdsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const canControl =
    isManagerOrAbove(user) &&
    (isOps(user) ||
      user.department?.slug === "ad-ops" ||
      user.department?.slug === "marketing");

  return <LiveAdsView canControl={canControl} />;
}
