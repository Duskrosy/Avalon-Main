import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// PATCH /api/kanban/columns/[id] — rename column
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  if (body.name !== undefined) {
    const { data: col } = await supabase
      .from("kanban_columns")
      .select("is_default")
      .eq("id", id)
      .single();
    if (col?.is_default) {
      return NextResponse.json({ error: "Default columns cannot be renamed" }, { status: 403 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
  if (body.color !== undefined) patch.color = body.color;

  const { error } = await supabase.from("kanban_columns").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/kanban/columns/[id] — delete column by URL param
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: col, error: fetchErr } = await supabase
    .from("kanban_columns")
    .select("is_default")
    .eq("id", id)
    .single();

  if (fetchErr || !col) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (col.is_default) return NextResponse.json({ error: "Default columns cannot be deleted" }, { status: 403 });

  const { error } = await supabase.from("kanban_columns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
