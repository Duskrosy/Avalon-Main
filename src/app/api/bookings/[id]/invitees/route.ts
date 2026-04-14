import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// POST /api/bookings/[id]/invitees — set invitees (replaces all)
export async function POST(req: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { user_ids } = body;

  if (!Array.isArray(user_ids)) {
    return NextResponse.json({ error: "user_ids array required" }, { status: 400 });
  }

  // Delete existing invitees
  await supabase.from("booking_invitees").delete().eq("booking_id", bookingId);

  // Insert new invitees
  if (user_ids.length > 0) {
    const { error } = await supabase
      .from("booking_invitees")
      .insert(user_ids.map((user_id: string) => ({ booking_id: bookingId, user_id })));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
