import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

const ALLOWED_REACTIONS = new Set(["❤️", "😂", "🎉", "🔥", "🥳", "👏"]);

// ─── POST — add or update own message (birthday day only) ─────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (currentUser.id === personId)
    return NextResponse.json({ error: "You cannot sign your own birthday card" }, { status: 400 });

  const body = await req.json();
  const { message, gif_url, emoji } = body as { message?: string; gif_url?: string; emoji?: string };

  if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  if (message.length > 280) return NextResponse.json({ error: "Message too long (max 280 characters)" }, { status: 400 });

  const admin = createAdminClient();
  const { data: person } = await admin.from("profiles").select("birthday").eq("id", personId).maybeSingle();
  if (!person?.birthday) return NextResponse.json({ error: "Person not found" }, { status: 404 });

  const now           = new Date();
  const bday          = new Date(person.birthday);
  const bdayThisYear  = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  bdayThisYear.setHours(0, 0, 0, 0);
  const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0);

  if (bdayThisYear.getTime() !== todayMidnight.getTime())
    return NextResponse.json({ error: "The birthday has passed — the card is now closed for new messages" }, { status: 410 });

  const { data: card } = await admin.from("birthday_cards").select("id").eq("person_id", personId).eq("year", now.getFullYear()).maybeSingle();
  if (!card) return NextResponse.json({ error: "Birthday card not found" }, { status: 404 });

  const { data: msg, error } = await admin
    .from("birthday_messages")
    .upsert(
      { card_id: card.id, author_id: currentUser.id, message: message.trim(), gif_url: gif_url ?? null, emoji: emoji ?? null, updated_at: new Date().toISOString() },
      { onConflict: "card_id,author_id" }
    )
    .select("id, author_id, message, gif_url, emoji, reactions, created_at, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: msg });
}

// ─── PATCH — toggle an emoji reaction on a message ────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { messageId, emoji } = body as { messageId?: string; emoji?: string };
  if (!messageId || !emoji) return NextResponse.json({ error: "messageId and emoji required" }, { status: 400 });
  if (!ALLOWED_REACTIONS.has(emoji)) return NextResponse.json({ error: "Reaction not allowed" }, { status: 400 });

  const admin = createAdminClient();

  // Verify the message belongs to a card for this person
  const { data: msg } = await admin
    .from("birthday_messages")
    .select("id, reactions, card:birthday_cards!card_id(person_id, expires_at)")
    .eq("id", messageId)
    .maybeSingle();

  if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const card = msg.card as any;
  if (card?.person_id !== personId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (new Date(card.expires_at) < new Date()) return NextResponse.json({ error: "Card expired" }, { status: 410 });

  // Toggle reaction
  const reactions: Record<string, string[]> = (msg.reactions as Record<string, string[]>) ?? {};
  const users   = reactions[emoji] ?? [];
  const idx     = users.indexOf(currentUser.id);
  if (idx >= 0) {
    users.splice(idx, 1);
    if (users.length === 0) delete reactions[emoji];
    else reactions[emoji] = users;
  } else {
    reactions[emoji] = [...users, currentUser.id];
  }

  const { error } = await admin.from("birthday_messages").update({ reactions }).eq("id", messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reactions });
}

// ─── DELETE — remove message(s) ───────────────────────────────────────────────
// Author: can delete own message within 7-day card window
// OPS:    can delete any specific message (?messageId=xxx) or all (?all=true)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin     = createAdminClient();
  const year      = new Date().getFullYear();
  const url       = new URL(req.url);
  const all       = url.searchParams.get("all") === "true";
  const messageId = url.searchParams.get("messageId");
  const userIsOps = isOps(currentUser);

  const { data: card } = await admin.from("birthday_cards").select("id, expires_at").eq("person_id", personId).eq("year", year).maybeSingle();
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  if (new Date(card.expires_at) < new Date())
    return NextResponse.json({ error: "Card has expired" }, { status: 410 });

  // OPS: delete all messages
  if (all) {
    if (!userIsOps) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const { error } = await admin.from("birthday_messages").delete().eq("card_id", card.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ message: "All messages deleted" });
  }

  // OPS: delete a specific message by ID
  if (messageId) {
    if (!userIsOps) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const { error } = await admin.from("birthday_messages").delete().eq("id", messageId).eq("card_id", card.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ message: "Message deleted" });
  }

  // Author: delete own message
  const { error } = await admin.from("birthday_messages").delete().eq("card_id", card.id).eq("author_id", currentUser.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Message removed" });
}
