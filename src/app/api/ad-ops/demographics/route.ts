import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { fetchAdDemographics, resolveToken } from "@/lib/meta/client";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const campaignId = searchParams.get("campaign_id");
  const accountId  = searchParams.get("meta_account_id");
  const date       = searchParams.get("date") ?? new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  if (!campaignId || !accountId) {
    return NextResponse.json({ error: "campaign_id and meta_account_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Try cached rows first
  const { data: cached } = await admin
    .from("meta_ad_demographics")
    .select("gender, spend, impressions, conversions, messages")
    .eq("campaign_id", campaignId)
    .eq("meta_account_id", accountId)
    .eq("date", date);

  if (cached && cached.length > 0) {
    return NextResponse.json({ data: cached });
  }

  // Resolve token from account UUID
  const { data: accountRow } = await admin
    .from("ad_meta_accounts")
    .select("id, account_id, meta_access_token")
    .eq("id", accountId)
    .single();

  const token = resolveToken(accountRow ?? {});
  if (!token) {
    return NextResponse.json({ error: "No access token configured" }, { status: 400 });
  }

  const metaAccountId = accountRow?.account_id ?? accountId;

  try {
    const rows = await fetchAdDemographics(metaAccountId, campaignId, date, token);

    if (rows.length > 0) {
      const { error: upsertError } = await admin.from("meta_ad_demographics").upsert(
        rows.map((r) => ({ ...r, campaign_id: campaignId, meta_account_id: accountId, date })),
        { onConflict: "meta_account_id,campaign_id,date,gender" }
      );
      if (upsertError) {
        console.error("[demographics] upsert failed:", upsertError.message);
      }
    }

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[demographics] Meta API error:", err);
    return NextResponse.json({ error: "Failed to fetch demographics from Meta" }, { status: 502 });
  }
}
