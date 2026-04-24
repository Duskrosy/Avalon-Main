import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CampaignsView } from "./campaigns-view";
import { loadCampaignsWindow } from "@/lib/ad-ops/campaigns-window";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // Fetch accounts + the default-preset window in parallel so the table paints
  // on first byte instead of flashing a spinner. The default "7" matches the
  // client's initial datePreset; any date-range change still goes through
  // /api/ad-ops/campaigns via the client useEffect.
  const [accountsResult, initialWindow] = await Promise.all([
    supabase
      .from("ad_meta_accounts")
      .select("id, name, account_id, currency, primary_conversion_id, primary_conversion_name")
      .eq("is_active", true),
    loadCampaignsWindow("7", null, null).catch(() => null),
  ]);

  return (
    <CampaignsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accounts={(accountsResult.data ?? []) as any}
      canSync={isOps(currentUser)}
      initialWindow={initialWindow}
    />
  );
}
