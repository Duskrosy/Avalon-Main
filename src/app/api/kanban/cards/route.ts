import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// POST /api/kanban/cards — create card
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { column_id, title, description, assigned_to, due_date, priority } = body as {
    column_id: string;
    title: string;
    description?: string;
    assigned_to?: string;
    due_date?: string;
    priority?: string;
  };

  if (!column_id || !title) return NextResponse.json({ error: "column_id and title required" }, { status: 400 });

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
      title: "Task assigned",
      message: `You were assigned: "${title}"`,
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

  const body = await req.json();
  const { id, ...updates } = body as {
    id: string;
    column_id?: string;
    title?: string;
    description?: string;
    assigned_to?: string | null;
    due_date?: string | null;
    priority?: string;
    sort_order?: number;
  };

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

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
        title: "Task assigned",
        message: `You were assigned: "${card.title}"`,
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
