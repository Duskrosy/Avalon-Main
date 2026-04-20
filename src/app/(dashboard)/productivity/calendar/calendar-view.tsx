"use client";

import { useState, useCallback, useRef } from "react";
import { format, getDaysInMonth, startOfMonth, getDay } from "date-fns";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  end_date?: string;
  type: "leave" | "booking" | "birthday" | "task" | "post" | "holiday" | "sale_event";
  color: string;
  meta?: string;
};

type Filter = { leave: boolean; booking: boolean; birthday: boolean; task: boolean; post: boolean; holiday: boolean; sale_event: boolean };

type CalendarSettings = {
  show_tasks: boolean;
  show_leaves: boolean;
  show_rooms: boolean;
  show_birthdays: boolean;
  show_posts: boolean;
};

const TYPE_LABELS = {
  leave:      "Leaves",
  booking:    "Room bookings",
  birthday:   "Birthdays",
  task:       "Tasks",
  post:       "SMM Posts",
  holiday:    "Holidays",
  sale_event: "Sale Events",
};

const TYPE_COLORS = {
  leave:      "bg-amber-400",
  booking:    "bg-[var(--color-accent)]",
  birthday:   "bg-pink-400",
  task:       "bg-purple-500",
  post:       "bg-gray-700",
  holiday:    "bg-red-500",
  sale_event: "bg-orange-500",
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-[var(--color-text-primary)]" : "bg-[var(--color-border-primary)]"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-[var(--color-bg-primary)] rounded-full shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function CalendarView({
  initialMonth,
  initialEvents,
  showSmmPosts = false,
  settings,
}: {
  initialMonth: string;
  initialEvents: CalendarEvent[];
  showSmmPosts?: boolean;
  settings: CalendarSettings;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filter>({
    leave:      settings.show_leaves,
    booking:    settings.show_rooms,
    birthday:   settings.show_birthdays,
    task:       settings.show_tasks,
    post:       settings.show_posts,
    holiday:    true,
    sale_event: true,
  });
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsForm, setSettingsForm] = useState<CalendarSettings>(settings);
  const [saving, setSaving] = useState(false);

  const monthRef = useRef(month);
  monthRef.current = month;
  const abortRef = useRef<AbortController | null>(null);

  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const daysInMonth = getDaysInMonth(firstDay);
  const startDow = getDay(startOfMonth(firstDay)); // 0=Sun

  const navigate = useCallback(async (delta: number) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const [y, m] = monthRef.current.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const newMonth = format(d, "yyyy-MM");
    setMonth(newMonth);
    setSelected(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?month=${newMonth}`, {
        signal: abortRef.current.signal,
      });
      if (res.ok) setEvents(await res.json());
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
    }
    setLoading(false);
  }, []);

  const goToday = useCallback(async () => {
    const today = format(new Date(), "yyyy-MM");
    if (today === monthRef.current) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setMonth(today);
    setSelected(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?month=${today}`, {
        signal: abortRef.current.signal,
      });
      if (res.ok) setEvents(await res.json());
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
    }
    setLoading(false);
  }, []);

  async function saveSettings() {
    setSaving(true);
    await fetch("/api/calendar/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsForm),
    });
    // Also update the active filters immediately
    setFilters({
      leave:      settingsForm.show_leaves,
      booking:    settingsForm.show_rooms,
      birthday:   settingsForm.show_birthdays,
      task:       settingsForm.show_tasks,
      post:       settingsForm.show_posts,
      holiday:    true,
      sale_event: true,
    });
    setSaving(false);
    setShowSettingsPanel(false);
  }

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

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const onCurrentMonth = month === format(new Date(), "yyyy-MM");
  const selectedEvents = selected ? (byDate[selected] ?? []) : [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          {format(firstDay, "MMMM yyyy")}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            aria-pressed={onCurrentMonth}
            className={`text-sm border px-3 py-1.5 rounded-lg transition-colors ${
              onCurrentMonth
                ? "border-transparent bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] cursor-default"
                : "border-[var(--color-border-primary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => navigate(-1)}
            className="text-sm border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface-hover)]"
          >
            ‹
          </button>
          <button
            onClick={() => navigate(1)}
            className="text-sm border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface-hover)]"
          >
            ›
          </button>
          <button
            onClick={() => {
              setSettingsForm(settings);
              setShowSettingsPanel(true);
            }}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] text-sm px-2 py-1 rounded-lg border border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
          >
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(filters) as (keyof Filter)[])
          .filter((type) => type !== "post" || showSmmPosts)
          .map((type) => (
          <button
            key={type}
            onClick={() => setFilters((f) => ({ ...f, [type]: !f[type] }))}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filters[type]
                ? "border-transparent bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                : "border-[var(--color-border-primary)] text-[var(--color-text-tertiary)]"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${filters[type] ? "bg-[var(--color-bg-primary)]/70" : TYPE_COLORS[type]}`} />
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 border-b border-[var(--color-border-secondary)]">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-[var(--color-text-tertiary)] py-2">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            {loading ? (
              <div className="py-12 text-center text-sm text-[var(--color-text-tertiary)]">Loading...</div>
            ) : (
              <div className="grid grid-cols-7">
                {/* Empty cells for start day-of-week offset */}
                {Array.from({ length: startDow }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-24 border-b border-r border-[var(--color-border-secondary)]" />
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
                      className={`h-24 border-b border-r border-[var(--color-border-secondary)] p-1.5 cursor-pointer transition-colors relative ${
                        isSelected ? "bg-[var(--color-bg-secondary)]" : "hover:bg-[var(--color-surface-hover)]/50"
                      } ${isToday ? "ring-2 ring-inset ring-[var(--color-accent)]" : ""}`}
                    >
                      <div
                        className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                          isToday ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]" : "text-[var(--color-text-secondary)]"
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
                          <div className="text-xs text-[var(--color-text-tertiary)] pl-1">
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
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                {format(new Date(selected), "EEEE, d MMMM")}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-[var(--color-text-tertiary)]">Nothing scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((e) => (
                    <div key={e.id} className="flex items-start gap-2">
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: e.color }}
                      />
                      <div>
                        <p className="text-xs text-[var(--color-text-primary)] font-medium leading-snug">{e.title}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)] capitalize">
                          {e.type === "post" ? (e.meta ?? "SMM Post") : e.type}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Month summary</h3>
              <div className="space-y-2">
                {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[])
                  .filter((type) => type !== "post" || showSmmPosts)
                  .map((type) => {
                  const count = events.filter((e) => e.type === type).length;
                  if (count === 0) return null;
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${TYPE_COLORS[type]}`} />
                        <span className="text-xs text-[var(--color-text-secondary)]">{TYPE_LABELS[type]}</span>
                      </div>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettingsPanel && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowSettingsPanel(false)} />
          <div className="relative bg-[var(--color-bg-primary)] w-80 h-full shadow-xl p-6 overflow-y-auto z-50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Calendar Settings</h2>
              <button onClick={() => setShowSettingsPanel(false)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">✕</button>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] mb-4">Choose which events appear in your calendar by default.</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Tasks</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Kanban due dates</p>
                </div>
                <Toggle
                  checked={settingsForm.show_tasks}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, show_tasks: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Leaves &amp; Absences</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Approved leave requests</p>
                </div>
                <Toggle
                  checked={settingsForm.show_leaves}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, show_leaves: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Room Bookings</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Meeting room reservations</p>
                </div>
                <Toggle
                  checked={settingsForm.show_rooms}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, show_rooms: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Birthdays</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Team member birthdays</p>
                </div>
                <Toggle
                  checked={settingsForm.show_birthdays}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, show_birthdays: v }))}
                />
              </div>

              {showSmmPosts && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">SMM Posts</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">Scheduled social media posts</p>
                  </div>
                  <Toggle
                    checked={settingsForm.show_posts}
                    onChange={(v) => setSettingsForm((f) => ({ ...f, show_posts: v }))}
                  />
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--color-border-secondary)]">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save preferences"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
