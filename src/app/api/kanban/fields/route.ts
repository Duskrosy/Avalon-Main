import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// GET /api/kanban/fields?board_id=xxx — list field definitions for a board
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("board_id");

  if (!boardId) {
    return NextResponse.json({ error: "board_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("kanban_field_definitions")
    .select("*")
    .eq("board_id", boardId)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/kanban/fields — create a field definition
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  const body = await req.json();
  const { board_id, name, field_type, description, is_required, options, default_value } = body;

  if (!board_id || !name || !field_type) {
    return NextResponse.json({ error: "board_id, name, and field_type required" }, { status: 400 });
  }

  // Get max sort_order for this board
  const { data: existing } = await supabase
    .from("kanban_field_definitions")
    .select("sort_order")
    .eq("board_id", board_id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("kanban_field_definitions")
    .insert({
      board_id,
      name,
      field_type,
      description: description || null,
      is_required: is_required ?? false,
      options: options || null,
      default_value: default_value || null,
      sort_order: nextOrder,
      created_by: currentUser.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A field with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
