import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// GET /api/kanban/cards/[id]/values — get field values for a card
export async function GET(req: NextRequest, { params }: Params) {
  const { id: cardId } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("kanban_card_field_values")
    .select(`
      id,
      field_definition_id,
      value_text,
      value_number,
      value_date,
      value_boolean,
      value_json,
      field_definition:kanban_field_definitions(id, name, field_type, options)
    `)
    .eq("card_id", cardId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/kanban/cards/[id]/values — set field values for a card (bulk upsert)
export async function POST(req: NextRequest, { params }: Params) {
  const { id: cardId } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { values } = body;

  if (!Array.isArray(values)) {
    return NextResponse.json({ error: "values array required" }, { status: 400 });
  }

  // Upsert each value
  const results = [];
  for (const val of values) {
    const { field_definition_id, value_text, value_number, value_date, value_boolean, value_json } = val;

    if (!field_definition_id) continue;

    const { data, error } = await supabase
      .from("kanban_card_field_values")
      .upsert(
        {
          card_id: cardId,
          field_definition_id,
          value_text: value_text ?? null,
          value_number: value_number ?? null,
          value_date: value_date ?? null,
          value_boolean: value_boolean ?? null,
          value_json: value_json ?? null,
        },
        { onConflict: "card_id,field_definition_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    results.push(data);
  }

  return NextResponse.json(results);
}

// PATCH /api/kanban/cards/[id]/values — update a single field value
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: cardId } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { field_definition_id, value_text, value_number, value_date, value_boolean, value_json } = body;

  if (!field_definition_id) {
    return NextResponse.json({ error: "field_definition_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("kanban_card_field_values")
    .upsert(
      {
        card_id: cardId,
        field_definition_id,
        value_text: value_text ?? null,
        value_number: value_number ?? null,
        value_date: value_date ?? null,
        value_boolean: value_boolean ?? null,
        value_json: value_json ?? null,
      },
      { onConflict: "card_id,field_definition_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
