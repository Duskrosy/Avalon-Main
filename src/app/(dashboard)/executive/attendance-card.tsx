type Props = {
  headcount: number;
  onLeaveToday: number;
};

export function AttendanceCard({ headcount, onLeaveToday }: Props) {
  const working = headcount - onLeaveToday;
  const allIn = onLeaveToday === 0;
  const pctOut = headcount > 0 ? (onLeaveToday / headcount) * 100 : 0;

  const accent = allIn ? "green" : pctOut > 20 ? "red" : pctOut > 10 ? "amber" : "none";
  const bg =
    accent === "green" ? "bg-[var(--color-success-light)] border-green-200" :
    accent === "red"   ? "bg-[var(--color-error-light)] border-red-200" :
    accent === "amber" ? "bg-[var(--color-warning-light)] border-amber-200" :
    "bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]";

  return (
    <div className={`rounded-[var(--radius-lg)] border p-5 h-full ${bg}`}>
      <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">Attendance</p>
      {allIn ? (
        <>
          <p className="text-2xl font-bold text-[var(--color-success)]">Everyone is in today!</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{headcount} team members</p>
        </>
      ) : (
        <>
          <p className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">{working} / {headcount}</p>
          <p className={`text-xs mt-1 font-medium ${accent === "red" ? "text-[var(--color-error)]" : accent === "amber" ? "text-[var(--color-warning)]" : "text-[var(--color-text-tertiary)]"}`}>
            {onLeaveToday} {onLeaveToday === 1 ? "person" : "people"} on leave today
          </p>
        </>
      )}
    </div>
  );
}
