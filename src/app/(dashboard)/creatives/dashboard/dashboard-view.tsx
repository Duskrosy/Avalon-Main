"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  campaign_name: string;
  organic_target: number;
  ads_target: number;
  notes: string | null;
  week_start: string;
};

type Member = { id: string; first_name: string; last_name: string };

type DayData = { day: string; organic: number; ad: number };

type Props = {
  currentUserId: string;
  canManage: boolean;
  members: Member[];
  campaign: Campaign | null;
  organicCount: number;
  adsCount: number;
  weeklyOrganicTarget: number;
  weeklyAdsTarget: number;
  pendingTasksCount: number;
  requestsInReview: number;
  adsApprovedCount: number;
  weekStart: string; // YYYY-MM-DD (Monday)
  weeklyPostsByDay: DayData[];
};

// ── Avatar palette ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-pink-100 text-pink-700",
];

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function initials(m: Member) {
  return `${m.first_name?.[0] ?? ""}${m.last_name?.[0] ?? ""}`.toUpperCase();
}

// ── Status helper ─────────────────────────────────────────────────────────────

function weekProgress(): number {
  // Fraction of the work week (Mon 0% → Sun 100%) that has elapsed
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  // Days elapsed since Monday (0=Mon, 6=Sun)
  const daysSinceMon = day === 0 ? 6 : day - 1;
  const hoursFraction = now.getHours() / 24;
  return Math.min((daysSinceMon + hoursFraction) / 7, 1);
}

function contentStatus(count: number, target: number): {
  label: string;
  color: string;
} {
  if (target === 0) return { label: "No target set", color: "text-[var(--color-text-tertiary)]" };
  const done = count / target;
  const elapsed = weekProgress();
  if (done >= 1) return { label: "Complete", color: "text-emerald-600" };
  if (done >= elapsed - 0.05) return { label: "On track", color: "text-sky-600" };
  return { label: "Behind", color: "text-[var(--color-warning)]" };
}

// ── Week label ────────────────────────────────────────────────────────────────

function weekLabel(mondayISO: string): string {
  const d = new Date(mondayISO + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Campaign setup form ───────────────────────────────────────────────────────

function CampaignSetupForm({
  weekStart,
  onCreated,
}: {
  weekStart: string;
  onCreated: (c: Campaign) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [organicTarget, setOrganicTarget] = useState(25);
  const [adsTarget, setAdsTarget] = useState(10);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr("Campaign name is required"); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/creatives/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_start: weekStart,
          campaign_name: name.trim(),
          organic_target: organicTarget,
          ads_target: adsTarget,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setErr(j.error ?? "Failed to create campaign");
        return;
      }
      const created = await res.json();
      onCreated(created as Campaign);
      setOpen(false);
    } catch {
      setErr("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-sm px-4 py-2 bg-[var(--color-text-primary)] text-white rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] transition-colors"
      >
        Set campaign name
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="text-xs text-[var(--color-text-secondary)] font-medium">Campaign name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Andromeda Q2 Push"
          className="mt-1 w-full border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-[var(--color-text-secondary)] font-medium">Organic target</label>
          <input
            type="number"
            min={1}
            max={200}
            value={organicTarget}
            onChange={(e) => setOrganicTarget(Number(e.target.value))}
            className="mt-1 w-full border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[var(--color-text-secondary)] font-medium">Ads target</label>
          <input
            type="number"
            min={1}
            max={100}
            value={adsTarget}
            onChange={(e) => setAdsTarget(Number(e.target.value))}
            className="mt-1 w-full border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
      </div>
      {err && <p className="text-xs text-[var(--color-error)]">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="text-sm px-4 py-2 bg-[var(--color-text-primary)] text-white rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Create"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-sm px-3 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden w-full">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CreativesDashboard({
  canManage,
  members,
  campaign: initialCampaign,
  organicCount,
  adsCount,
  weeklyOrganicTarget,
  weeklyAdsTarget,
  pendingTasksCount,
  requestsInReview,
  weekStart,
  weeklyPostsByDay,
}: Props) {
  const [campaign, setCampaign] = useState<Campaign | null>(initialCampaign);

  const organicStatus = contentStatus(organicCount, weeklyOrganicTarget);
  const adsStatus = contentStatus(adsCount, weeklyAdsTarget);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Creatives</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
          Week of {weekLabel(weekStart)}
        </p>
      </div>

      {/* ── Andromeda Creatives card ────────────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-6">
        {/* Card header */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-base font-semibold text-[var(--color-text-primary)]">
            Andromeda Creatives
          </span>
          {campaign && (
            <span className="bg-[var(--color-text-primary)] text-white text-xs font-medium px-3 py-1 rounded-full">
              {campaign.campaign_name}
            </span>
          )}
        </div>

        {campaign ? (
          <>
            {/* Two progress sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Organic Content */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                  Organic Content
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-[var(--color-text-primary)]">
                    {organicCount}
                  </span>
                  <span className="text-sm text-[var(--color-text-tertiary)]">
                    / {weeklyOrganicTarget}
                  </span>
                </div>
                <ProgressBar
                  value={organicCount}
                  max={weeklyOrganicTarget}
                  color="bg-emerald-500"
                />
                <p className={`text-xs font-medium ${organicStatus.color}`}>
                  {organicStatus.label}
                </p>
              </div>

              {/* Ad Creatives */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                  Ad Creatives
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-[var(--color-text-primary)]">
                    {adsCount}
                  </span>
                  <span className="text-sm text-[var(--color-text-tertiary)]">
                    / {weeklyAdsTarget}
                  </span>
                </div>
                <ProgressBar
                  value={adsCount}
                  max={weeklyAdsTarget}
                  color="bg-indigo-500"
                />
                <p className={`text-xs font-medium ${adsStatus.color}`}>
                  {adsStatus.label}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">from SMM post tracker</p>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[var(--color-border-secondary)] mb-5" />

            {/* Mini bar chart — daily post breakdown */}
            <div>
              <p className="text-xs font-medium text-[var(--color-text-tertiary)] mb-3 uppercase tracking-wide">
                Daily posts this week
              </p>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={weeklyPostsByDay}
                    barSize={14}
                    margin={{ top: 0, right: 0, left: -28, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "10px",
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                      }}
                      cursor={{ fill: "#f9fafb" }}
                    />
                    <Bar
                      dataKey="organic"
                      stackId="a"
                      fill="#10b981"
                      radius={[0, 0, 0, 0]}
                      name="Organic"
                    />
                    <Bar
                      dataKey="ad"
                      stackId="a"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                      name="Ad"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                  Organic
                </span>
                <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                  Ad
                </span>
              </div>
            </div>
          </>
        ) : canManage ? (
          <div>
            <p className="text-sm text-[var(--color-text-secondary)]">No campaign set for this week.</p>
            <CampaignSetupForm weekStart={weekStart} onCreated={setCampaign} />
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No campaign set for this week. Ask your manager to set one.
          </p>
        )}
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Pending Tasks */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-4 h-4 text-[var(--color-text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
              Pending Tasks
            </p>
          </div>
          <p className="text-3xl font-bold text-[var(--color-text-primary)]">{pendingTasksCount}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">assigned to you</p>
        </div>

        {/* Team */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
            Team
          </p>
          <p className="text-3xl font-bold text-[var(--color-text-primary)]">{members.length}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">active members</p>
          {members.length > 0 && (
            <div className="flex items-center mt-3 -space-x-1.5">
              {members.slice(0, 4).map((m, i) => (
                <div
                  key={m.id}
                  className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center ring-2 ring-white ${avatarColor(i)}`}
                  title={`${m.first_name} ${m.last_name}`}
                >
                  {initials(m)}
                </div>
              ))}
              {members.length > 4 && (
                <div className="w-7 h-7 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] text-xs font-semibold flex items-center justify-center ring-2 ring-white">
                  +{members.length - 4}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Requests In Review */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-4 h-4 text-[var(--color-text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
              Requests In Review
            </p>
          </div>
          <p className="text-3xl font-bold text-[var(--color-text-primary)]">{requestsInReview}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">awaiting review</p>
        </div>
      </div>

      {/* ── Team member list ───────────────────────────────────────────────────── */}
      {members.length > 0 && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-4">
            Team Members
          </p>
          <ul className="divide-y divide-[var(--color-border-secondary)]">
            {members.map((m, i) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div
                  className={`w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center flex-shrink-0 ${avatarColor(i)}`}
                >
                  {initials(m)}
                </div>
                <span className="text-sm text-[var(--color-text-primary)] font-medium">
                  {m.first_name} {m.last_name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
