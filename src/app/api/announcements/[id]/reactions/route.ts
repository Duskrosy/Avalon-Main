import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/announcements/[id]/reactions — fetch all reactions for an announcement
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("announcement_reactions")
    .select("emoji, user_id, profiles!user_id(first_name, last_name)")
    .eq("announcement_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by emoji: { "👍": [{ user_id, first_name, last_name }], ... }
  const grouped: Record<string, { user_id: string; name: string }[]> = {};
  for (const r of data ?? []) {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    const profile = r.profiles as unknown as { first_name: string; last_name: string } | null;
    grouped[r.emoji].push({
      user_id: r.user_id,
      name: profile ? `${profile.first_name} ${profile.last_name}` : "Unknown",
    });
  }

  return NextResponse.json(grouped);
}

// POST /api/announcements/[id]/reactions — toggle a reaction (add or remove)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { emoji } = await req.json();
  if (!emoji || typeof emoji !== "string") {
    return NextResponse.json({ error: "emoji required" }, { status: 400 });
  }

  // Check if reaction already exists
  const { data: existing } = await supabase
    .from("announcement_reactions")
    .select("id")
    .eq("announcement_id", id)
    .eq("user_id", currentUser.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    // Remove reaction
    await supabase.from("announcement_reactions").delete().eq("id", existing.id);
  } else {
    // Add reaction
    const { error } = await supabase.from("announcement_reactions").insert({
      announcement_id: id,
      user_id: currentUser.id,
      emoji,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return updated reactions for this announcement
  const { data: updated } = await supabase
    .from("announcement_reactions")
    .select("emoji, user_id, profiles!user_id(first_name, last_name)")
    .eq("announcement_id", id);

  const grouped: Record<string, { user_id: string; name: string }[]> = {};
  for (const r of updated ?? []) {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    const profile = r.profiles as unknown as { first_name: string; last_name: string } | null;
    grouped[r.emoji].push({
      user_id: r.user_id,
      name: profile ? `${profile.first_name} ${profile.last_name}` : "Unknown",
    });
  }

  return NextResponse.json(grouped);
}
