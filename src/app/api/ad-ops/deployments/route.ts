import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { trackEventServer } from "@/lib/observability/track";
import { validateBody } from "@/lib/api/validate";
import { adDeploymentPostSchema, adDeploymentPatchSchema } from "@/lib/api/schemas";

// GET /api/ad-ops/deployments?status=&asset_id=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const assetId = searchParams.get("asset_id");

  let query = supabase
    .from("ad_deployments")
    .select(`
      *,
      asset:ad_assets!asset_id(id, asset_code, title, content_type, funnel_stage, thumbnail_url),
      meta_account:ad_meta_accounts!meta_account_id(id, name, account_id),
      launched_by_profile:profiles!launched_by(first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (assetId) query = query.eq("asset_id", assetId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/ad-ops/deployments
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(adDeploymentPostSchema, raw);
  if (validationError) return validationError;

  const { data, error } = await supabase
    .from("ad_deployments")
    .insert({
      asset_id: body.asset_id ?? null,
      meta_account_id: body.meta_account_id ?? null,
      campaign_name: body.campaign_name ?? null,
      meta_campaign_id: body.meta_campaign_id ?? null,
      meta_adset_id: body.meta_adset_id ?? null,
      meta_ad_id: body.meta_ad_id ?? null,
      budget_daily: body.budget_daily ?? null,
      budget_total: body.budget_total ?? null,
      notes: body.notes ?? null,
      status: body.status ?? "draft",
      launched_by: body.status === "active" ? currentUser.id : null,
      launched_at: body.status === "active" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  trackEventServer(supabase, currentUser.id, "ad.deployment.created", {
    module: "ad-ops",
    properties: { deployment_id: data.id, asset_id: body.asset_id },
  });

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/ad-ops/deployments?id=...
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(adDeploymentPatchSchema, raw);
  if (validationError) return validationError;

  const updatePayload: Record<string, unknown> = { ...body };
  if (body.status === "active") {
    updatePayload.launched_by = currentUser.id;
    updatePayload.launched_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("ad_deployments")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/ad-ops/deployments?id=... — manager+ only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("ad_deployments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
