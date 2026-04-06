import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const VALID_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;

const createPlatformSchema = z.object({
  group_id: z.string().uuid(),
  platform: z.enum(VALID_PLATFORMS),
  page_id: z.string().max(200).optional().nullable(),
  page_name: z.string().max(200).optional().nullable(),
  handle: z.string().max(200).optional().nullable(),
});

const updatePlatformSchema = z.object({
  id: z.string().uuid(),
  page_id: z.string().max(200).optional().nullable(),
  page_name: z.string().max(200).optional().nullable(),
  handle: z.string().max(200).optional().nullable(),
  access_token: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
});

const deletePlatformSchema = z.object({
  id: z.string().uuid(),
});

async function requireOps() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };
  return { error: null, supabase };
}

// POST — add platform to group
export async function POST(req: NextRequest) {
  const { error, supabase } = await requireOps();
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = createPlatformSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { group_id, platform, page_id, page_name, handle } = parsed.data;

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

  const raw = await req.json().catch(() => ({}));
  const parsed = updatePlatformSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id, page_id, page_name, handle, access_token, is_active } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (page_id       !== undefined) updates.page_id       = page_id ?? null;
  if (page_name     !== undefined) updates.page_name     = page_name ?? null;
  if (handle        !== undefined) updates.handle        = handle ?? null;
  if (access_token  !== undefined) updates.access_token  = access_token ?? null;
  if (is_active     !== undefined) updates.is_active     = is_active;

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

  const raw = await req.json().catch(() => ({}));
  const parsed = deletePlatformSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id } = parsed.data;

  const { error: dbErr } = await supabase!
    .from("smm_group_platforms")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
