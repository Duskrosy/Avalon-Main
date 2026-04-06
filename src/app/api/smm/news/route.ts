import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

async function guard() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user)
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null, user: null };

  // Check ad-ops access: creatives, marketing, ad-ops, OPS
  const ops = isOps(user);
  if (!ops && user.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", user.department_id)
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) {
      return { error: NextResponse.json({ error: "Unauthorized" }, { status: 403 }), supabase: null, user: null };
    }
  }

  return { error: null, supabase, user };
}

// GET /api/smm/news?category=&page=1&limit=20
export async function GET(req: NextRequest) {
  const { error, supabase } = await guard();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const offset   = (page - 1) * limit;

  let query = supabase!
    .from("smm_news_items")
    .select("id, title, url, summary, image_url, published_at, fetched_at, source:smm_news_sources!source_id(name, category)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // Filter by category via source join
  if (category) {
    // Use a subquery approach: filter source_id IN (sources with that category)
    // Supabase allows filtering on joined columns using the foreign table syntax
    query = query.eq("smm_news_sources.category", category);
  }

  const { data, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Filter out items where source didn't match (Supabase returns null source for non-matching joins)
  const items = category
    ? (data ?? []).filter((item: { source: unknown }) => item.source !== null)
    : (data ?? []);

  return NextResponse.json({ items, page, limit });
}
