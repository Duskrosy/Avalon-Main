import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/creatives/unassigned-posts
// Returns counts of published content (organic smm_top_posts + meta ads) that
// are not yet linked to any creative_content_item. Powers the Creatives
// dashboard "Unassigned Posts" KPI.
export async function GET() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [organicRes, adsRes] = await Promise.all([
    supabase.rpc("count_unassigned_organic_posts"),
    supabase.rpc("count_unassigned_ads"),
  ]);

  if (organicRes.error || adsRes.error) {
    return NextResponse.json(
      { error: (organicRes.error ?? adsRes.error)?.message ?? "RPC failed" },
      { status: 500 }
    );
  }

  const organic = Number(organicRes.data ?? 0);
  const ads = Number(adsRes.data ?? 0);
  return NextResponse.json({ organic, ads, total: organic + ads });
}
