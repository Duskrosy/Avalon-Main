import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AdOpsSettings } from "./settings-view";

export default async function AdOpsSettingsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");
  if (!isOps(currentUser)) redirect("/ad-ops/dashboard");

  const [{ data: groups }, { data: accounts }] = await Promise.all([
    supabase
      .from("meta_account_groups")
      .select("id, name, currency, is_active, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("ad_meta_accounts")
      .select("id, account_id, name, label, currency, is_active, group_id, primary_conversion_id, primary_conversion_name")
      .order("name"),
  ]);

  return (
    <AdOpsSettings
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialGroups={(groups ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialAccounts={(accounts ?? []) as any}
    />
  );
}
