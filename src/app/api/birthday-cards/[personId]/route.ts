import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// ─── Access rules ─────────────────────────────────────────────────────────────
// Birthday day (daysUntil === 0):  everyone can view + sign
// 1–7 days AFTER birthday:         only the birthday person can view (read-only)
// After expires_at (> 7 days):     card is gone for everyone
// Before birthday:                 card doesn't exist yet

function birthdayStatus(birthdayStr: string, now: Date): "future" | "today" | "past" | "expired" {
  const bday = new Date(birthdayStr);
  const thisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  thisYear.setHours(0, 0, 0, 0);

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  const expiresAt = new Date(thisYear);
  expiresAt.setDate(expiresAt.getDate() + 7);

  if (thisYear > todayMidnight)  return "future";
  if (thisYear.getTime() === todayMidnight.getTime()) return "today";
  if (now > expiresAt)           return "expired";
  return "past";
}

// GET /api/birthday-cards/[personId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: person } = await admin
    .from("profiles")
    .select("id, first_name, last_name, birthday")
    .eq("id", personId)
    .eq("status", "active")
    .maybeSingle();

  if (!person || !person.birthday) {
    return NextResponse.json({ error: "Person not found or has no birthday" }, { status: 404 });
  }

  const now    = new Date();
  const year   = now.getFullYear();
  const status = birthdayStatus(person.birthday, now);

  // Fully expired — card history gone for everyone
  if (status === "expired") {
    return NextResponse.json({ error: "This birthday card has expired" }, { status: 410 });
  }

  // Birthday in the future — no card yet
  if (status === "future") {
    return NextResponse.json({ card: null, messages: [] });
  }

  // Birthday has passed (1–7 days ago) — only the birthday person can view
  if (status === "past" && currentUser.id !== personId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Upsert card (cron creates it at midnight; this handles the case where cron hasn't run yet)
  const bday = new Date(person.birthday);
  const bdayThisYear = new Date(year, bday.getMonth(), bday.getDate());
  const expiresAt    = new Date(bdayThisYear);
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: card, error: cardError } = await admin
    .from("birthday_cards")
    .upsert(
      { person_id: personId, year, expires_at: expiresAt.toISOString() },
      { onConflict: "person_id,year", ignoreDuplicates: false }
    )
    .select("id, expires_at, created_at")
    .maybeSingle();

  const cardId = card?.id ?? (await admin
    .from("birthday_cards")
    .select("id, expires_at, created_at")
    .eq("person_id", personId)
    .eq("year", year)
    .maybeSingle()
    .then((r) => r.data?.id));

  if (cardError && !cardId) {
    return NextResponse.json({ error: "Failed to fetch birthday card" }, { status: 500 });
  }

  const resolvedCard = card ?? (await admin
    .from("birthday_cards")
    .select("id, expires_at, created_at")
    .eq("person_id", personId)
    .eq("year", year)
    .maybeSingle()
    .then((r) => r.data));

  if (!resolvedCard) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const { data: msgs } = await admin
    .from("birthday_messages")
    .select("id, author_id, message, gif_url, emoji, created_at, updated_at, author:profiles!author_id(id, first_name, last_name, avatar_url)")
    .eq("card_id", resolvedCard.id)
    .order("created_at");

  // Tell the client whether signing is still open
  return NextResponse.json({
    card:         resolvedCard,
    messages:     msgs ?? [],
    canSign:      status === "today",   // only sign on the actual birthday
    birthdayStatus: status,             // "today" | "past"
  });
}
