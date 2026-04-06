import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { resolveToken, fetchAdThumbnails } from "@/lib/meta/client";

/**
 * GET /api/ad-ops/live-ads/thumbnails?ad_ids=id1,id2,id3
 *
 * Fetches thumbnail URLs from Meta for a comma-separated list of ad IDs.
 * Looks up the access token via meta_ad_stats → ad_meta_accounts.
 * Returns { [adId]: thumbnailUrl }
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idsParam = req.nextUrl.searchParams.get("ad_ids") ?? "";
  const adIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (!adIds.length) return NextResponse.json({});

  const admin = createAdminClient();

  // Find an account token from any stat row for these ads
  const { data: stat } = await admin
    .from("meta_ad_stats")
    .select("meta_account_id")
    .in("ad_id", adIds)
    .limit(1)
    .single();

  if (!stat?.meta_account_id) return NextResponse.json({});

  const { data: acct } = await admin
    .from("ad_meta_accounts")
    .select("account_id, meta_access_token")
    .eq("id", stat.meta_account_id)
    .single();

  const token = resolveToken(acct ?? {});
  if (!token) return NextResponse.json({});

  const thumbnails = await fetchAdThumbnails(adIds, token);
  return NextResponse.json(thumbnails);
}
