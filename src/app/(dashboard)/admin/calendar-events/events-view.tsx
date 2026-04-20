"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import type { CalendarEventRow } from "./page";

type EventType = CalendarEventRow["event_type"];
type FilterType = "all" | EventType;

const TYPE_LABEL: Record<EventType, string> = {
  sale_event: "Sale event",
  holiday: "Holiday",
  company: "Company",
  custom: "Custom",
};

const TYPE_BADGE: Record<EventType, string> = {
  holiday: "bg-red-50 text-red-700",
  sale_event: "bg-amber-50 text-amber-700",
  company: "bg-blue-50 text-blue-700",
  custom: "bg-gray-50 text-gray-700",
};

type DraftEvent = {
  id: string | null;
  title: string;
  event_date: string;
  end_date: string;
  event_type: EventType;
  is_recurring: boolean;
  recurrence_rule: "" | "yearly";
  description: string;
};

const emptyDraft: DraftEvent = {
  id: null,
  title: "",
  event_date: format(new Date(), "yyyy-MM-dd"),
  end_date: "",
  event_type: "holiday",
  is_recurring: false,
  recurrence_rule: "",
  description: "",
};

export function EventsView({ initialEvents }: { initialEvents: CalendarEventRow[] }) {
  const [events, setEvents] = useState<CalendarEventRow[]>(initialEvents);
  const [filter, setFilter] = useState<FilterType>("all");
  const [modal, setModal] = useState<DraftEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return filter === "all" ? events : events.filter((e) => e.event_type === filter);
  }, [events, filter]);

  function openCreate() {
    setModal({ ...emptyDraft });
    setError(null);
  }

  function openEdit(ev: CalendarEventRow) {
    setModal({
      id: ev.id,
      title: ev.title,
      event_date: ev.event_date,
      end_date: ev.end_date ?? "",
      event_type: ev.event_type,
      is_recurring: ev.is_recurring,
      recurrence_rule: (ev.recurrence_rule as "yearly" | null) === "yearly" ? "yearly" : "",
      description: ev.description ?? "",
    });
    setError(null);
  }

  async function save() {
    if (!modal) return;
    if (!modal.title.trim()) { setError("Title is required"); return; }
    if (!modal.event_date) { setError("Date is required"); return; }

    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      title: modal.title.trim(),
      event_date: modal.event_date,
      end_date: modal.end_date || null,
      event_type: modal.event_type,
      is_recurring: modal.is_recurring,
      recurrence_rule: modal.is_recurring && modal.recurrence_rule ? modal.recurrence_rule : null,
      description: modal.description.trim() || null,
    };

    const url = modal.id
      ? `/api/calendar/events?id=${modal.id}`
      : "/api/calendar/events";
    const method = modal.id ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Save failed (${res.status})`);
      setSaving(false);
      return;
    }

    const saved: CalendarEventRow = await res.json();

    setEvents((prev) => {
      const without = prev.filter((e) => e.id !== saved.id);
      const next = [...without, saved];
      next.sort((a, b) => a.event_date.localeCompare(b.event_date));
      return next;
    });
    setModal(null);
    setSaving(false);
  }

  async function remove(ev: CalendarEventRow) {
    if (!confirm(`Delete "${ev.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/calendar/events?id=${ev.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Delete failed");
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== ev.id));
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Calendar Events</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Manage company holidays and sale events shown on the productivity calendar · OPS only
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Add event
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-4">
        {(["all", "holiday", "sale_event", "company", "custom"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? "bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]"
                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {f === "all" ? "All" : TYPE_LABEL[f as EventType]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Title</th>
              <th className="text-left px-4 py-2.5 font-medium">Date</th>
              <th className="text-left px-4 py-2.5 font-medium">Type</th>
              <th className="text-left px-4 py-2.5 font-medium">Recurring</th>
              <th className="text-right px-4 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-primary)]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-tertiary)]">
                  No events yet
                </td>
              </tr>
            )}
            {filtered.map((ev) => (
              <tr key={ev.id} className="hover:bg-[var(--color-surface-hover)]">
                <td className="px-4 py-2.5 text-[var(--color-text-primary)] font-medium">{ev.title}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                  {ev.event_date}
                  {ev.end_date && <span className="text-[var(--color-text-tertiary)]"> → {ev.end_date}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[ev.event_type]}`}>
                    {TYPE_LABEL[ev.event_type]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                  {ev.is_recurring ? (ev.recurrence_rule ?? "yes") : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => openEdit(ev)}
                    className="text-xs text-[var(--color-accent)] hover:underline mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(ev)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setModal(null)}>
          <div
            className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4 text-[var(--color-text-primary)]">
              {modal.id ? "Edit event" : "Add event"}
            </h2>

            <div className="space-y-3">
              <Field label="Title">
                <input
                  type="text"
                  value={modal.title}
                  onChange={(e) => setModal({ ...modal, title: e.target.value })}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
                  autoFocus
                />
              </Field>

              <Field label="Type">
                <select
                  value={modal.event_type}
                  onChange={(e) => setModal({ ...modal, event_type: e.target.value as EventType })}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
                >
                  <option value="holiday">Holiday</option>
                  <option value="sale_event">Sale event</option>
                  <option value="company">Company</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    value={modal.event_date}
                    onChange={(e) => setModal({ ...modal, event_date: e.target.value })}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="End date (optional)">
                  <input
                    type="date"
                    value={modal.end_date}
                    onChange={(e) => setModal({ ...modal, end_date: e.target.value })}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input
                  type="checkbox"
                  checked={modal.is_recurring}
                  onChange={(e) => setModal({
                    ...modal,
                    is_recurring: e.target.checked,
                    recurrence_rule: e.target.checked ? "yearly" : "",
                  })}
                />
                Recurring yearly
              </label>

              <Field label="Description (optional)">
                <textarea
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
                  rows={2}
                />
              </Field>

              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setModal(null)}
                disabled={saving}
                className="px-3 py-1.5 rounded-[var(--radius-md)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : modal.id ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}
