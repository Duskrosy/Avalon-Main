import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

async function requireOps() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };
  return { error: null, supabase };
}

// GET — list all groups with platforms
export async function GET() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("smm_groups")
    .select(`
      id, name, weekly_target, is_active, sort_order,
      smm_group_platforms(id, platform, page_id, page_name, handle, is_active)
    `)
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — create group
export async function POST(req: NextRequest) {
  const { error, supabase } = await requireOps();
  if (error) return error;

  const body = await req.json();
  const { name, weekly_target } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("smm_groups")
    .insert({ name: name.trim(), weekly_target: Number(weekly_target ?? 25) })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — update group
export async function PATCH(req: NextRequest) {
  const { error, supabase } = await requireOps();
  if (error) return error;

  const body = await req.json();
  const { id, name, weekly_target, is_active, sort_order } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (name          !== undefined) updates.name          = String(name).trim();
  if (weekly_target !== undefined) updates.weekly_target = Number(weekly_target);
  if (is_active     !== undefined) updates.is_active     = Boolean(is_active);
  if (sort_order    !== undefined) updates.sort_order    = Number(sort_order);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("smm_groups")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — delete group (cascades to platforms + posts)
export async function DELETE(req: NextRequest) {
  const { error, supabase } = await requireOps();
  if (error) return error;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error: dbErr } = await supabase!
    .from("smm_groups")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
