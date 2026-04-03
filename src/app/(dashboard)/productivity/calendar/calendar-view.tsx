"use client";

import { useState, useCallback } from "react";
import { format, getDaysInMonth, startOfMonth, getDay } from "date-fns";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  end_date?: string;
  type: "leave" | "booking" | "birthday" | "task";
  color: string;
};

type Filter = { leave: boolean; booking: boolean; birthday: boolean; task: boolean };

const TYPE_LABELS = {
  leave: "Leaves",
  booking: "Room bookings",
  birthday: "Birthdays",
  task: "Tasks",
};

const TYPE_COLORS = {
  leave: "bg-amber-400",
  booking: "bg-blue-500",
  birthday: "bg-pink-400",
  task: "bg-purple-500",
};

export function CalendarView({
  initialMonth,
  initialEvents,
}: {
  initialMonth: string;
  initialEvents: CalendarEvent[];
}) {
  const [month, setMonth] = useState(initialMonth);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filter>({ leave: true, booking: true, birthday: true, task: true });

  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const daysInMonth = getDaysInMonth(firstDay);
  const startDow = getDay(startOfMonth(firstDay)); // 0=Sun

  const navigate = useCallback(async (delta: number) => {
    const d = new Date(year, mon - 1 + delta, 1);
    const m = d.toISOString().slice(0, 7);
    setMonth(m);
    setSelected(null);
    setLoading(true);
    const res = await fetch(`/api/calendar?month=${m}`);
    if (res.ok) setEvents(await res.json());
    setLoading(false);
  }, [year, mon]);

  const goToday = () => {
    const today = new Date().toISOString().slice(0, 7);
    if (today !== month) navigate(0);
  };

  // Group events by date, applying filters
  const byDate = events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    if (!filters[e.type]) return acc;
    // For multi-day events, add to each day in range
    if (e.end_date && e.end_date !== e.date) {
      const start = new Date(e.date);
      const end   = new Date(e.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split("T")[0];
        if (!acc[key]) acc[key] = [];
        acc[key].push(e);
      }
    } else {
      if (!acc[e.date]) acc[e.date] = [];
      acc[e.date].push(e);
    }
    return acc;
  }, {});

  const todayStr = new Date().toISOString().split("T")[0];
  const selectedEvents = selected ? (byDate[selected] ?? []) : [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {format(firstDay, "MMMM yyyy")}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={() => navigate(-1)}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            ‹
          </button>
          <button
            onClick={() => navigate(1)}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            ›
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(filters) as (keyof Filter)[]).map((type) => (
          <button
            key={type}
            onClick={() => setFilters((f) => ({ ...f, [type]: !f[type] }))}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filters[type]
                ? "border-transparent bg-gray-900 text-white"
                : "border-gray-200 text-gray-400"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${filters[type] ? "bg-white/70" : TYPE_COLORS[type]}`} />
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
            ) : (
              <div className="grid grid-cols-7">
                {/* Empty cells for start day-of-week offset */}
                {Array.from({ length: startDow }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-24 border-b border-r border-gray-50" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${month}-${String(day).padStart(2, "0")}`;
                  const dayEvents = byDate[dateStr] ?? [];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selected;

                  return (
                    <div
                      key={day}
                      onClick={() => setSelected(isSelected ? null : dateStr)}
                      className={`h-24 border-b border-r border-gray-50 p-1.5 cursor-pointer transition-colors ${
                        isSelected ? "bg-gray-50" : "hover:bg-gray-50/50"
                      }`}
                    >
                      <div
                        className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                          isToday ? "bg-gray-900 text-white" : "text-gray-500"
                        }`}
                      >
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            className="text-xs px-1 py-0.5 rounded text-white truncate"
                            style={{ backgroundColor: e.color }}
                          >
                            {e.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-gray-400 pl-1">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: selected day or month summary */}
        <div>
          {selected ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                {format(new Date(selected), "EEEE, d MMMM")}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-gray-400">Nothing scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((e) => (
                    <div key={e.id} className="flex items-start gap-2">
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: e.color }}
                      />
                      <div>
                        <p className="text-xs text-gray-800 font-medium leading-snug">{e.title}</p>
                        <p className="text-xs text-gray-400 capitalize">{e.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Month summary</h3>
              <div className="space-y-2">
                {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((type) => {
                  const count = events.filter((e) => e.type === type).length;
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${TYPE_COLORS[type]}`} />
                        <span className="text-xs text-gray-600">{TYPE_LABELS[type]}</span>
                      </div>
                      <span className="text-xs font-medium text-gray-900">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
