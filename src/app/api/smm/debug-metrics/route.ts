import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const META_BASE = "https://graph.facebook.com/v21.0";

// Temporary debug endpoint — tests each FB/IG metric individually
// GET /api/smm/debug-metrics?platform_id=<uuid>&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const platformId = searchParams.get("platform_id");
  const date = searchParams.get("date") ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

  if (!platformId) {
    return NextResponse.json({ error: "platform_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: platform } = await admin
    .from("smm_group_platforms")
    .select("platform, page_id, access_token")
    .eq("id", platformId)
    .single();

  if (!platform?.page_id) {
    return NextResponse.json({ error: "No page_id configured for this platform" }, { status: 400 });
  }

  const token = platform.access_token ?? process.env.META_ACCESS_TOKEN ?? null;
  if (!token) {
    return NextResponse.json({ error: "No token configured" }, { status: 400 });
  }

  const since = date;
  const until = new Date(new Date(date).getTime() + 86400000).toISOString().split("T")[0];
  const pageId = platform.page_id;
  const results: Record<string, unknown> = { platform: platform.platform, page_id: pageId, date };

  if (platform.platform === "facebook") {
    const fbMetrics = [
      "page_impressions",
      "page_impressions_unique",
      "page_post_engagements",
      "page_engaged_users",
      "page_actions_post_reactions_total",
      "page_views_total",
      "page_fan_adds",
      "page_fans",
    ];

    results.metrics = {};
    for (const metric of fbMetrics) {
      const url = `${META_BASE}/${pageId}/insights/${metric}?period=day&since=${since}&until=${until}&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) {
        (results.metrics as Record<string, unknown>)[metric] = { error: json.error.message };
      } else {
        const value = json.data?.[0]?.values?.[0]?.value ?? null;
        (results.metrics as Record<string, unknown>)[metric] = { value };
      }
    }

    // Fan count
    const fanRes = await fetch(`${META_BASE}/${pageId}?fields=fan_count,followers_count,name&access_token=${token}`);
    results.page_fields = await fanRes.json();

  } else if (platform.platform === "instagram") {
    const igMetrics = [
      "impressions",
      "reach",
      "accounts_engaged",
      "profile_views",
      "website_clicks",
      "follower_count",
      "email_contacts",
      "phone_call_clicks",
    ];

    results.metrics = {};
    for (const metric of igMetrics) {
      const url = `${META_BASE}/${pageId}/insights/${metric}?period=day&since=${since}&until=${until}&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) {
        (results.metrics as Record<string, unknown>)[metric] = { error: json.error.message };
      } else {
        const value = json.data?.[0]?.values?.[0]?.value ?? null;
        (results.metrics as Record<string, unknown>)[metric] = { value };
      }
    }

    // Profile fields
    const profRes = await fetch(`${META_BASE}/${pageId}?fields=followers_count,media_count,name&access_token=${token}`);
    results.profile_fields = await profRes.json();
  }

  return NextResponse.json(results, { status: 200 });
}
