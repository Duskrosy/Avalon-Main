import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// POST /api/birthday-cards/[personId]/messages — add or update own message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cannot sign your own card
  if (currentUser.id === personId) {
    return NextResponse.json({ error: "You cannot sign your own birthday card" }, { status: 400 });
  }

  const body = await req.json();
  const { message, gif_url, emoji } = body as { message?: string; gif_url?: string; emoji?: string };

  if (!message || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > 280) {
    return NextResponse.json({ error: "Message too long (max 280 characters)" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Signing is only allowed on the actual birthday day
  const { data: person } = await admin
    .from("profiles")
    .select("birthday")
    .eq("id", personId)
    .maybeSingle();

  if (!person?.birthday) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  const now  = new Date();
  const bday = new Date(person.birthday);
  const bdayThisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  bdayThisYear.setHours(0, 0, 0, 0);
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  if (bdayThisYear.getTime() !== todayMidnight.getTime()) {
    return NextResponse.json(
      { error: "The birthday has passed — the card is now closed for new messages" },
      { status: 410 }
    );
  }

  const year = now.getFullYear();

  // Get the card for this year
  const { data: card } = await admin
    .from("birthday_cards")
    .select("id, expires_at")
    .eq("person_id", personId)
    .eq("year", year)
    .maybeSingle();

  if (!card) {
    return NextResponse.json({ error: "Birthday card not found" }, { status: 404 });
  }

  // Upsert — one message per author per card
  const { data: msg, error } = await admin
    .from("birthday_messages")
    .upsert(
      {
        card_id: card.id,
        author_id: currentUser.id,
        message: message.trim(),
        gif_url: gif_url ?? null,
        emoji: emoji ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "card_id,author_id" }
    )
    .select("id, author_id, message, gif_url, emoji, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: msg });
}

// DELETE /api/birthday-cards/[personId]/messages — remove own message
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const year = new Date().getFullYear();

  const { data: card } = await admin
    .from("birthday_cards")
    .select("id")
    .eq("person_id", personId)
    .eq("year", year)
    .maybeSingle();

  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const { error } = await admin
    .from("birthday_messages")
    .delete()
    .eq("card_id", card.id)
    .eq("author_id", currentUser.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Message removed" });
}
