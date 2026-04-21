"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackerFeedRow } from "@/types/tracker-feed";
import { platformBadge } from "./ledger-helpers";

type GroupFilter = "" | "local" | "international" | "pcdlf";
type PlatformFilter = "" | "facebook" | "instagram" | "tiktok" | "youtube" | "meta_ads";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function kindPill(kind: TrackerFeedRow["kind"]): { label: string; cls: string } {
  switch (kind) {
    case "planned":        return { label: "Planned", cls: "bg-sky-500/10 text-sky-400" };
    case "posted_organic": return { label: "Organic", cls: "bg-emerald-500/10 text-emerald-400" };
    case "posted_ad":      return { label: "Ad",      cls: "bg-amber-500/10 text-amber-400" };
  }
}

function platformLabel(p: TrackerFeedRow["platform"]): string {
  if (!p) return "—";
  if (p === "meta_ads") return "Meta Ads";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function groupLabel(g: TrackerFeedRow["group"]): string {
  if (!g) return "—";
  if (g === "pcdlf") return "PCDLF";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

function ymdUTC(iso: string): string {
  return iso.slice(0, 10);
}

function daysInMonth(month: string): Date[] {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: Date[] = [];
  for (let d = 1; d <= last; d++) out.push(new Date(Date.UTC(y, m - 1, d)));
  return out;
}

export function TrackerView({
  initialMonth,
  initialGroup,
  initialPlatform,
}: {
  initialMonth: string;
  initialGroup: string;
  initialPlatform: string;
}) {
  const router = useRouter();
  const [month, setMonth] = useState<string>(initialMonth);
  const [group, setGroup] = useState<GroupFilter>((initialGroup as GroupFilter) || "");
  const [platform, setPlatform] = useState<PlatformFilter>((initialPlatform as PlatformFilter) || "");
  const [rows, setRows] = useState<TrackerFeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Sync URL whenever filters change.
  useEffect(() => {
    const qs = new URLSearchParams();
    qs.set("month", month);
    if (group) qs.set("group", group);
    if (platform) qs.set("platform", platform);
    router.replace(`?${qs.toString()}`, { scroll: false });
  }, [month, group, platform, router]);

  // Clear day selection when month changes.
  useEffect(() => {
    setSelectedDay(null);
  }, [month]);

  // Fetch feed.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ month });
    if (group) qs.set("group", group);
    if (platform) qs.set("platform", platform);
    fetch(`/api/creatives/tracker-feed?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ data: TrackerFeedRow[] }>;
      })
      .then((body) => {
        if (cancelled) return;
        setRows(body.data ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message ?? e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [month, group, platform]);

  // Density by day.
  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const d = ymdUTC(r.occurredAt);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const v of countByDay.values()) if (v > max) max = v;
    return max;
  }, [countByDay]);

  // Rows filtered by selected day.
  const visibleRows = useMemo(() => {
    if (!selectedDay) return rows;
    return rows.filter((r) => ymdUTC(r.occurredAt) === selectedDay);
  }, [rows, selectedDay]);

  // Group by YYYY-MM-DD.
  const grouped = useMemo(() => {
    const groups = new Map<string, TrackerFeedRow[]>();
    for (const r of visibleRows) {
      const key = ymdUTC(r.occurredAt);
      const arr = groups.get(key);
      if (arr) arr.push(r); else groups.set(key, [r]);
    }
    // sort keys descending
    return Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visibleRows]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Tracker</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
            Chronological ledger of planned, posted organic, and published Meta ads.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <MonthSwitcher month={month} onChange={setMonth} />
          <GroupSwitcher value={group} onChange={setGroup} />
          <PlatformSwitcher value={platform} onChange={setPlatform} />
        </div>
      </div>

      <MiniCalendar
        month={month}
        countByDay={countByDay}
        maxCount={maxCount}
        selectedDay={selectedDay}
        onToggleDay={(d) => setSelectedDay((cur) => (cur === d ? null : d))}
      />

      {loading ? (
        <div className="flex items-center justify-center h-48 text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          Loading…
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48 text-sm text-red-400 bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          {error}
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          Nothing in this window.
        </div>
      ) : (
        <MonthList grouped={grouped} />
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function GroupSwitcher({ value, onChange }: { value: GroupFilter; onChange: (v: GroupFilter) => void }) {
  const opts: { key: GroupFilter; label: string }[] = [
    { key: "",              label: "All groups" },
    { key: "local",         label: "Local" },
    { key: "international", label: "International" },
    { key: "pcdlf",         label: "PCDLF" },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)] text-xs">
      {opts.map((o) => (
        <button
          key={o.key || "all"}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            value === o.key
              ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlatformSwitcher({ value, onChange }: { value: PlatformFilter; onChange: (v: PlatformFilter) => void }) {
  const opts: { key: PlatformFilter; label: string }[] = [
    { key: "",          label: "All" },
    { key: "facebook",  label: "FB" },
    { key: "instagram", label: "IG" },
    { key: "tiktok",    label: "TT" },
    { key: "youtube",   label: "YT" },
    { key: "meta_ads",  label: "Meta Ads" },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)] text-xs">
      {opts.map((o) => (
        <button
          key={o.key || "all"}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            value === o.key
              ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-2 p-1 rounded-lg bg-[var(--color-bg-secondary)] text-xs">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="px-2 py-1 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors"
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="px-2 font-medium text-[var(--color-text-primary)] min-w-[9rem] text-center">
        {formatMonth(month)}
      </span>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        className="px-2 py-1 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}

function MiniCalendar({
  month,
  countByDay,
  maxCount,
  selectedDay,
  onToggleDay,
}: {
  month: string;
  countByDay: Map<string, number>;
  maxCount: number;
  selectedDay: string | null;
  onToggleDay: (d: string) => void;
}) {
  const days = daysInMonth(month);
  // Compute leading blanks so the grid starts on Sunday.
  const leading = days.length > 0 ? days[0].getUTCDay() : 0;

  return (
    <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-3">
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] font-semibold mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }).map((_, i) => (
          <div key={`blank-${i}`} className="h-8" />
        ))}
        {days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const count = countByDay.get(key) ?? 0;
          const isSelected = selectedDay === key;
          // Opacity scales with density (min 0.15, max 1) when count > 0.
          const dotOpacity = count === 0 ? 0 : maxCount > 0 ? 0.15 + 0.85 * (count / maxCount) : 0;
          return (
            <button
              key={key}
              onClick={() => onToggleDay(key)}
              className={`h-8 rounded flex flex-col items-center justify-center text-[10px] transition-colors ${
                isSelected
                  ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
              }`}
              aria-label={`${key} — ${count} item${count === 1 ? "" : "s"}`}
            >
              <span className="leading-none">{d.getUTCDate()}</span>
              <span
                className={`mt-0.5 w-1 h-1 rounded-full ${isSelected ? "bg-[var(--color-text-inverted)]" : "bg-[var(--color-text-primary)]"}`}
                style={{ opacity: dotOpacity }}
              />
            </button>
          );
        })}
      </div>
      {selectedDay && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)]">
          <span>Filtering to {selectedDay}</span>
          <button
            onClick={() => onToggleDay(selectedDay)}
            className="underline hover:text-[var(--color-text-primary)]"
          >
            clear
          </button>
        </div>
      )}
    </div>
  );
}

function MonthList({ grouped }: { grouped: [string, TrackerFeedRow[]][] }) {
  return (
    <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
      {grouped.map(([day, dayRows]) => (
        <div key={day} className="border-b border-[var(--color-border-primary)] last:border-b-0">
          <div className="px-4 py-2 bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] font-semibold flex items-center justify-between">
            <span>{day}</span>
            <span>{dayRows.length} item{dayRows.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="divide-y divide-[var(--color-border-primary)]">
            {dayRows.map((r) => {
              const pill = kindPill(r.kind);
              return (
                <li key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-bg-secondary)]/40">
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                      className="w-10 h-10 rounded object-cover shrink-0 bg-[var(--color-bg-tertiary)]"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-[var(--color-bg-tertiary)] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {r.href ? (
                        <a
                          href={r.href}
                          target={r.href.startsWith("/") ? undefined : "_blank"}
                          rel={r.href.startsWith("/") ? undefined : "noopener noreferrer"}
                          className="hover:underline"
                        >
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                      {new Date(r.occurredAt).toISOString().slice(0, 10)}
                    </p>
                  </div>
                  {r.platform && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${platformBadge(r.platform)}`}>
                      {platformLabel(r.platform)}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                    {groupLabel(r.group)}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${pill.cls}`}>
                    {pill.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
