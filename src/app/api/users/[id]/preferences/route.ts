import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

const VALID_THEMES = ["light", "dark", "system", "avalon"];
const VALID_ACCENTS = ["blue", "violet", "teal", "rose", "amber", "emerald", "orange", "indigo"];
const VALID_DENSITIES = ["comfortable", "compact"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.id !== id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const update: Record<string, string | boolean> = {};

  if (body.theme && VALID_THEMES.includes(body.theme)) update.theme = body.theme;
  if (body.accent && VALID_ACCENTS.includes(body.accent)) update.accent = body.accent;
  if (body.density && VALID_DENSITIES.includes(body.density)) update.density = body.density;
  if (typeof body.avalon_unlocked === "boolean") update.avalon_unlocked = body.avalon_unlocked;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid preferences provided" }, { status: 400 });
  }

  // Read existing preferences, merge, and update
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_preferences")
    .eq("id", id)
    .single();

  const existing = (profile?.user_preferences as Record<string, string | boolean>) ?? {};
  const merged = { ...existing, ...update };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ user_preferences: merged })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
