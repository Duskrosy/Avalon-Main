import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";

// Runs at 00:00 UTC = 08:00 Manila (UTC+8)
// 1. Finds all profiles whose birthday is today
// 2. Creates/ensures a birthday_card row (expires in 7 days)
// 3. Sends a notification to every active user

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  const fromCron = isCronRequest(req);
  if (!fromCron) {
    const supabase = await createClient();
    const currentUser = await getCurrentUser(supabase);
    if (!currentUser || !isOps(currentUser)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  // Today in Manila time (UTC+8)
  const now = new Date();
  const manilaOffset = 8 * 60;
  const manilaMs = now.getTime() + (manilaOffset - now.getTimezoneOffset()) * 60_000;
  const manila = new Date(manilaMs);
  const month = manila.getMonth() + 1; // 1-based
  const day   = manila.getDate();
  const year  = manila.getFullYear();

  // Find people whose birthday is today
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, first_name, last_name, birthday")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("birthday", "is", null);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const celebrants = (profiles ?? []).filter((p) => {
    const bday = new Date(p.birthday!);
    return bday.getMonth() + 1 === month && bday.getDate() === day;
  });

  if (celebrants.length === 0) {
    return NextResponse.json({ created: 0, notified: 0, message: "No birthdays today" });
  }

  // Get all active user IDs (to notify everyone)
  const { data: allUsers } = await admin
    .from("profiles")
    .select("id")
    .eq("status", "active")
    .is("deleted_at", null);

  const allUserIds = (allUsers ?? []).map((u) => u.id);

  let cardsCreated = 0;
  let notifsSent   = 0;

  for (const person of celebrants) {
    // Upsert birthday card (expires 7 days after birthday)
    const bdayThisYear = new Date(year, month - 1, day);
    const expiresAt    = new Date(bdayThisYear);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: cardError } = await admin
      .from("birthday_cards")
      .upsert(
        { person_id: person.id, year, expires_at: expiresAt.toISOString() },
        { onConflict: "person_id,year", ignoreDuplicates: true }
      );

    if (!cardError) cardsCreated++;

    // Send a notification to every active user (except the birthday person)
    const recipients = allUserIds.filter((id) => id !== person.id);
    const fullName   = `${person.first_name} ${person.last_name}`;

    const notifs = recipients.map((userId) => ({
      user_id:  userId,
      type:     "birthday",
      title:    `🎂 It's ${person.first_name}'s birthday!`,
      body:     `Wish ${fullName} a happy birthday and sign their card.`,
      link_url: `/people/birthdays`,
      is_read:  false,
    }));

    if (notifs.length > 0) {
      const { error: notifError } = await admin
        .from("notifications")
        .insert(notifs);

      if (!notifError) notifsSent += notifs.length;
    }
  }

  return NextResponse.json({
    created: cardsCreated,
    notified: notifsSent,
    celebrants: celebrants.map((p) => `${p.first_name} ${p.last_name}`),
  });
}
