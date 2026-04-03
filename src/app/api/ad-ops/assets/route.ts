import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { trackEventServer } from "@/lib/observability/track";

// GET /api/ad-ops/assets?status=&content_type=&funnel_stage=&creator_id=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const contentType = searchParams.get("content_type");
  const funnelStage = searchParams.get("funnel_stage");
  const creatorId = searchParams.get("creator_id");
  const requestId = searchParams.get("request_id");
  const limit = parseInt(searchParams.get("limit") ?? "100");

  let query = supabase
    .from("ad_assets")
    .select(`
      *,
      creator:profiles!creator_id(id, first_name, last_name),
      request:ad_requests!request_id(id, title),
      versions:ad_asset_versions(id, version_number, file_url, change_notes, created_at)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (contentType) query = query.eq("content_type", contentType);
  if (funnelStage) query = query.eq("funnel_stage", funnelStage);
  if (creatorId) query = query.eq("creator_id", creatorId);
  if (requestId) query = query.eq("request_id", requestId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/ad-ops/assets
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const { data, error } = await supabase
    .from("ad_assets")
    .insert({
      request_id: body.request_id ?? null,
      asset_code: body.asset_code,
      title: body.title,
      product: body.product ?? null,
      content_type: body.content_type ?? null,
      hook_type: body.hook_type ?? null,
      funnel_stage: body.funnel_stage ?? null,
      creator_id: body.creator_id ?? currentUser.id,
      thumbnail_url: body.thumbnail_url ?? null,
      tags: body.tags ?? [],
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  trackEventServer(supabase, currentUser.id, "ad.asset.created", {
    module: "ad-ops",
    properties: { asset_id: data.id, asset_code: data.asset_code },
  });

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/ad-ops/assets?id=...
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();

  const { data, error } = await supabase
    .from("ad_assets")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/ad-ops/assets?id=... — manager+ only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("ad_assets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
