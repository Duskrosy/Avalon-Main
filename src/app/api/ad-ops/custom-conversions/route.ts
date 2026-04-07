import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { resolveToken } from "@/lib/meta/client";

const BASE = "https://graph.facebook.com/v21.0";

/**
 * GET /api/ad-ops/custom-conversions?account_id={db_uuid}
 *
 * Fetches custom conversions from Meta for a given ad account.
 * Returns [ { id, name, pixel_id, custom_event_type } ]
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "account_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: acct } = await admin
    .from("ad_meta_accounts")
    .select("account_id, meta_access_token")
    .eq("id", accountId)
    .single();

  if (!acct) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const token = resolveToken(acct);
  if (!token) return NextResponse.json({ error: "No access token for this account" }, { status: 400 });

  const params = new URLSearchParams({
    fields: "id,name,pixel,custom_event_type,creation_time",
    limit: "200",
    access_token: token,
  });

  const res = await fetch(`${BASE}/act_${acct.account_id}/customconversions?${params}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Meta API error: ${body}` }, { status: 502 });
  }

  const json = await res.json() as {
    data: { id: string; name: string; pixel?: { id: string }; custom_event_type?: string; creation_time?: string }[];
  };

  return NextResponse.json(json.data ?? []);
}
