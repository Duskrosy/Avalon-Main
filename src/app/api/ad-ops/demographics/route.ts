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
  const breakdown = (searchParams.get("breakdown") ?? "gender") as "gender" | "age";

  if (!campaignId || !accountId) {
    return NextResponse.json({ error: "campaign_id and meta_account_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Try cached rows first (scoped to breakdown type)
  const cachedQuery = admin
    .from("meta_ad_demographics")
    .select("campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,gender,age_group,spend,impressions,conversions,messages")
    .eq("campaign_id", campaignId)
    .eq("meta_account_id", accountId)
    .eq("date", date);
  if (breakdown === "age") {
    cachedQuery.not("age_group", "is", null);
  } else {
    cachedQuery.not("gender", "is", null);
  }
  const { data: cached } = await cachedQuery;

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
    const rows = await fetchAdDemographics(metaAccountId, campaignId, date, token, breakdown);

    if (rows.length > 0) {
      const { error: upsertError } = await admin
        .from("meta_ad_demographics")
        .upsert(
          rows.map((r) => ({
            meta_account_id: accountId,
            campaign_id:    r.campaign_id,
            campaign_name:  r.campaign_name,
            adset_id:       r.adset_id,
            adset_name:     r.adset_name,
            ad_id:          r.ad_id,
            ad_name:        r.ad_name,
            date,
            gender:         r.gender,
            age_group:      r.age_group,
            spend:          r.spend,
            impressions:    r.impressions,
            conversions:    r.conversions,
            messages:       r.messages,
          })),
          {
            onConflict: "meta_account_id,campaign_id,adset_id,ad_id,date,gender,age_group",
            ignoreDuplicates: false,
          }
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
