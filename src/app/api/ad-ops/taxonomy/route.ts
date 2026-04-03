import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/ad-ops/taxonomy?category=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const category = new URL(req.url).searchParams.get("category");

  let query = supabase
    .from("ad_taxonomy_values")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")
    .order("value");

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If no category filter, group by category
  if (!category) {
    const grouped: Record<string, string[]> = {};
    for (const row of data ?? []) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.value);
    }
    return NextResponse.json(grouped);
  }

  return NextResponse.json((data ?? []).map((r) => r.value));
}
