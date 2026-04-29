import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

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
      creator_profile:profiles!created_by(id, first_name, last_name, avatar_url),
      assignees:content_item_assignees(
        user_id,
        profile:profiles!user_id(id, first_name, last_name, avatar_url)
      )
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

  // Spawning a task from an ad_request is a creatives/manager-only action — we don't
  // want random users linking arbitrary content items to other people's requests.
  if (body.source_request_id) {
    const isCreatives = user.department?.slug === "creatives";
    if (!isManagerOrAbove(user) && !isCreatives) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: item, error } = await supabase
    .from("creative_content_items")
    .insert({
      title: body.title,
      content_type: body.content_type ?? null,
      creative_type: body.creative_type ?? null,
      channel_type: body.channel_type ?? null,
      funnel_stage: body.funnel_stage ?? null,
      creative_angle: body.creative_angle ?? null,
      product_or_collection: body.product_or_collection ?? null,
      campaign_label: body.campaign_label ?? null,
      promo_code: body.promo_code ?? null,
      transfer_link: body.transfer_link ?? null,
      download_link: body.download_link ?? null,
      planned_week_start: body.planned_week_start ?? null,
      date_submitted: body.date_submitted ?? null,
      status: body.status ?? "idea",
      assigned_to: body.assignee_ids?.[0] ?? body.assigned_to ?? null,
      group_label: body.group_label ?? "local",
      source_request_id: body.source_request_id ?? null,
      created_by: user.id,
    })
    .select("id, title")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert junction-table assignees
  if (Array.isArray(body.assignee_ids) && body.assignee_ids.length > 0 && item?.id) {
    const assigneeRows = body.assignee_ids.map((uid: string) => ({
      item_id: item.id,
      user_id: uid,
    }));
    const adminForAssignees = createAdminClient();
    await adminForAssignees.from("content_item_assignees").insert(assigneeRows);
  }

  // Auto-create linked kanban card
  try {
    const admin = createAdminClient();
    const { data: board } = await admin
      .from("kanban_boards")
      .select("id, kanban_columns(id, name, sort_order)")
      .eq("department_id", user.department_id)
      .eq("scope", "team")
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

  // Task 12 — Auto-gather on publish transition.
  // When an item transitions to 'published' without a link already being set
  // in this PATCH (and not yet linked in DB), look for a recent smm_post by
  // one of its assignees. Only auto-link if there's exactly one candidate —
  // ambiguity falls through to the manual Gather flow.
  if (
    updates.status === "published" &&
    !updates.linked_post_id &&
    !updates.linked_external_url &&
    !updates.linked_ad_asset_id
  ) {
    const adminForMatch = createAdminClient();
    const { data: current } = await adminForMatch
      .from("creative_content_items")
      .select("linked_post_id, assigned_to")
      .eq("id", id)
      .single();

    if (current && !current.linked_post_id) {
      const { data: junction } = await adminForMatch
        .from("content_item_assignees")
        .select("user_id")
        .eq("item_id", id);
      const assigneeIds = new Set<string>(
        (junction ?? []).map((r: { user_id: string }) => r.user_id)
      );
      if (current.assigned_to) assigneeIds.add(current.assigned_to);

      if (assigneeIds.size > 0) {
        const threeDaysAgo = new Date(Date.now() - 3 * 86400_000).toISOString();
        // Posts already claimed by any content item — exclude from candidates.
        const { data: claimed } = await adminForMatch
          .from("creative_content_items")
          .select("linked_post_id")
          .not("linked_post_id", "is", null);
        const claimedIds = new Set<string>(
          (claimed ?? [])
            .map((r: { linked_post_id: string | null }) => r.linked_post_id)
            .filter((x): x is string => !!x)
        );

        const { data: candidates } = await adminForMatch
          .from("smm_posts")
          .select("id")
          .eq("status", "published")
          .gte("published_at", threeDaysAgo)
          .in("created_by", Array.from(assigneeIds))
          .order("published_at", { ascending: false })
          .limit(5);

        const unclaimed = (candidates ?? []).filter(
          (p: { id: string }) => !claimedIds.has(p.id)
        );
        if (unclaimed.length === 1) {
          updates.linked_post_id = unclaimed[0].id;
        }
      }
    }
  }

  // Auto-set linked_at when linking to published content
  if (
    updates.linked_post_id ||
    updates.linked_ad_asset_id ||
    updates.linked_external_url
  ) {
    updates.linked_at = new Date().toISOString();
  }
  // Stamp linked_post_gathered_at when any live-content link is newly assigned
  // (powers the Tracker "Gathered ✓" pill + "just linked" pulse).
  // Fires for organic posts (linked_external_url from smm_top_posts.post_url)
  // and Meta ads (linked_ad_asset_id).
  if (updates.linked_post_id || updates.linked_ad_asset_id || updates.linked_external_url) {
    updates.linked_post_gathered_at = new Date().toISOString();
  } else if (
    updates.linked_post_id === null &&
    updates.linked_ad_asset_id === null &&
    updates.linked_external_url === null
  ) {
    updates.linked_post_gathered_at = null;
  }

  const admin = createAdminClient();

  if (Array.isArray(body.assignee_ids)) {
    // Sync junction table
    await admin.from("content_item_assignees").delete().eq("item_id", id);
    if (body.assignee_ids.length > 0) {
      await admin.from("content_item_assignees").insert(
        body.assignee_ids.map((uid: string) => ({ item_id: id, user_id: uid }))
      );
    }
    // Keep assigned_to in sync
    updates.assigned_to = body.assignee_ids[0] ?? null;
    delete updates.assignee_ids; // don't pass to the main update
  }

  const { error } = await admin
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
