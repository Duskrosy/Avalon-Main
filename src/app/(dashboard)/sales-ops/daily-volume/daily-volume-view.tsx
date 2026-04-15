"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import type { DailyVolume } from "@/lib/sales/types";

type Agent = { id: string; first_name: string; last_name: string; email: string };

type Props = {
  agents: Agent[];
  currentUserId: string;
  canManage: boolean;
  initialRows?: DailyVolume[];
};

const CURRENT_MONTH = format(new Date(), "yyyy-MM");

function agentName(a: Agent) {
  return `${a.first_name} ${a.last_name}`;
}

function statusBadge(row: DailyVolume) {
  if (row.on_leave) return <span className="text-xs bg-[var(--color-accent-light)] text-[var(--color-accent)] px-2 py-0.5 rounded-full">Leave</span>;
  if (row.follow_ups === 0 && row.confirmed_total === 0) return <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] px-2 py-0.5 rounded-full">No data</span>;
  return <span className="text-xs bg-[var(--color-success-light)] text-[var(--color-success)] px-2 py-0.5 rounded-full">Logged</span>;
}

export function DailyVolumeView({ agents, currentUserId, canManage, initialRows }: Props) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [selectedAgent, setSelectedAgent] = useState(currentUserId);
  const [rows, setRows] = useState<DailyVolume[]>(initialRows ?? []);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<DailyVolume | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    follow_ups: "",
    confirmed_total: "",
    confirmed_abandoned: "",
    buffer_approved: false,
    buffer_reason: "",
    buffer_proof_link: "",
    on_leave: false,
    excluded_hours: "",
    notes: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month, agent_id: selectedAgent });
    const res = await fetch(`/api/sales/volume?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [month, selectedAgent]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function openCreate() {
    setEditRow(null);
    setForm({
      date: format(new Date(), "yyyy-MM-dd"),
      follow_ups: "",
      confirmed_total: "",
      confirmed_abandoned: "0",
      buffer_approved: false,
      buffer_reason: "",
      buffer_proof_link: "",
      on_leave: false,
      excluded_hours: "0",
      notes: "",
    });
    setShowModal(true);
  }

  function openEdit(row: DailyVolume) {
    setEditRow(row);
    setForm({
      date: row.date,
      follow_ups: String(row.follow_ups),
      confirmed_total: String(row.confirmed_total),
      confirmed_abandoned: String(row.confirmed_abandoned),
      buffer_approved: row.buffer_approved,
      buffer_reason: row.buffer_reason ?? "",
      buffer_proof_link: row.buffer_proof_link ?? "",
      on_leave: row.on_leave,
      excluded_hours: String(row.excluded_hours),
      notes: row.notes ?? "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      agent_id: selectedAgent,
      date: form.date,
      follow_ups: parseInt(form.follow_ups) || 0,
      confirmed_total: parseInt(form.confirmed_total) || 0,
      confirmed_abandoned: parseInt(form.confirmed_abandoned) || 0,
      buffer_approved: form.buffer_approved,
      buffer_reason: form.buffer_reason || null,
      buffer_proof_link: form.buffer_proof_link || null,
      on_leave: form.on_leave,
      excluded_hours: parseFloat(form.excluded_hours) || 0,
      notes: form.notes || null,
    };

    const url = editRow ? `/api/sales/volume?id=${editRow.id}` : "/api/sales/volume";
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

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/sales/volume?id=${id}`, { method: "DELETE" });
    await fetchRows();
  }

  const agentObj = agents.find((a) => a.id === selectedAgent);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Daily Volume Log</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{rows.length} entries for {month}</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[#3A5635] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2e4429] transition-colors"
        >
          + Log Day
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
        />
        {canManage && (
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{agentName(a)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No entries for this period.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Follow-ups</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Confirmed</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Abandoned</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Regular</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Buffer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg-primary)] divide-y divide-gray-50">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                    {format(parseISO(row.date), "EEE d MMM")}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">{row.follow_ups.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">{row.confirmed_total}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">{row.confirmed_abandoned}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--color-text-primary)]">{row.confirmed_regular}</td>
                  <td className="px-4 py-3">
                    {row.buffer_approved ? (
                      <span className="text-xs bg-[#F4E2D0] text-[#D57B0E] px-2 py-0.5 rounded-full">Approved</span>
                    ) : row.buffer_reason ? (
                      <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] px-2 py-0.5 rounded-full">Pending</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{statusBadge(row)}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(row)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mr-3">Edit</button>
                      <button onClick={() => handleDelete(row.id)} className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400">Del</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              {editRow ? "Edit Entry" : "Log Day"}
              {agentObj && <span className="text-sm font-normal text-[var(--color-text-secondary)] ml-2">— {agentName(agentObj)}</span>}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
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

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.on_leave}
                    onChange={(e) => setForm((f) => ({ ...f, on_leave: e.target.checked }))}
                    className="rounded"
                  />
                  On leave
                </label>
              </div>

              {!form.on_leave && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Follow-ups</label>
                      <input
                        type="number"
                        min={0}
                        value={form.follow_ups}
                        onChange={(e) => setForm((f) => ({ ...f, follow_ups: e.target.value }))}
                        placeholder="0"
                        className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Confirmed Total</label>
                      <input
                        type="number"
                        min={0}
                        value={form.confirmed_total}
                        onChange={(e) => setForm((f) => ({ ...f, confirmed_total: e.target.value }))}
                        placeholder="0"
                        className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Abandoned</label>
                      <input
                        type="number"
                        min={0}
                        value={form.confirmed_abandoned}
                        onChange={(e) => setForm((f) => ({ ...f, confirmed_abandoned: e.target.value }))}
                        placeholder="0"
                        className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                      />
                    </div>
                  </div>

                  {canManage && (
                    <div className="border border-[#F4E2D0] rounded-lg p-3 space-y-2 bg-[#FBF6F0]">
                      <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.buffer_approved}
                          onChange={(e) => setForm((f) => ({ ...f, buffer_approved: e.target.checked }))}
                          className="rounded"
                        />
                        Buffer approved
                      </label>
                      {form.buffer_approved && (
                        <>
                          <input
                            type="text"
                            placeholder="Buffer reason"
                            value={form.buffer_reason}
                            onChange={(e) => setForm((f) => ({ ...f, buffer_reason: e.target.value }))}
                            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none"
                          />
                          <input
                            type="url"
                            placeholder="Proof link (optional)"
                            value={form.buffer_proof_link}
                            onChange={(e) => setForm((f) => ({ ...f, buffer_proof_link: e.target.value }))}
                            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none"
                          />
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
