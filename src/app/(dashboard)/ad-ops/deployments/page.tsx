import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DeploymentsView } from "./deployments-view";

export default async function AdDeploymentsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: metaAccounts } = await supabase
    .from("ad_meta_accounts")
    .select("id, name, account_id")
    .eq("is_active", true)
    .order("name");

  const { data: assets } = await supabase
    .from("ad_assets")
    .select("id, asset_code, title")
    .eq("status", "approved")
    .order("asset_code");

  return (
    <DeploymentsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metaAccounts={(metaAccounts ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      approvedAssets={(assets ?? []) as any}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
