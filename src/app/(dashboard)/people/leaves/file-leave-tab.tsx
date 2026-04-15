"use client";

import { useState, useEffect, useCallback } from "react";
import { format, isWithinInterval, parseISO, addDays } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Credits = {
  totals: { sick: number; vacation: number; emergency: number };
  used:   { sick: number; vacation: number; emergency: number };
};

type LeaveType = "sick" | "vacation" | "emergency";

type TeamLeave = {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  status: string;
  profile?: { first_name: string; last_name: string } | null;
};

const TYPE_CONFIG: Record<LeaveType, { label: string; description: string; policy: string; icon: string }> = {
  sick:      {
    label:       "Sick Leave",
    description: "Illness or medical appointment",
    policy:      "Can be backdated up to 5 days. Supporting documents may be requested.",
    icon:        "🤒",
  },
  vacation:  {
    label:       "Vacation Leave",
    description: "Planned time off",
    policy:      "Must be filed in advance. Cannot start in the past.",
    icon:        "🏖️",
  },
  emergency: {
    label:       "Emergency Leave",
    description: "Unexpected urgent situation",
    policy:      "Can be filed for any date. No advance notice required.",
    icon:        "🚨",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getMinDate(type: LeaveType): string | undefined {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (type === "emergency") return undefined;
  if (type === "sick") {
    const d = new Date(today);
    d.setDate(d.getDate() - 5);
    return toDateStr(d);
  }
  return toDateStr(today);
}

function getBarColor(remaining: number, total: number): string {
  if (total === 0) return "bg-[var(--color-bg-tertiary)]";
  const pct = remaining / total;
  if (pct > 0.5) return "bg-[var(--color-success)]";
  if (pct > 0.2) return "bg-amber-400";
  return "bg-[var(--color-error)]";
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
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">{cfg.label}</span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          <span className="font-semibold text-[var(--color-text-primary)]">{remaining}</span> / {total} remaining
        </span>
      </div>
      <div className="h-2 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getBarColor(remaining, total))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{usedCount} day{usedCount !== 1 ? "s" : ""} used this year</p>
    </div>
  );
}

// ─── Who's off panel ─────────────────────────────────────────────────────────

function WhoIsOffPanel() {
  const [leaves, setLeaves] = useState<TeamLeave[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaves?scope=department")
      .then((r) => r.json())
      .then((d) => {
        // Show approved + pre_approved leaves
        setLeaves((d.leaves ?? []).filter((l: TeamLeave) =>
          l.status === "approved" || l.status === "pre_approved"
        ));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoWeeks = addDays(today, 14);

  const upcoming = leaves.filter((l) => {
    try {
      const end = parseISO(l.end_date);
      return end >= today && parseISO(l.start_date) <= twoWeeks;
    } catch { return false; }
  }).sort((a, b) => a.start_date.localeCompare(b.start_date));

  const onLeaveToday = upcoming.filter((l) => {
    try {
      return isWithinInterval(today, { start: parseISO(l.start_date), end: parseISO(l.end_date) });
    } catch { return false; }
  });

  const soonLeaves = upcoming.filter((l) => !onLeaveToday.find((o) => o.id === l.id));

  function leaveChip(l: TeamLeave) {
    const name = l.profile ? `${l.profile.first_name} ${l.profile.last_name}` : "Someone";
    const isPre = l.status === "pre_approved";
    const sameDay = l.start_date === l.end_date;
    const dateLabel = sameDay
      ? format(parseISO(l.start_date), "MMM d")
      : `${format(parseISO(l.start_date), "MMM d")} – ${format(parseISO(l.end_date), "MMM d")}`;

    return (
      <div key={l.id} className="flex items-start gap-2.5 py-2 border-b border-[var(--color-border-subtle)] last:border-0">
        <div className="w-7 h-7 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs font-semibold text-[var(--color-text-tertiary)] shrink-0">
          {(l.profile?.first_name?.[0] ?? "") + (l.profile?.last_name?.[0] ?? "")}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {TYPE_CONFIG[l.leave_type]?.label} · {dateLabel}
            {isPre && <span className="ml-1 text-amber-500">· awaiting approval</span>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* On leave today */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
          On leave today
          {!loading && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">{onLeaveToday.length}</span>}
        </h3>
        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-8 bg-[var(--color-bg-secondary)] rounded animate-pulse" />)}</div>
        ) : onLeaveToday.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">Everyone is in today.</p>
        ) : (
          <div>{onLeaveToday.map(leaveChip)}</div>
        )}
      </div>

      {/* Upcoming in next 14 days */}
      {!loading && soonLeaves.length > 0 && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Coming up (14 days)</h3>
          <div>{soonLeaves.slice(0, 5).map(leaveChip)}</div>
        </div>
      )}

      {/* Leave policy quick reference */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Leave policies</h3>
        <div className="space-y-3">
          {(["sick", "vacation", "emergency"] as LeaveType[]).map((t) => {
            const cfg = TYPE_CONFIG[t];
            return (
              <div key={t} className="flex gap-2.5">
                <span className="text-base shrink-0 mt-0.5">{cfg.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">{cfg.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{cfg.policy}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
          All leave requests go through a two-step approval: manager pre-approval, then OPS final approval.
        </p>
      </div>
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

  const minDate   = getMinDate(form.leave_type);
  const remaining = credits
    ? Math.max(0, credits.totals[form.leave_type] - credits.used[form.leave_type])
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

      {/* ── Left column ── */}
      <div className="space-y-6">

        {/* Credit Dashboard */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
            Leave Balance · {new Date().getFullYear()}
          </h2>
          {creditsLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 bg-[var(--color-bg-secondary)] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : credits ? (
            <div className="space-y-4">
              {(["sick", "vacation", "emergency"] as LeaveType[]).map((t) => (
                <CreditBar key={t} type={t} totals={credits.totals} used={credits.used} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Could not load credits.</p>
          )}
        </div>

        {/* Leave Request Form */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">File a Leave</h2>

          {success && (
            <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
              ✓ Leave request submitted — you&apos;ll be notified once it&apos;s reviewed.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Leave type */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">Leave type</label>
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
                          ? "border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                          : "border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)] text-[var(--color-text-secondary)]"
                      )}
                    >
                      <span className="text-base mb-1">{cfg.icon}</span>
                      <span className="text-sm font-semibold leading-tight">{cfg.label}</span>
                      <span className={cn("text-xs mt-0.5", active ? "text-[var(--color-text-inverted)]/70" : "text-[var(--color-text-muted)]")}>
                        {cfg.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                {TYPE_CONFIG[form.leave_type].policy}
              </p>

              {remaining !== null && remaining <= 1 && (
                <p className={cn(
                  "mt-1 text-xs font-medium",
                  remaining === 0 ? "text-red-600" : "text-amber-600"
                )}>
                  {remaining === 0
                    ? `No ${TYPE_CONFIG[form.leave_type].label} days remaining — you can still submit.`
                    : `Only ${remaining} day remaining.`}
                </p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Start date</label>
                <input
                  type="date"
                  required
                  min={minDate}
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">End date</label>
                <input
                  type="date"
                  required
                  min={form.start_date || minDate}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)]"
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Reason <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Add context for your manager…"
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit leave request"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Right column ── */}
      <div className="lg:sticky lg:top-4">
        <WhoIsOffPanel />
      </div>
    </div>
  );
}
