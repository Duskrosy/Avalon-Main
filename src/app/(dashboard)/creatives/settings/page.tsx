import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CreativesSettingsView, type GroupWithPlatforms, type AdMetaAccount } from "./settings-view";

export default async function CreativesSettingsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  const canManage = ops || isManagerOrAbove(currentUser);

  if (!ops) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", currentUser.department_id ?? "")
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  const admin = createAdminClient();

  const [{ data: groups }, { data: adAccounts }] = await Promise.all([
    admin
      .from("smm_groups")
      .select(`
        id, name, is_active, sort_order, weekly_target,
        smm_group_platforms ( id, platform, page_id, page_name, handle, access_token, is_active )
      `)
      .order("sort_order", { ascending: true }),
    admin
      .from("ad_meta_accounts")
      .select("id, label, meta_account_id, is_active, created_at")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Creatives Settings</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
          Manage social media page credentials and ad account registration for Local, International, and PCDLF.
        </p>
      </div>
      <CreativesSettingsView
        groups={(groups ?? []) as GroupWithPlatforms[]}
        adAccounts={(adAccounts ?? []) as AdMetaAccount[]}
        canManage={canManage}
      />
    </div>
  );
}
