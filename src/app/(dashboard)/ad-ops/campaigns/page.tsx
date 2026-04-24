import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CampaignsView } from "./campaigns-view";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // Keep SSR light: only the account list is needed at first paint.
  // Campaigns and window-aggregated stats are fetched client-side against the
  // /api/ad-ops/campaigns route so the browser doesn't download 30 days of
  // raw ad-stats rows (and doesn't silently hit Supabase's 1000-row cap).
  const { data: accounts } = await supabase
    .from("ad_meta_accounts")
    .select("id, name, account_id, currency, primary_conversion_id, primary_conversion_name")
    .eq("is_active", true);

  return (
    <CampaignsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accounts={(accounts ?? []) as any}
      canSync={isOps(currentUser)}
    />
  );
}
