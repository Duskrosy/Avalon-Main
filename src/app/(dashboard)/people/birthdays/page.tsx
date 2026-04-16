import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
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
  daysUntil: number;        // ≥0 = future/today; negative = days ago
  daysAgo: number | null;   // 1–7 if birthday was recent, null otherwise
  age: number | null;
  nextBirthday: string;     // ISO — this year's birthday date for past people
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
    const bdayThisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
    bdayThisYear.setHours(0, 0, 0, 0);

    const msAgo    = today.getTime() - bdayThisYear.getTime();
    const daysAgo  = Math.floor(msAgo / 86400000); // positive = in the past
    const isRecent = daysAgo >= 1 && daysAgo <= 7;

    // For past people use this year's date; for future use next year if needed
    const displayDate = isRecent
      ? new Date(bdayThisYear)
      : (() => {
          const d = new Date(bdayThisYear);
          if (d < today) d.setFullYear(today.getFullYear() + 1);
          return d;
        })();

    const daysUntil = isRecent
      ? -daysAgo
      : Math.ceil((displayDate.getTime() - today.getTime()) / 86400000);

    const age     = differenceInYears(bdayThisYear, bday);
    const safeAge = age >= 1 && age <= 119 ? age : null;

    return {
      id:          p.id,
      first_name:  p.first_name,
      last_name:   p.last_name,
      birthday:    p.birthday!,
      avatar_url:  p.avatar_url ?? null,
      department:  p.department as unknown as { name: string } | null,
      daysUntil,
      daysAgo:     isRecent ? daysAgo : null,
      age:         safeAge,
      nextBirthday: displayDate.toISOString(),
    };
  });

  // ── Buckets ───────────────────────────────────────────────────────────────
  const pastPeople = people
    .filter((p) => p.daysAgo !== null)
    .sort((a, b) => a.daysAgo! - b.daysAgo!);   // most recent first

  const todayPeople = people.filter((p) => p.daysUntil === 0);

  const thisWeek = people.filter((p) => p.daysUntil > 0 && p.daysUntil <= 7);

  const thisMonth = people.filter((p) => {
    if (p.daysUntil <= 7 || p.daysAgo !== null) return false;
    const nb = new Date(p.nextBirthday);
    return nb.getMonth() === today.getMonth() && nb.getFullYear() === today.getFullYear();
  });

  const upcoming = people
    .filter((p) => {
      if (p.daysUntil <= 7 || p.daysAgo !== null) return false;
      const nb = new Date(p.nextBirthday);
      return nb.getMonth() !== today.getMonth() || nb.getFullYear() !== today.getFullYear();
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // ── Own-department-first sort ─────────────────────────────────────────────
  const myDeptName = currentUser.department?.name ?? null;

  function deptFirst(arr: BirthdayPerson[]) {
    return [...arr].sort((a, b) => {
      const aMatch = a.department?.name === myDeptName ? 0 : 1;
      const bMatch = b.department?.name === myDeptName ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return 0; // keep existing sort order within group
    });
  }

  // ── Current user's birthday status ────────────────────────────────────────
  const currentUserBirthday = currentUser.birthday
    ? (() => {
        const b = new Date(currentUser.birthday);
        return b.getMonth() === today.getMonth() && b.getDate() === today.getDate();
      })()
    : false;

  // Celebrant banner — birthday passed 1–7 days ago
  let myRecentBirthdayDaysAgo: number | null = null;
  let myRecentBirthdayPerson: BirthdayPerson | null = null;
  if (!currentUserBirthday && currentUser.birthday) {
    const existing = pastPeople.find((p) => p.id === currentUser.id);
    if (existing && existing.daysAgo !== null) {
      myRecentBirthdayDaysAgo = existing.daysAgo;
      myRecentBirthdayPerson  = existing;
    }
  }

  return (
    <BirthdaysView
      todayPeople={deptFirst(todayPeople)}
      thisWeek={deptFirst(thisWeek)}
      thisMonth={deptFirst(thisMonth)}
      pastPeople={deptFirst(pastPeople)}
      upcoming={deptFirst(upcoming)}
      currentUserId={currentUser.id}
      currentUserIsOps={isOps(currentUser)}
      currentUserHasBirthday={currentUserBirthday}
      myRecentBirthdayDaysAgo={myRecentBirthdayDaysAgo}
      myRecentBirthdayPerson={myRecentBirthdayPerson}
    />
  );
}
