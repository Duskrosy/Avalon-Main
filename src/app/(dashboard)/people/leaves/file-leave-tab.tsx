"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Credits = {
  totals: { sick: number; vacation: number; emergency: number };
  used:   { sick: number; vacation: number; emergency: number };
};

type LeaveType = "sick" | "vacation" | "emergency";

const TYPE_CONFIG: Record<LeaveType, { label: string; color: string; description: string }> = {
  sick:      { label: "Sick Leave",      color: "blue",   description: "Illness or medical appointment" },
  vacation:  { label: "Vacation Leave",  color: "green",  description: "Planned time off" },
  emergency: { label: "Emergency Leave", color: "red",    description: "Unexpected urgent situation" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Returns the min selectable date string based on leave type */
function getMinDate(type: LeaveType): string | undefined {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (type === "emergency") return undefined; // no restriction
  if (type === "sick") {
    const d = new Date(today);
    d.setDate(d.getDate() - 5);
    return toDateStr(d);
  }
  return toDateStr(today); // vacation: today and future only
}

function getBarColor(remaining: number, total: number): string {
  if (total === 0) return "bg-gray-300";
  const pct = remaining / total;
  if (pct > 0.5) return "bg-green-500";
  if (pct > 0.2) return "bg-amber-400";
  return "bg-red-500";
}

// ─── Credit bar ───────────────────────────────────────────────────────────────

function CreditBar({ type, totals, used }: { type: LeaveType; totals: Credits["totals"]; used: Credits["used"] }) {
  const total     = totals[type];
  const usedCount = used[type];
  const remaining = Math.max(0, total - usedCount);
  const pct       = total === 0 ? 0 : Math.min(100, (remaining / total) * 100);
  const cfg       = TYPE_CONFIG[type];

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">{cfg.label}</span>
        <span className="text-xs text-gray-500">
          <span className="font-semibold text-gray-900">{remaining}</span> / {total} remaining
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getBarColor(remaining, total))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{usedCount} day{usedCount !== 1 ? "s" : ""} used this year</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FileLeaveTab({ onSubmitted }: { onSubmitted: () => void }) {
  const [credits, setCredits]     = useState<Credits | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  const [form, setForm] = useState({
    leave_type: "vacation" as LeaveType,
    start_date: "",
    end_date:   "",
    reason:     "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  const fetchCredits = useCallback(async () => {
    setCreditsLoading(true);
    const res = await fetch("/api/leaves/credits");
    const data = await res.json();
    setCredits(data);
    setCreditsLoading(false);
  }, []);

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  // Reset dates when leave type changes (different min-date rules)
  function handleTypeChange(type: LeaveType) {
    setForm((f) => ({ ...f, leave_type: type, start_date: "", end_date: "" }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date:   form.end_date,
        reason:     form.reason || null,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setSuccess(true);
    setForm({ leave_type: "vacation", start_date: "", end_date: "", reason: "" });
    fetchCredits();
    setTimeout(() => { setSuccess(false); onSubmitted(); }, 1500);
  }

  const minDate = getMinDate(form.leave_type);
  const remaining = credits
    ? Math.max(0, credits.totals[form.leave_type] - credits.used[form.leave_type])
    : null;

  return (
    <div className="max-w-2xl space-y-6">

      {/* ── Credit Mini-Dashboard ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Leave Balance · {new Date().getFullYear()}</h2>
        {creditsLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : credits ? (
          <div className="space-y-4">
            {(["sick", "vacation", "emergency"] as LeaveType[]).map((t) => (
              <CreditBar key={t} type={t} totals={credits.totals} used={credits.used} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Could not load credits.</p>
        )}
      </div>

      {/* ── Leave Request Form ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">File a Leave</h2>

        {success && (
          <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
            ✓ Leave request submitted successfully
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Leave type — card selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Leave type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["sick", "vacation", "emergency"] as LeaveType[]).map((t) => {
                const cfg = TYPE_CONFIG[t];
                const active = form.leave_type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-xl border text-left transition-all",
                      active
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 hover:border-gray-400 text-gray-700"
                    )}
                  >
                    <span className="text-sm font-semibold">{cfg.label}</span>
                    <span className={cn("text-xs mt-0.5", active ? "text-gray-300" : "text-gray-400")}>
                      {cfg.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Hint for date restriction */}
            <p className="mt-2 text-xs text-gray-400">
              {form.leave_type === "vacation" && "Vacation leave must be filed in advance."}
              {form.leave_type === "sick"      && "Sick leave can be backdated up to 5 days."}
              {form.leave_type === "emergency" && "Emergency leave can be filed for any date."}
            </p>

            {remaining !== null && remaining <= 1 && (
              <p className={cn(
                "mt-1 text-xs font-medium",
                remaining === 0 ? "text-red-600" : "text-amber-600"
              )}>
                {remaining === 0
                  ? `No ${TYPE_CONFIG[form.leave_type].label} credits remaining — request will still be submitted.`
                  : `Only ${remaining} day remaining.`}
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
              <input
                type="date"
                required
                min={minDate}
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End date</label>
              <input
                type="date"
                required
                min={form.start_date || minDate}
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Add any context for your manager…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Submitting…" : "Submit leave request"}
          </button>
        </form>
      </div>
    </div>
  );
}
