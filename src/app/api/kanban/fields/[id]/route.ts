import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/kanban/fields/[id] — update a field definition
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, is_required, options, default_value, sort_order } = body;

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (is_required !== undefined) updates.is_required = is_required;
  if (options !== undefined) updates.options = options;
  if (default_value !== undefined) updates.default_value = default_value;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("kanban_field_definitions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A field with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/kanban/fields/[id] — delete a field definition (OPS only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isOps(currentUser)) {
    return NextResponse.json({ error: "OPS only — field deletion cascades to all card values" }, { status: 403 });
  }

  const { error } = await supabase
    .from("kanban_field_definitions")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
