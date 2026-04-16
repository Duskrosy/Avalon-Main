import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAdDemographics } from "@/lib/meta/client";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const campaignId   = searchParams.get("campaign_id");
  const accountId    = searchParams.get("meta_account_id");
  const date         = searchParams.get("date") ?? new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  if (!campaignId || !accountId) {
    return NextResponse.json({ error: "campaign_id and meta_account_id are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Try cached rows first
  const { data: cached } = await supabase
    .from("meta_ad_demographics")
    .select("gender, spend, impressions, conversions, messages")
    .eq("campaign_id", campaignId)
    .eq("meta_account_id", accountId)
    .eq("date", date);

  if (cached && cached.length > 0) {
    return NextResponse.json({ data: cached });
  }

  // Fetch from Meta, resolve per-account token
  const { data: accountRow } = await supabase
    .from("ad_meta_accounts")
    .select("meta_access_token")
    .eq("account_id", accountId)
    .single();

  const token = accountRow?.meta_access_token ?? process.env.META_ACCESS_TOKEN ?? "";
  const rows = await fetchAdDemographics(accountId, campaignId, date, token);

  if (rows.length > 0) {
    await supabase.from("meta_ad_demographics").upsert(
      rows.map((r) => ({ ...r, campaign_id: campaignId, meta_account_id: accountId, date })),
      { onConflict: "meta_account_id,campaign_id,date,gender" }
    );
  }

  return NextResponse.json({ data: rows });
}
