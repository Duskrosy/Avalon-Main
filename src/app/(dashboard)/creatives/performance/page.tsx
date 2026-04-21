import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AnalyticsView } from "../analytics/analytics-view";

export default async function CreativesPerformancePage() {
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
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  const admin = createAdminClient();
  const todayISO = new Date().toISOString().slice(0, 10);
  const [groupsRes, spendRes] = await Promise.all([
    admin
      .from("smm_groups")
      .select(`
        id, name,
        smm_group_platforms ( id, platform, page_name, is_active )
      `)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("meta_ad_demographics")
      .select("ad_id, ad_name, campaign_name, spend, impressions, conversions, messages")
      .eq("date", todayISO)
      .gt("spend", 0),
  ]);
  const groups = groupsRes.data;

  type SpendRow = { ad_id: string | null; ad_name: string | null; campaign_name: string | null; spend: number; impressions: number; conversions: number; messages: number };
  const spendMap = new Map<string, SpendRow>();
  for (const r of spendRes.data ?? []) {
    if (!r.ad_id) continue;
    const acc = spendMap.get(r.ad_id) ?? {
      ad_id: r.ad_id,
      ad_name: r.ad_name ?? null,
      campaign_name: r.campaign_name ?? null,
      spend: 0,
      impressions: 0,
      conversions: 0,
      messages: 0,
    };
    acc.spend += Number(r.spend) || 0;
    acc.impressions += r.impressions ?? 0;
    acc.conversions += r.conversions ?? 0;
    acc.messages += r.messages ?? 0;
    spendMap.set(r.ad_id, acc);
  }
  const spendingToday = Array.from(spendMap.values())
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);
  const totalSpendToday = spendingToday.reduce((n, r) => n + r.spend, 0);

  const fmtPHP = (n: number) =>
    `₱${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Performance</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
          Platform- and group-level daily metrics across Local, International, and PCDLF — manual entry and API sync. For per-post content performance, see Content Analytics.
        </p>
      </div>

      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border-primary)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Ads spending today</h3>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              {spendingToday.length > 0
                ? `${spendingToday.length} ad${spendingToday.length === 1 ? "" : "s"} running · ${fmtPHP(totalSpendToday)} so far`
                : "No ads have spent today yet."}
            </p>
          </div>
        </div>
        {spendingToday.length > 0 && (
          <div className="divide-y divide-[var(--color-border-primary)]">
            {spendingToday.map((r) => (
              <div key={r.ad_id ?? ""} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                    {r.ad_name ?? "(unnamed ad)"}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">
                    {r.campaign_name ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] tabular-nums text-[var(--color-text-secondary)] shrink-0">
                  <span className="font-semibold text-[var(--color-text-primary)]">{fmtPHP(r.spend)}</span>
                  <span>{r.impressions.toLocaleString()} impr</span>
                  <span>{r.conversions} conv</span>
                  <span>{r.messages} msg</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnalyticsView groups={groups ?? []} />
    </div>
  );
}
