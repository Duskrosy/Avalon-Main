import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createNewsSourceSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
  category: z.enum(["shoes", "height", "viral_ph", "general"]).optional().default("general"),
});

const updateNewsSourceSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
});

const deleteNewsSourceSchema = z.object({
  id: z.string().uuid(),
});

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

  const { data, error: dbErr } = await createAdminClient()
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

  const raw = await req.json().catch(() => ({}));
  const parsed = createNewsSourceSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { name, url, category } = parsed.data;

  const { data, error: dbErr } = await createAdminClient()
    .from("smm_news_sources")
    .insert({ name: name.trim(), url: url.trim(), category })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/smm/news/sources — toggle is_active (ops only)
export async function PATCH(req: NextRequest) {
  const { error, supabase } = await guardOps();
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = updateNewsSourceSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id, is_active } = parsed.data;

  const { data, error: dbErr } = await createAdminClient()
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

  const raw = await req.json().catch(() => ({}));
  const parsed = deleteNewsSourceSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id } = parsed.data;

  const { error: dbErr } = await createAdminClient()
    .from("smm_news_sources")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
