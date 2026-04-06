import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

async function requireOps() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };
  return { error: null, supabase };
}

const VALID_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"];

// POST — add platform to group
export async function POST(req: NextRequest) {
  const { error, supabase } = await requireOps();
  if (error) return error;

  const body = await req.json();
  const { group_id, platform, page_id, page_name, handle } = body;

  if (!group_id) return NextResponse.json({ error: "group_id is required" }, { status: 400 });
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Valid platform required (facebook, instagram, tiktok, youtube)" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("smm_group_platforms")
    .insert({ group_id, platform, page_id: page_id ?? null, page_name: page_name ?? null, handle: handle ?? null })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — update platform (page_id, page_name, handle, access_token, is_active)
export async function PATCH(req: NextRequest) {
  const { error, supabase } = await requireOps();
  if (error) return error;

  const body = await req.json();
  const { id, page_id, page_name, handle, access_token, is_active } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (page_id       !== undefined) updates.page_id       = page_id ?? null;
  if (page_name     !== undefined) updates.page_name     = page_name ?? null;
  if (handle        !== undefined) updates.handle        = handle ?? null;
  if (access_token  !== undefined) updates.access_token  = access_token ?? null;
  if (is_active     !== undefined) updates.is_active     = Boolean(is_active);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("smm_group_platforms")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove platform
export async function DELETE(req: NextRequest) {
  const { error, supabase } = await requireOps();
  if (error) return error;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error: dbErr } = await supabase!
    .from("smm_group_platforms")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
