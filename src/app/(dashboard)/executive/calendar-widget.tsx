"use client";

import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday } from "date-fns";

type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
};

const EVENT_COLORS: Record<string, string> = {
  sale_event: "bg-orange-400",
  holiday: "bg-red-400",
  company: "bg-[var(--color-accent)]",
  custom: "bg-[var(--color-text-tertiary)]",
};

export function CalendarWidget({ events, month }: { events: CalendarEvent[]; month: Date }) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const result = [];
    let d = start;
    while (d <= end) {
      result.push(d);
      d = addDays(d, 1);
    }
    return result;
  }, [month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = e.event_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  return (
    <div>
      <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">{format(month, "MMMM yyyy")}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} className="text-[10px] font-medium text-[var(--color-text-tertiary)] pb-1">{d}</div>
        ))}
        {days.map((d, i) => {
          const ds = format(d, "yyyy-MM-dd");
          const evts = eventsByDate.get(ds) ?? [];
          const inMonth = isSameMonth(d, month);
          const today = isToday(d);
          return (
            <div key={i} className={`relative h-8 flex flex-col items-center justify-center rounded-[var(--radius-sm)] ${
              today ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]" :
              inMonth ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)] opacity-40"
            }`} title={evts.map(e => e.title).join(", ") || undefined}>
              <span className="text-xs">{format(d, "d")}</span>
              {evts.length > 0 && (
                <div className="flex gap-0.5 absolute bottom-0.5">
                  {evts.slice(0, 3).map((e, j) => (
                    <span key={j} className={`w-1 h-1 rounded-full ${EVENT_COLORS[e.event_type] ?? EVENT_COLORS.custom}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
