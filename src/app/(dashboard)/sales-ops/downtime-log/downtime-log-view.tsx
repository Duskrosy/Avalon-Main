"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import type { DowntimeLog } from "@/lib/sales/types";

type Agent = { id: string; first_name: string; last_name: string; email: string };
type Props = { agents: Agent[]; canManage: boolean };

const CURRENT_MONTH = format(new Date(), "yyyy-MM");

const DOWNTIME_TYPES: DowntimeLog["downtime_type"][] = ["system", "internet", "power", "tool", "other"];

const TYPE_LABELS: Record<DowntimeLog["downtime_type"], string> = {
  system: "System",
  internet: "Internet",
  power: "Power",
  tool: "Tool",
  other: "Other",
};

function agentName(a: Agent) {
  return `${a.first_name} ${a.last_name}`;
}

function typeBadge(type: DowntimeLog["downtime_type"]) {
  const colors: Record<string, string> = {
    system: "bg-purple-50 text-purple-600",
    internet: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
    power: "bg-[var(--color-error-light)] text-[var(--color-error)]",
    tool: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
    other: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[type] ?? colors.other}`}>
      {TYPE_LABELS[type]}
    </span>
  );
}

export function DowntimeLogView({ agents, canManage }: Props) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [rows, setRows] = useState<DowntimeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<DowntimeLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    agent_id: "",
    downtime_type: "system" as DowntimeLog["downtime_type"],
    affected_tool: "",
    start_time: "",
    end_time: "",
    ticket_ref: "",
    description: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month });
    const res = await fetch(`/api/sales/downtime?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function openCreate() {
    setEditRow(null);
    setForm({
      date: format(new Date(), "yyyy-MM-dd"),
      agent_id: "",
      downtime_type: "system",
      affected_tool: "",
      start_time: "",
      end_time: "",
      ticket_ref: "",
      description: "",
    });
    setShowModal(true);
  }

  function openEdit(row: DowntimeLog) {
    setEditRow(row);
    setForm({
      date: row.date,
      agent_id: row.agent_id ?? "",
      downtime_type: row.downtime_type,
      affected_tool: row.affected_tool ?? "",
      start_time: row.start_time,
      end_time: row.end_time ?? "",
      ticket_ref: row.ticket_ref ?? "",
      description: row.description,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    // Compute duration if both times present
    let duration_hours: number | null = null;
    if (form.start_time && form.end_time) {
      const [sh, sm] = form.start_time.split(":").map(Number);
      const [eh, em] = form.end_time.split(":").map(Number);
      duration_hours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 10) / 10;
    }

    const payload = {
      date: form.date,
      agent_id: form.agent_id || null,
      downtime_type: form.downtime_type,
      affected_tool: form.affected_tool || null,
      start_time: form.start_time,
      end_time: form.end_time || null,
      duration_hours,
      ticket_ref: form.ticket_ref || null,
      description: form.description,
    };

    const url = editRow ? `/api/sales/downtime?id=${editRow.id}` : "/api/sales/downtime";
    const method = editRow ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await fetchRows();
      setShowModal(false);
    }
    setSaving(false);
  }

  async function handleVerify(id: string, verified: boolean) {
    await fetch(`/api/sales/downtime?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified }),
    });
    await fetchRows();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this downtime entry?")) return;
    await fetch(`/api/sales/downtime?id=${id}`, { method: "DELETE" });
    await fetchRows();
  }

  const totalHours = rows.reduce((s, r) => s + (r.duration_hours ?? 0), 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Downtime Log</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{rows.length} incidents · {totalHours.toFixed(1)}h total downtime</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[#3A5635] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2e4429] transition-colors"
        >
          + Log Downtime
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No downtime logged for this period.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Time</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg-primary)] divide-y divide-gray-50">
              {rows.map((row) => {
                const agent = agents.find((a) => a.id === row.agent_id);
                return (
                  <tr key={row.id} className="hover:bg-[var(--color-surface-hover)]">
                    <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{format(parseISO(row.date), "EEE d MMM")}</td>
                    <td className="px-4 py-3">
                      {typeBadge(row.downtime_type)}
                      {row.affected_tool && <span className="text-xs text-[var(--color-text-tertiary)] ml-1">({row.affected_tool})</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] max-w-xs truncate">
                      {row.description}
                      {agent && <span className="text-xs text-[var(--color-text-tertiary)] ml-1">— {agentName(agent)}</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] font-mono text-xs">
                      {row.start_time}{row.end_time ? ` – ${row.end_time}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">
                      {row.duration_hours !== null ? `${row.duration_hours}h` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.verified ? (
                        <span className="text-xs bg-[var(--color-success-light)] text-[var(--color-success)] px-2 py-0.5 rounded-full">Verified</span>
                      ) : (
                        <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] px-2 py-0.5 rounded-full">Unverified</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(row)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mr-2">Edit</button>
                      {canManage && !row.verified && (
                        <button onClick={() => handleVerify(row.id, true)} className="text-xs text-green-500 hover:text-[var(--color-success)] mr-2">Verify</button>
                      )}
                      {canManage && (
                        <button onClick={() => handleDelete(row.id)} className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400">Del</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">{editRow ? "Edit Downtime" : "Log Downtime"}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Date *</label>
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Agent</label>
                  <select
                    value={form.agent_id}
                    onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  >
                    <option value="">Team-wide</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{agentName(a)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Type *</label>
                  <select
                    required
                    value={form.downtime_type}
                    onChange={(e) => setForm((f) => ({ ...f, downtime_type: e.target.value as DowntimeLog["downtime_type"] }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  >
                    {DOWNTIME_TYPES.map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Affected Tool</label>
                  <input
                    type="text"
                    value={form.affected_tool}
                    onChange={(e) => setForm((f) => ({ ...f, affected_tool: e.target.value }))}
                    placeholder="e.g. Shopify, GSheets"
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Start Time *</label>
                  <input
                    required
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">End Time</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Ticket Ref</label>
                <input
                  type="text"
                  value={form.ticket_ref}
                  onChange={(e) => setForm((f) => ({ ...f, ticket_ref: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Description *</label>
                <textarea
                  required
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[#3A5635] text-white text-sm py-2 rounded-lg hover:bg-[#2e4429] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
