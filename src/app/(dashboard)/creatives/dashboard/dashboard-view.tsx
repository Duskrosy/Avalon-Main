"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  campaign_name: string;
  organic_target: number;
  ads_target: number;
  notes: string | null;
  week_start: string;
};

type Member = { id: string; first_name: string; last_name: string; avatar_url: string | null };

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
  overdueRequestsCount: number;
  adsApprovedCount: number;
  weekStart: string;
  statusCounts: Record<string, number>;
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

const avatarColor = (i: number) => AVATAR_COLORS[i % AVATAR_COLORS.length];
const initials = (m: Member) => `${m.first_name?.[0] ?? ""}${m.last_name?.[0] ?? ""}`.toUpperCase();

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekProgress(): number {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMon = day === 0 ? 6 : day - 1;
  return Math.min((daysSinceMon + now.getHours() / 24) / 7, 1);
}

function contentStatus(count: number, target: number): { label: string; color: string } {
  if (target === 0) return { label: "No target set", color: "text-[var(--color-text-tertiary)]" };
  const done = count / target;
  const elapsed = weekProgress();
  if (done >= 1) return { label: "Complete", color: "text-emerald-600" };
  if (done >= elapsed - 0.05) return { label: "On track", color: "text-sky-600" };
  return { label: "Behind", color: "text-[var(--color-warning)]" };
}

function weekRangeLabel(mondayISO: string): string {
  const mon = new Date(mondayISO + "T00:00:00");
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
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
      onCreated((await res.json()) as Campaign);
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
        className="mt-3 text-sm px-4 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] transition-colors"
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
          className="text-sm px-4 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
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

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "neutral" | "warn";
}) {
  const valueColor =
    tone === "warn" && value > 0
      ? "text-[var(--color-warning)]"
      : "text-[var(--color-text-primary)]";
  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
      <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
        {label}
      </p>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{hint}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
  overdueRequestsCount,
  weekStart,
  adsApprovedCount,
  statusCounts,
}: Props) {
  const [campaign, setCampaign] = useState<Campaign | null>(initialCampaign);
  const [editing, setEditing] = useState(false);
  const [editOrganic, setEditOrganic] = useState(weeklyOrganicTarget);
  const [editAds, setEditAds] = useState(weeklyAdsTarget);
  const [editSaving, setEditSaving] = useState(false);

  const organicStatus = contentStatus(organicCount, weeklyOrganicTarget);
  const adsStatus = contentStatus(adsCount, weeklyAdsTarget);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Creatives</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
            Week of {weekRangeLabel(weekStart)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/creatives/requests"
            className="text-sm px-3 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] transition-colors"
          >
            New request
          </Link>
          <Link
            href="/creatives/tracker"
            className="text-sm px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            Open Tracker
          </Link>
          <Link
            href="/creatives/analytics"
            className="text-sm px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            Open Analytics
          </Link>
        </div>
      </div>

      {/* ── Hero: 3 KPI tiles ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile
          label="Published this week"
          value={statusCounts.published ?? 0}
          hint="Content items live"
        />
        <KpiTile
          label="Scheduled this week"
          value={statusCounts.scheduled ?? 0}
          hint="Queued for publishing"
        />
        <KpiTile
          label="Overdue requests"
          value={overdueRequestsCount}
          hint="Past target date, still open"
          tone="warn"
        />
      </div>

      {/* ── Campaign card (weekly pulse) ───────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <span className="text-base font-semibold text-[var(--color-text-primary)]">
            {campaign?.campaign_name ?? "Weekly Pulse"}
          </span>
          {campaign && canManage && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              Edit targets
            </button>
          )}
        </div>

        {campaign ? (
          editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[var(--color-text-secondary)] font-medium">Organic target</label>
                  <input
                    type="number" min={1} max={200} value={editOrganic}
                    onChange={(e) => setEditOrganic(Number(e.target.value))}
                    className="mt-1 w-full border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--color-text-secondary)] font-medium">Ads target</label>
                  <input
                    type="number" min={1} max={100} value={editAds}
                    onChange={(e) => setEditAds(Number(e.target.value))}
                    className="mt-1 w-full border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setEditSaving(true);
                    await fetch("/api/creatives/campaigns", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: campaign.id, organic_target: editOrganic, ads_target: editAds }),
                    });
                    setCampaign({ ...campaign, organic_target: editOrganic, ads_target: editAds });
                    setEditing(false);
                    setEditSaving(false);
                  }}
                  disabled={editSaving}
                  className="text-sm px-4 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
                >
                  {editSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditOrganic(weeklyOrganicTarget); setEditAds(weeklyAdsTarget); }}
                  className="text-sm px-3 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Organic</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-[var(--color-text-primary)]">{organicCount}</span>
                  <span className="text-sm text-[var(--color-text-tertiary)]">/ {weeklyOrganicTarget}</span>
                </div>
                <ProgressBar value={organicCount} max={weeklyOrganicTarget} color="bg-emerald-500" />
                <p className={`text-xs font-medium ${organicStatus.color}`}>{organicStatus.label}</p>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Ads</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-[var(--color-text-primary)]">{adsCount}</span>
                  <span className="text-sm text-[var(--color-text-tertiary)]">/ {weeklyAdsTarget}</span>
                </div>
                <ProgressBar value={adsCount} max={weeklyAdsTarget} color="bg-indigo-500" />
                <p className={`text-xs font-medium ${adsStatus.color}`}>{adsStatus.label}</p>
              </div>
            </div>
          )
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

      {/* ── Body grid: roster | requests in flight | tracker snapshot ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Team roster */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">Team</p>
            <span className="text-xs text-[var(--color-text-tertiary)]">{members.length}</span>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)]">No active members</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-secondary)]">
              {members.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                  <div
                    className={`w-7 h-7 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0 overflow-hidden ${m.avatar_url ? "bg-[var(--color-bg-tertiary)]" : avatarColor(i)}`}
                  >
                    {m.avatar_url ? (
                      <Image src={m.avatar_url} alt={initials(m)} width={28} height={28} className="w-full h-full object-cover" unoptimized />
                    ) : (
                      initials(m)
                    )}
                  </div>
                  <span className="text-sm text-[var(--color-text-primary)]">
                    {m.first_name} {m.last_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Requests in flight */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">Requests</p>
            <Link href="/creatives/requests" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
              View all →
            </Link>
          </div>
          <dl className="space-y-2.5">
            <div className="flex items-center justify-between">
              <dt className="text-sm text-[var(--color-text-secondary)]">In review</dt>
              <dd className="text-lg font-bold text-[var(--color-text-primary)]">{requestsInReview}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-sm text-[var(--color-text-secondary)]">Approved this week</dt>
              <dd className="text-lg font-bold text-[var(--color-text-primary)]">{adsApprovedCount}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-sm text-[var(--color-text-secondary)]">Overdue</dt>
              <dd className={`text-lg font-bold ${overdueRequestsCount > 0 ? "text-[var(--color-warning)]" : "text-[var(--color-text-primary)]"}`}>
                {overdueRequestsCount}
              </dd>
            </div>
          </dl>
        </div>

        {/* Tracker snapshot */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">Tracker</p>
            <Link href="/creatives/tracker" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
              Open →
            </Link>
          </div>
          <ul className="space-y-1.5">
            {[
              { key: "idea", label: "Ideas" },
              { key: "in_production", label: "In production" },
              { key: "submitted", label: "Submitted" },
              { key: "approved", label: "Approved" },
              { key: "scheduled", label: "Scheduled" },
              { key: "published", label: "Published" },
            ].map((s) => (
              <li key={s.key} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">{s.label}</span>
                <span className="font-semibold text-[var(--color-text-primary)]">{statusCounts[s.key] ?? 0}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-[var(--color-border-secondary)] flex items-center justify-between text-sm">
            <span className="text-[var(--color-text-secondary)]">My pending tasks</span>
            <span className="font-semibold text-[var(--color-text-primary)]">{pendingTasksCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
