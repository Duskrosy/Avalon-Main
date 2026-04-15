"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import type { QaLog } from "@/lib/sales/types";
import { QA_TIER_STYLES, QA_TIER_KEYS } from "@/lib/sales/constants";

type Agent = { id: string; first_name: string; last_name: string; email: string };
type Props = { agents: Agent[]; canManage: boolean };

const CURRENT_MONTH = format(new Date(), "yyyy-MM");

function agentName(a: Agent) {
  return `${a.first_name} ${a.last_name}`;
}

function TierBadge({ tier }: { tier: string }) {
  const style = QA_TIER_STYLES[tier] ?? { color: "#666", bg: "#f0f0f0" };
  return (
    <span
      className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
      style={{ color: style.color, background: style.bg }}
    >
      {tier}
    </span>
  );
}

export function QaLogView({ agents, canManage }: Props) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [rows, setRows] = useState<QaLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<QaLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    agent_id: agents[0]?.id ?? "",
    qa_date: format(new Date(), "yyyy-MM-dd"),
    message_link: "",
    qa_tier: "Tier 2" as QaLog["qa_tier"],
    qa_reason: "",
    evaluator: "",
    notes: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (selectedAgent !== "all") params.set("agent_id", selectedAgent);
    const res = await fetch(`/api/sales/qa?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [month, selectedAgent]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function openCreate() {
    setEditRow(null);
    setForm({
      agent_id: agents[0]?.id ?? "",
      qa_date: format(new Date(), "yyyy-MM-dd"),
      message_link: "",
      qa_tier: "Tier 2",
      qa_reason: "",
      evaluator: "",
      notes: "",
    });
    setShowModal(true);
  }

  function openEdit(row: QaLog) {
    setEditRow(row);
    setForm({
      agent_id: row.agent_id,
      qa_date: row.qa_date,
      message_link: row.message_link,
      qa_tier: row.qa_tier,
      qa_reason: row.qa_reason,
      evaluator: row.evaluator,
      notes: row.notes ?? "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const url = editRow ? `/api/sales/qa?id=${editRow.id}` : "/api/sales/qa";
    const method = editRow ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, notes: form.notes || null }),
    });

    if (res.ok) {
      await fetchRows();
      setShowModal(false);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this QA entry?")) return;
    await fetch(`/api/sales/qa?id=${id}`, { method: "DELETE" });
    await fetchRows();
  }

  const tierCounts = QA_TIER_KEYS.reduce((acc, t) => {
    acc[t] = rows.filter((r) => r.qa_tier === t).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">QA Log</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {rows.length} entries · {QA_TIER_KEYS.map((t) => `${tierCounts[t]} ${t}`).join(" · ")}
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="bg-[#3A5635] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2e4429] transition-colors"
          >
            + Log QA
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
        />
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
        >
          <option value="all">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{agentName(a)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No QA entries for this period.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Tier</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Points</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Evaluator</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Link</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg-primary)] divide-y divide-gray-50">
              {rows.map((row) => {
                const agent = agents.find((a) => a.id === row.agent_id);
                return (
                  <tr key={row.id} className="hover:bg-[var(--color-surface-hover)]">
                    <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{format(parseISO(row.qa_date), "EEE d MMM")}</td>
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">{agent ? agentName(agent) : row.agent_id}</td>
                    <td className="px-4 py-3"><TierBadge tier={row.qa_tier} /></td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--color-text-primary)]">{row.qa_points}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] max-w-xs truncate">{row.qa_reason}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{row.evaluator}</td>
                    <td className="px-4 py-3">
                      {row.message_link && (
                        <a
                          href={row.message_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--color-accent)] hover:underline"
                        >
                          View
                        </a>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(row)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mr-3">Edit</button>
                        <button onClick={() => handleDelete(row.id)} className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400">Del</button>
                      </td>
                    )}
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
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">{editRow ? "Edit QA Entry" : "Log QA Check"}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Agent *</label>
                  <select
                    required
                    value={form.agent_id}
                    onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{agentName(a)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Date *</label>
                  <input
                    required
                    type="date"
                    value={form.qa_date}
                    onChange={(e) => setForm((f) => ({ ...f, qa_date: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">QA Tier *</label>
                <div className="grid grid-cols-4 gap-2">
                  {QA_TIER_KEYS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, qa_tier: t as QaLog["qa_tier"] }))}
                      className="py-2 rounded-lg text-xs font-semibold border-2 transition-all"
                      style={form.qa_tier === t
                        ? { background: QA_TIER_STYLES[t]?.bg, color: QA_TIER_STYLES[t]?.color, borderColor: QA_TIER_STYLES[t]?.color }
                        : { background: "#f9f9f9", color: "#999", borderColor: "#e5e7eb" }
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Message Link *</label>
                <input
                  required
                  type="url"
                  value={form.message_link}
                  onChange={(e) => setForm((f) => ({ ...f, message_link: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Reason *</label>
                <textarea
                  required
                  rows={2}
                  value={form.qa_reason}
                  onChange={(e) => setForm((f) => ({ ...f, qa_reason: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Evaluator *</label>
                <input
                  required
                  type="text"
                  value={form.evaluator}
                  onChange={(e) => setForm((f) => ({ ...f, evaluator: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
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
