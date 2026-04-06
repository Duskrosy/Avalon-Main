import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const calendarSettingsSchema = z.object({
  show_tasks: z.boolean().optional(),
  show_leaves: z.boolean().optional(),
  show_rooms: z.boolean().optional(),
  show_birthdays: z.boolean().optional(),
  show_posts: z.boolean().optional(),
});

// ─── Default settings ─────────────────────────────────────────────────────────

const DEFAULTS = {
  show_tasks: true,
  show_leaves: true,
  show_rooms: true,
  show_birthdays: true,
  show_posts: true,
};

// ─── GET /api/calendar/settings ───────────────────────────────────────────────
// Returns the current user's calendar settings, or defaults if no row exists.

export async function GET() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error: dbErr } = await supabase
    .from("user_calendar_settings")
    .select("show_tasks, show_leaves, show_rooms, show_birthdays, show_posts, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data ?? DEFAULTS);
}

// ─── POST /api/calendar/settings ──────────────────────────────────────────────
// Upserts the current user's calendar settings.
// Body: { show_tasks, show_leaves, show_rooms, show_birthdays, show_posts }

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = calendarSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { show_tasks, show_leaves, show_rooms, show_birthdays, show_posts } = parsed.data;

  const { data, error: dbErr } = await supabase
    .from("user_calendar_settings")
    .upsert(
      {
        user_id: user.id,
        show_tasks:     show_tasks     ?? DEFAULTS.show_tasks,
        show_leaves:    show_leaves    ?? DEFAULTS.show_leaves,
        show_rooms:     show_rooms     ?? DEFAULTS.show_rooms,
        show_birthdays: show_birthdays ?? DEFAULTS.show_birthdays,
        show_posts:     show_posts     ?? DEFAULTS.show_posts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("show_tasks, show_leaves, show_rooms, show_birthdays, show_posts, updated_at")
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}
