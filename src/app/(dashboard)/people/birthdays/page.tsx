import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { differenceInYears, format } from "date-fns";

export default async function BirthdaysPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) redirect("/login");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, birthday, department:departments(name)")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("birthday", "is", null)
    .order("first_name");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  type BirthdayPerson = {
    id: string;
    first_name: string;
    last_name: string;
    birthday: string;
    department: { name: string } | null;
    daysUntil: number;
    age: number | null;
    nextBirthday: Date;
  };

  const people: BirthdayPerson[] = (profiles ?? []).map((p) => {
    const bday = new Date(p.birthday!);
    const nextBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
    if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);

    const daysUntil = Math.ceil((nextBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const age = differenceInYears(nextBday, bday);
    const safeAge = age >= 1 && age <= 119 ? age : null;

    return {
      ...p,
      department: p.department as unknown as { name: string } | null,
      daysUntil,
      age: safeAge,
      nextBirthday: nextBday,
    };
  }).sort((a, b) => a.daysUntil - b.daysUntil);

  const todayBdays = people.filter((p) => p.daysUntil === 0);
  const thisWeek   = people.filter((p) => p.daysUntil > 0 && p.daysUntil <= 7);
  const thisMonth  = people.filter((p) => p.daysUntil > 7 && p.daysUntil <= 31);
  const upcoming   = people.filter((p) => p.daysUntil > 31);

  function BirthdayCard({ person }: { person: BirthdayPerson }) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium shrink-0">
          {person.first_name[0]}{person.last_name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {person.first_name} {person.last_name}
            {person.age && (
              <span className="ml-1.5 text-xs font-normal text-gray-400">turns {person.age}</span>
            )}
          </p>
          {person.department && (
            <p className="text-xs text-gray-400">{person.department.name}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-medium text-gray-700">
            {format(person.nextBirthday, "MMM d")}
          </p>
          {person.daysUntil === 0 ? (
            <p className="text-xs text-amber-600 font-medium">🎂 Today!</p>
          ) : (
            <p className="text-xs text-gray-400">in {person.daysUntil}d</p>
          )}
        </div>
      </div>
    );
  }

  function Section({ title, people, emptyMsg }: { title: string; people: BirthdayPerson[]; emptyMsg: string }) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h2>
        {people.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">{emptyMsg}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {people.map((p) => <BirthdayCard key={p.id} person={p} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Birthday Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">Upcoming birthdays across the team</p>
      </div>

      <div className="space-y-8">
        <Section title="🎂 Today" people={todayBdays} emptyMsg="No birthdays today" />
        <Section title="This week" people={thisWeek} emptyMsg="No birthdays this week" />
        <Section title="This month" people={thisMonth} emptyMsg="No more birthdays this month" />
        <Section title="Upcoming" people={upcoming} emptyMsg="Nothing beyond this month" />
      </div>
    </div>
  );
}
