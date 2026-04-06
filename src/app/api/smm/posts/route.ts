import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createPostSchema = z.object({
  group_id: z.string().uuid(),
  platform: z.string().min(1).max(50),
  post_type: z.string().min(1).max(50),
  status: z.string().max(50).optional(),
  caption: z.string().max(5000).optional().nullable(),
  scheduled_at: z.string().datetime({ offset: true }).optional().nullable(),
  published_at: z.string().datetime({ offset: true }).optional().nullable(),
  linked_task_id: z.string().uuid().optional().nullable(),
});

const updatePostSchema = z.object({
  id: z.string().uuid(),
  group_id: z.string().uuid().optional(),
  platform: z.string().min(1).max(50).optional(),
  post_type: z.string().min(1).max(50).optional(),
  status: z.string().max(50).optional(),
  caption: z.string().max(5000).optional().nullable(),
  scheduled_at: z.string().datetime({ offset: true }).optional().nullable(),
  published_at: z.string().datetime({ offset: true }).optional().nullable(),
  linked_task_id: z.string().uuid().optional().nullable(),
});

const deletePostSchema = z.object({
  id: z.string().uuid(),
});

async function guard() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null, user: null };

  // Check SMM access: creatives, marketing, ad-ops, OPS
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

// GET — list posts with filters
export async function GET(req: NextRequest) {
  const { error, supabase, user } = await guard();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const groupId    = searchParams.get("group_id");
  const platform   = searchParams.get("platform");
  const status     = searchParams.get("status");
  const monthParam = searchParams.get("month"); // YYYY-MM

  let query = supabase!
    .from("smm_posts")
    .select(`
      id, group_id, platform, post_type, status, caption,
      scheduled_at, published_at, linked_task_id,
      created_by_profile:profiles!created_by(first_name, last_name)
    `)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (groupId)  query = query.eq("group_id", groupId);
  if (platform) query = query.eq("platform", platform);
  if (status)   query = query.eq("status", status);
  if (monthParam) {
    const [y, m] = monthParam.split("-").map(Number);
    const first = `${monthParam}-01`;
    const last  = new Date(y, m, 0).toISOString().split("T")[0];
    query = query.gte("scheduled_at", `${first}T00:00:00Z`).lte("scheduled_at", `${last}T23:59:59Z`);
  }

  const { data, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — create post
export async function POST(req: NextRequest) {
  const { error, supabase, user } = await guard();
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = createPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { group_id, platform, post_type, status, caption, scheduled_at, published_at, linked_task_id } = parsed.data;

  const { data, error: dbErr } = await supabase!
    .from("smm_posts")
    .insert({
      group_id,
      platform,
      post_type,
      status: status ?? "idea",
      caption: caption ?? null,
      scheduled_at: scheduled_at ?? null,
      published_at: published_at ?? null,
      linked_task_id: linked_task_id ?? null,
      created_by: user!.id,  // profile.id = auth.uid()
    })
    .select(`
      id, group_id, platform, post_type, status, caption,
      scheduled_at, published_at, linked_task_id,
      created_by_profile:profiles!created_by(first_name, last_name)
    `)
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — update post
export async function PATCH(req: NextRequest) {
  const { error, supabase } = await guard();
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = updatePostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id, ...fields } = parsed.data;

  const allowed = ["platform", "post_type", "status", "caption", "scheduled_at", "published_at", "linked_task_id", "group_id"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields) updates[key] = (fields as Record<string, unknown>)[key] ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("smm_posts")
    .update(updates)
    .eq("id", id)
    .select(`
      id, group_id, platform, post_type, status, caption,
      scheduled_at, published_at, linked_task_id,
      created_by_profile:profiles!created_by(first_name, last_name)
    `)
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — delete post
export async function DELETE(req: NextRequest) {
  const { error, supabase } = await guard();
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = deletePostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id } = parsed.data;

  const { error: dbErr } = await supabase!
    .from("smm_posts")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
