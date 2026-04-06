import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

async function guardRead() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user)
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };

  const ops = isOps(user);
  if (!ops && user.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", user.department_id)
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) {
      return { error: NextResponse.json({ error: "Unauthorized" }, { status: 403 }), supabase: null };
    }
  }

  return { error: null, supabase };
}

async function guardOps() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user))
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };
  return { error: null, supabase };
}

// GET /api/smm/news/sources — list all sources
export async function GET() {
  const { error, supabase } = await guardRead();
  if (error) return error;

  const { data, error: dbErr } = await supabase!
    .from("smm_news_sources")
    .select("id, name, url, category, is_active, created_at")
    .order("created_at", { ascending: true });

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/smm/news/sources — add source (ops only)
export async function POST(req: NextRequest) {
  const { error, supabase } = await guardOps();
  if (error) return error;

  const body = await req.json();
  const { name, url, category } = body;

  if (!name || typeof name !== "string" || !name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!url || typeof url !== "string" || !url.trim())
    return NextResponse.json({ error: "url is required" }, { status: 400 });

  const validCategories = ["shoes", "height", "viral_ph", "general"];
  const cat = category && validCategories.includes(category) ? category : "general";

  const { data, error: dbErr } = await supabase!
    .from("smm_news_sources")
    .insert({ name: name.trim(), url: url.trim(), category: cat })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/smm/news/sources — toggle is_active (ops only)
export async function PATCH(req: NextRequest) {
  const { error, supabase } = await guardOps();
  if (error) return error;

  const body = await req.json();
  const { id, is_active } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (typeof is_active !== "boolean")
    return NextResponse.json({ error: "is_active (boolean) is required" }, { status: 400 });

  const { data, error: dbErr } = await supabase!
    .from("smm_news_sources")
    .update({ is_active })
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/smm/news/sources — delete source (ops only)
export async function DELETE(req: NextRequest) {
  const { error, supabase } = await guardOps();
  if (error) return error;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error: dbErr } = await supabase!
    .from("smm_news_sources")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
