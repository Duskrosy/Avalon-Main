import { differenceInDays, parseISO } from "date-fns";

type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
};

type Alert = {
  title: string;
  event_type: string;
  daysUntil: number;
  message: string;
};

const TYPE_BADGES: Record<string, { bg: string; text: string }> = {
  sale_event: { bg: "bg-orange-100", text: "text-orange-700" },
  holiday:    { bg: "bg-red-50",     text: "text-red-600" },
  company:    { bg: "bg-[var(--color-accent-light)]", text: "text-[var(--color-accent)]" },
  custom:     { bg: "bg-[var(--color-bg-tertiary)]",  text: "text-[var(--color-text-secondary)]" },
};

export function computeAlerts(events: CalendarEvent[]): Alert[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return events
    .map((e) => {
      const d = parseISO(e.event_date);
      const daysUntil = differenceInDays(d, today);
      if (daysUntil < 0 || daysUntil > 14) return null;

      const timeframe =
        daysUntil === 0 ? "today" :
        daysUntil === 1 ? "tomorrow" :
        daysUntil <= 7  ? `in ${daysUntil} days` :
        daysUntil <= 14 ? "in 2 weeks" : "";

      const action = e.event_type === "sale_event" ? " — prepare campaigns" : "";

      return {
        title: e.title,
        event_type: e.event_type,
        daysUntil,
        message: `${e.title} is ${timeframe}${action}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.daysUntil - b!.daysUntil) as Alert[];
}

export function LookAhead({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-tertiary)] py-4">
        No upcoming events in the next 2 weeks
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Coming Up</p>
      {alerts.map((a, i) => {
        const badge = TYPE_BADGES[a.event_type] ?? TYPE_BADGES.custom;
        return (
          <div key={i} className="flex items-start gap-2.5 py-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize shrink-0 mt-0.5 ${badge.bg} ${badge.text}`}>
              {a.event_type.replace("_", " ")}
            </span>
            <p className="text-sm text-[var(--color-text-primary)]">{a.message}</p>
          </div>
        );
      })}
    </div>
  );
}
