import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/rooms
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, capacity, location, is_active, open_time, close_time, slot_duration")
    .eq("is_active", true)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/rooms — OPS only
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, capacity, location, open_time, close_time, slot_duration } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const insertData: Record<string, unknown> = {
    name,
    capacity: capacity ?? null,
    location: location ?? null,
  };
  if (open_time) insertData.open_time = open_time;
  if (close_time) insertData.close_time = close_time;
  if (slot_duration && [15, 30, 60].includes(slot_duration)) insertData.slot_duration = slot_duration;

  const { data, error } = await supabase
    .from("rooms")
    .insert(insertData)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

// PATCH /api/rooms?id=xxx — OPS only, update room settings
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.capacity !== undefined) updates.capacity = body.capacity;
  if (body.location !== undefined) updates.location = body.location;
  if (body.open_time !== undefined) updates.open_time = body.open_time;
  if (body.close_time !== undefined) updates.close_time = body.close_time;
  if (body.slot_duration !== undefined && [15, 30, 60].includes(body.slot_duration)) {
    updates.slot_duration = body.slot_duration;
  }
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("rooms")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
