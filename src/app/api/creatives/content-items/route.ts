import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/creatives/content-items?status=&week=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const week = searchParams.get("week");

  let query = supabase
    .from("creative_content_items")
    .select(`
      *,
      assigned_profile:profiles!assigned_to(id, first_name, last_name, avatar_url),
      creator_profile:profiles!created_by(id, first_name, last_name, avatar_url)
    `)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (week) query = query.eq("planned_week_start", week);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/creatives/content-items
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const { data: item, error } = await supabase
    .from("creative_content_items")
    .insert({
      title: body.title,
      content_type: body.content_type ?? null,
      channel_type: body.channel_type ?? null,
      funnel_stage: body.funnel_stage ?? null,
      creative_angle: body.creative_angle ?? null,
      product_or_collection: body.product_or_collection ?? null,
      campaign_label: body.campaign_label ?? null,
      promo_code: body.promo_code ?? null,
      transfer_link: body.transfer_link ?? null,
      planned_week_start: body.planned_week_start ?? null,
      date_submitted: body.date_submitted ?? null,
      status: body.status ?? "idea",
      assigned_to: body.assigned_to ?? null,
      created_by: user.id,
    })
    .select("id, title")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create linked kanban card
  try {
    const admin = createAdminClient();
    const { data: board } = await admin
      .from("kanban_boards")
      .select("id, kanban_columns(id, name, sort_order)")
      .eq("department_id", user.department_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (board?.kanban_columns?.length) {
      const cols = [...board.kanban_columns].sort(
        (a: any, b: any) => a.sort_order - b.sort_order
      );
      const { data: card } = await admin
        .from("kanban_cards")
        .insert({
          column_id: cols[0].id,
          title: `[Content] ${item.title}`,
          assigned_to: body.assigned_to || null,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (card) {
        await supabase
          .from("creative_content_items")
          .update({ linked_card_id: card.id })
          .eq("id", item.id);
      }
    }
  } catch {
    // Kanban linking is best-effort — don't fail the request
  }

  return NextResponse.json({ data: { id: item.id, title: item.title } }, { status: 201 });
}

// PATCH /api/creatives/content-items
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Auto-set linked_at when linking to published content
  if (
    updates.linked_post_id ||
    updates.linked_ad_asset_id ||
    updates.linked_external_url
  ) {
    updates.linked_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("creative_content_items")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE /api/creatives/content-items?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("creative_content_items")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
