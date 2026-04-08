import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/birthday-cards/[personId]
// Returns the active birthday card (current year) + all messages, creating the card if missing.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Verify target person exists and has a birthday today (card only usable on birthday day ± 7d)
  const { data: person } = await admin
    .from("profiles")
    .select("id, first_name, last_name, birthday")
    .eq("id", personId)
    .eq("status", "active")
    .maybeSingle();

  if (!person || !person.birthday) {
    return NextResponse.json({ error: "Person not found or has no birthday" }, { status: 404 });
  }

  const now = new Date();
  const year = now.getFullYear();

  // Upsert card for this year (cron creates it at midnight but upsert handles manual open too)
  const birthday = new Date(person.birthday);
  const bdayThisYear = new Date(year, birthday.getMonth(), birthday.getDate());
  const expiresAt = new Date(bdayThisYear);
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: card, error: cardError } = await admin
    .from("birthday_cards")
    .upsert(
      { person_id: personId, year, expires_at: expiresAt.toISOString() },
      { onConflict: "person_id,year", ignoreDuplicates: false }
    )
    .select("id, expires_at, created_at")
    .maybeSingle();

  if (cardError || !card) {
    // upsert may return null on ignoreDuplicates — fetch existing
    const { data: existing } = await admin
      .from("birthday_cards")
      .select("id, expires_at, created_at")
      .eq("person_id", personId)
      .eq("year", year)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Failed to create birthday card" }, { status: 500 });
    }

    const { data: msgs } = await admin
      .from("birthday_messages")
      .select("id, author_id, message, gif_url, emoji, created_at, updated_at, author:profiles!author_id(id, first_name, last_name, avatar_url)")
      .eq("card_id", existing.id)
      .order("created_at");

    return NextResponse.json({ card: existing, messages: msgs ?? [] });
  }

  const { data: msgs } = await admin
    .from("birthday_messages")
    .select("id, author_id, message, gif_url, emoji, created_at, updated_at, author:profiles!author_id(id, first_name, last_name, avatar_url)")
    .eq("card_id", card.id)
    .order("created_at");

  return NextResponse.json({ card, messages: msgs ?? [] });
}
