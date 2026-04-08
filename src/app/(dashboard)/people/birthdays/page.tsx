import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { differenceInYears } from "date-fns";
import { BirthdaysView } from "./birthdays-view";

export type BirthdayPerson = {
  id: string;
  first_name: string;
  last_name: string;
  birthday: string;
  avatar_url: string | null;
  department: { name: string } | null;
  daysUntil: number;
  age: number | null;
  nextBirthday: string; // ISO date string (safe to pass to client)
};

export default async function BirthdaysPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, birthday, avatar_url, department:departments(name)")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("birthday", "is", null)
    .order("first_name");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const people: BirthdayPerson[] = (profiles ?? []).map((p) => {
    const bday = new Date(p.birthday!);
    const nextBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
    if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);

    const daysUntil = Math.ceil(
      (nextBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const age = differenceInYears(nextBday, bday);
    const safeAge = age >= 1 && age <= 119 ? age : null;

    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      birthday: p.birthday!,
      avatar_url: p.avatar_url ?? null,
      department: p.department as unknown as { name: string } | null,
      daysUntil,
      age: safeAge,
      nextBirthday: nextBday.toISOString(),
    };
  }).sort((a, b) => a.daysUntil - b.daysUntil);

  // ── Correct calendar-month bucketing ──────────────────────────────────────
  // "This Month" = same calendar month as today, more than 7 days away.
  // "Upcoming"   = anything beyond the current calendar month.
  const todayPeople  = people.filter((p) => p.daysUntil === 0);
  const thisWeek     = people.filter((p) => p.daysUntil > 0 && p.daysUntil <= 7);
  const thisMonth    = people.filter((p) => {
    if (p.daysUntil <= 7) return false;
    const nb = new Date(p.nextBirthday);
    return (
      nb.getMonth()    === today.getMonth() &&
      nb.getFullYear() === today.getFullYear()
    );
  });
  const upcoming     = people.filter((p) => {
    if (p.daysUntil <= 7) return false;
    const nb = new Date(p.nextBirthday);
    return (
      nb.getMonth()    !== today.getMonth() ||
      nb.getFullYear() !== today.getFullYear()
    );
  });

  // Is today the current user's birthday?
  const currentUserBirthday = currentUser.birthday
    ? (() => {
        const b = new Date(currentUser.birthday);
        return b.getMonth() === today.getMonth() && b.getDate() === today.getDate();
      })()
    : false;

  return (
    <BirthdaysView
      todayPeople={todayPeople}
      thisWeek={thisWeek}
      thisMonth={thisMonth}
      upcoming={upcoming}
      currentUserId={currentUser.id}
      currentUserHasBirthday={currentUserBirthday}
    />
  );
}
