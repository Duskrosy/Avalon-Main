"use client";

import { useState, useEffect, useCallback } from "react";
import type { IncentivePayout } from "@/lib/sales/types";

type Agent = { id: string; first_name: string; last_name: string; email: string };
type Props = { agents: Agent[]; canManage: boolean };

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

function agentName(a: Agent) {
  return `${a.first_name} ${a.last_name}`;
}

function statusBadge(status: IncentivePayout["status"]) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-500",
    approved: "bg-blue-50 text-blue-600",
    paid: "bg-green-50 text-green-700",
    disputed: "bg-red-50 text-red-500",
  };
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}

function bracketColor(bracket: string | null) {
  if (bracket === "Elite") return "text-green-700";
  if (bracket === "Strong") return "text-blue-600";
  if (bracket === "Pass") return "text-[#D57B0E]";
  return "text-red-500";
}

export function PayoutsView({ agents, canManage }: Props) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [payouts, setPayouts] = useState<IncentivePayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [showComputeModal, setShowComputeModal] = useState(false);
  const [computing, setComputing] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<IncentivePayout | null>(null);
  const [computeForm, setComputeForm] = useState({
    agent_id: agents[0]?.id ?? "",
    paid_pairs: "",
    abandoned_pairs: "",
    onhand_pairs: "",
    total_delivered: "",
    notes: "",
  });

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/sales/payouts?month=${month}`);
    if (res.ok) setPayouts(await res.json());
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  async function handleCompute(e: React.FormEvent) {
    e.preventDefault();
    setComputing(true);

    const res = await fetch("/api/sales/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: computeForm.agent_id,
        month,
        paid_pairs: parseInt(computeForm.paid_pairs) || 0,
        abandoned_pairs: parseInt(computeForm.abandoned_pairs) || 0,
        onhand_pairs: parseInt(computeForm.onhand_pairs) || 0,
        total_delivered: parseInt(computeForm.total_delivered) || 0,
        notes: computeForm.notes || null,
      }),
    });

    if (res.ok) {
      await fetchPayouts();
      setShowComputeModal(false);
    }
    setComputing(false);
  }

  async function updateStatus(id: string, status: IncentivePayout["status"]) {
    await fetch(`/api/sales/payouts?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchPayouts();
    setSelectedPayout(null);
  }

  const totalPayout = payouts.reduce((s, p) => s + p.total_payout, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Incentive Payouts</h1>
          <p className="text-sm text-gray-500 mt-1">
            {payouts.length} payouts computed · ₱{totalPayout.toLocaleString()} total
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowComputeModal(true)}
            className="bg-[#3A5635] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2e4429] transition-colors"
          >
            + Compute Payout
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : payouts.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No payouts computed for this month yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {payouts.map((payout) => {
            const agent = agents.find((a) => a.id === payout.agent_id);
            const isSelected = selectedPayout?.id === payout.id;
            return (
              <div
                key={payout.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                {/* Main row */}
                <div
                  className="p-5 cursor-pointer hover:bg-gray-50 flex items-center gap-4 flex-wrap"
                  onClick={() => setSelectedPayout(isSelected ? null : payout)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="font-semibold text-gray-900">{agent ? agentName(agent) : payout.agent_id}</span>
                      {statusBadge(payout.status)}
                      {payout.gate_passed ? (
                        <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Gate passed</span>
                      ) : (
                        <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Gate failed</span>
                      )}
                      {payout.payout_tier && (
                        <span className={`text-xs font-semibold ${bracketColor(payout.payout_tier)}`}>
                          {payout.payout_tier}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      FPS: {payout.final_fps?.toFixed(1) ?? "—"} · CR: {payout.mtd_confirmed_regular} · {payout.scored_days} scored days
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900">₱{payout.total_payout.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">total payout</p>
                  </div>
                </div>

                {/* Expanded breakdown */}
                {isSelected && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-[#FBF6F0]">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase mb-3">Payout Breakdown</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      {/* Main tier */}
                      <div className="bg-white rounded-lg p-3 border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">Main Tier</p>
                        <p className="text-lg font-bold text-gray-900">₱{payout.main_tier_payout.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{payout.paid_pairs} paid pairs</p>
                      </div>
                      {/* Abandoned */}
                      <div className="bg-white rounded-lg p-3 border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">Abandoned Recovery</p>
                        <p className="text-lg font-bold text-gray-900">₱{payout.abandoned_payout.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{payout.abandoned_pairs} delivered abandoned</p>
                      </div>
                      {/* On-hand */}
                      <div className="bg-white rounded-lg p-3 border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">On-Hand Bonus</p>
                        <p className="text-lg font-bold text-gray-900">₱{payout.onhand_payout.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">
                          {payout.onhand_pairs} on-hand / {payout.total_delivered} delivered
                        </p>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {payout.status === "draft" && (
                          <button
                            onClick={() => updateStatus(payout.id, "approved")}
                            className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100"
                          >
                            Approve
                          </button>
                        )}
                        {payout.status === "approved" && (
                          <button
                            onClick={() => updateStatus(payout.id, "paid")}
                            className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100"
                          >
                            Mark paid
                          </button>
                        )}
                        {(payout.status === "approved" || payout.status === "paid") && (
                          <button
                            onClick={() => updateStatus(payout.id, "disputed")}
                            className="text-xs bg-red-50 text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100"
                          >
                            Dispute
                          </button>
                        )}
                        {payout.status === "disputed" && (
                          <button
                            onClick={() => updateStatus(payout.id, "draft")}
                            className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                          >
                            Revert to draft
                          </button>
                        )}
                      </div>
                    )}

                    {payout.notes && <p className="text-xs text-gray-500 mt-2">{payout.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compute modal */}
      {showComputeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Compute Payout</h2>
            <p className="text-xs text-gray-500 mb-4">
              FPS is computed from logged data. Enter delivered pair counts for the payout calculation.
            </p>
            <form onSubmit={handleCompute} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Agent *</label>
                <select
                  required
                  value={computeForm.agent_id}
                  onChange={(e) => setComputeForm((f) => ({ ...f, agent_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{agentName(a)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Paid Pairs</label>
                  <input
                    type="number"
                    min={0}
                    value={computeForm.paid_pairs}
                    onChange={(e) => setComputeForm((f) => ({ ...f, paid_pairs: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Total Delivered</label>
                  <input
                    type="number"
                    min={0}
                    value={computeForm.total_delivered}
                    onChange={(e) => setComputeForm((f) => ({ ...f, total_delivered: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Abandoned Delivered</label>
                  <input
                    type="number"
                    min={0}
                    value={computeForm.abandoned_pairs}
                    onChange={(e) => setComputeForm((f) => ({ ...f, abandoned_pairs: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">On-Hand Delivered</label>
                  <input
                    type="number"
                    min={0}
                    value={computeForm.onhand_pairs}
                    onChange={(e) => setComputeForm((f) => ({ ...f, onhand_pairs: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={computeForm.notes}
                  onChange={(e) => setComputeForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#3A5635]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowComputeModal(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={computing}
                  className="flex-1 bg-[#3A5635] text-white text-sm py-2 rounded-lg hover:bg-[#2e4429] disabled:opacity-50"
                >
                  {computing ? "Computing..." : "Compute & Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
