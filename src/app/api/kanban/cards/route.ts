import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";
import { kanbanCardPostSchema, kanbanCardPatchSchema } from "@/lib/api/schemas";

// POST /api/kanban/cards — create card
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(kanbanCardPostSchema, raw);
  if (validationError) return validationError;

  const { column_id, title, description, assigned_to, due_date, priority } = body;

  const { data, error } = await supabase
    .from("kanban_cards")
    .insert({
      column_id,
      title,
      description: description || null,
      assigned_to: assigned_to || null,
      due_date: due_date || null,
      priority: priority ?? "medium",
      sort_order: 0,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify assignee if set
  if (assigned_to && assigned_to !== currentUser.id) {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      user_id: assigned_to,
      type: "kanban",
      title: "Task assigned",
      body: `You were assigned: "${title}"`,
      link_url: null,
    });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

// PATCH /api/kanban/cards — update or move card
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(kanbanCardPatchSchema, raw);
  if (validationError) return validationError;

  const { id, ...updates } = body;

  const patch: Record<string, unknown> = {};
  if (updates.column_id !== undefined) patch.column_id = updates.column_id;
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.assigned_to !== undefined) patch.assigned_to = updates.assigned_to;
  if (updates.due_date !== undefined) patch.due_date = updates.due_date;
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order;

  const { error } = await supabase.from("kanban_cards").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync completion + linked records when card moves columns
  if (updates.column_id !== undefined) {
    const { data: destCol } = await supabase
      .from("kanban_columns")
      .select("name, is_default")
      .eq("id", updates.column_id)
      .single();

    const colName = destCol?.name?.toLowerCase().trim() ?? "";
    const isGenericDone = destCol?.is_default && colName === "done";

    const CREATIVES_STATUSES = ["idea", "in_production", "submitted", "approved", "scheduled", "published", "archived"];
    const isCreativesColumn = destCol?.is_default && CREATIVES_STATUSES.includes(colName.replace(/ /g, "_"));

    // Set completed_at for terminal columns
    const isCompletionColumn = isGenericDone || colName === "published" || colName === "archived";
    const completedAt = isCompletionColumn ? new Date().toISOString() : null;
    await supabase
      .from("kanban_cards")
      .update({ completed_at: completedAt })
      .eq("id", id);

    // Sync creative_content_items
    if (isCreativesColumn) {
      const contentStatus = colName.replace(/ /g, "_");
      await supabase
        .from("creative_content_items")
        .update({ status: contentStatus })
        .eq("linked_card_id", id);
    } else if (isGenericDone) {
      await supabase
        .from("creative_content_items")
        .update({ status: "approved" })
        .eq("linked_card_id", id);
    } else {
      await supabase
        .from("creative_content_items")
        .update({ status: "in_production" })
        .eq("linked_card_id", id);
    }

    // Sync ad_requests
    if (isGenericDone || colName === "approved") {
      await supabase
        .from("ad_requests")
        .update({ status: "approved" })
        .eq("linked_card_id", id);
    } else if (colName === "review" || colName === "submitted") {
      await supabase
        .from("ad_requests")
        .update({ status: "review" })
        .eq("linked_card_id", id);
    } else {
      await supabase
        .from("ad_requests")
        .update({ status: "in_progress" })
        .eq("linked_card_id", id);
    }
  }

  // Notify new assignee
  if (updates.assigned_to && updates.assigned_to !== currentUser.id) {
    const admin = createAdminClient();
    const { data: card } = await supabase
      .from("kanban_cards")
      .select("title")
      .eq("id", id)
      .single();
    if (card) {
      await admin.from("notifications").insert({
        user_id: updates.assigned_to,
        type: "kanban",
        title: "Task assigned",
        body: `You were assigned: "${card.title}"`,
        link_url: null,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/kanban/cards?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("kanban_cards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
