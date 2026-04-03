import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { trackEventServer } from "@/lib/observability/track";
import { validateBody } from "@/lib/api/validate";
import { bookingPostSchema } from "@/lib/api/schemas";

// GET /api/bookings?date=YYYY-MM-DD or ?room_id=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const roomId = searchParams.get("room_id");

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let query = supabase
    .from("room_bookings")
    .select(`
      id, title, start_time, end_time, notes, created_at,
      room:rooms(id, name),
      booked_by_profile:profiles!booked_by(id, first_name, last_name)
    `)
    .order("start_time");

  if (roomId) query = query.eq("room_id", roomId);

  if (date) {
    // All bookings for the day (UTC)
    const start = `${date}T00:00:00Z`;
    const end   = `${date}T23:59:59Z`;
    query = query.gte("start_time", start).lte("start_time", end);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/bookings — create booking with overlap check
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(bookingPostSchema, raw);
  if (validationError) return validationError;

  const { room_id, title, start_time, end_time, notes } = body;

  const start = new Date(start_time);
  const end = new Date(end_time);

  if (end <= start) return NextResponse.json({ error: "end_time must be after start_time" }, { status: 400 });
  if (start < new Date()) return NextResponse.json({ error: "Cannot book in the past" }, { status: 400 });

  // Overlap check
  const { data: conflicts } = await supabase
    .from("room_bookings")
    .select("id")
    .eq("room_id", room_id)
    .lt("start_time", end_time)
    .gt("end_time", start_time);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Room is already booked during that time" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("room_bookings")
    .insert({
      room_id,
      title,
      start_time,
      end_time,
      notes: notes || null,
      booked_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  trackEventServer(supabase, currentUser.id, "room.booked", {
    module: "scheduling",
    properties: { room_id },
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

// DELETE /api/bookings?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS handles own-or-OPS check
  const { error } = await supabase.from("room_bookings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
