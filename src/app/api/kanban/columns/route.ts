import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";
import { kanbanColumnPostSchema } from "@/lib/api/schemas";

// POST /api/kanban/columns — add column to board
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(kanbanColumnPostSchema, raw);
  if (validationError) return validationError;

  const { board_id, name, sort_order } = body;

  if (!isManagerOrAbove(currentUser)) {
    const { data: board } = await supabase
      .from("kanban_boards")
      .select("scope, owner_id")
      .eq("id", board_id)
      .single();
    if (!board || board.scope !== "personal" || board.owner_id !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("kanban_columns")
    .insert({ board_id, name, sort_order: sort_order ?? 99 })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

// DELETE /api/kanban/columns?id=xxx — manager+ or personal-board owner
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: col, error: fetchErr } = await supabase
    .from("kanban_columns")
    .select("is_default, kanban_boards(scope, owner_id)")
    .eq("id", id)
    .single();

  if (fetchErr || !col) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isManagerOrAbove(currentUser)) {
    const board = col.kanban_boards as unknown as { scope: string; owner_id: string | null } | null;
    if (!board || board.scope !== "personal" || board.owner_id !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (col.is_default) return NextResponse.json({ error: "Default columns cannot be deleted" }, { status: 403 });

  const { error } = await supabase.from("kanban_columns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
