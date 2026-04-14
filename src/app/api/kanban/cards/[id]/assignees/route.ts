import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// GET /api/kanban/cards/[id]/assignees — get assignees for a card
export async function GET(req: NextRequest, { params }: Params) {
  const { id: cardId } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("kanban_card_assignees")
    .select(`
      id,
      user_id,
      profile:profiles!user_id(id, first_name, last_name)
    `)
    .eq("card_id", cardId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/kanban/cards/[id]/assignees — set assignees (replaces all)
export async function POST(req: NextRequest, { params }: Params) {
  const { id: cardId } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { user_ids } = body;

  if (!Array.isArray(user_ids)) {
    return NextResponse.json({ error: "user_ids array required" }, { status: 400 });
  }

  // Delete existing assignees
  await supabase
    .from("kanban_card_assignees")
    .delete()
    .eq("card_id", cardId);

  // Insert new assignees
  if (user_ids.length > 0) {
    const { error } = await supabase
      .from("kanban_card_assignees")
      .insert(user_ids.map((user_id: string) => ({ card_id: cardId, user_id })));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Return updated assignees
  const { data } = await supabase
    .from("kanban_card_assignees")
    .select(`
      id,
      user_id,
      profile:profiles!user_id(id, first_name, last_name)
    `)
    .eq("card_id", cardId);

  return NextResponse.json(data);
}
