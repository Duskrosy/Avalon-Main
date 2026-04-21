"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  TrackerFeedResponse,
  OrganicPostRow,
  AdRow,
  ContentItemRow,
} from "@/types/tracker-feed";
import { platformBadge } from "./ledger-helpers";

type GroupFilter = "" | "local" | "international" | "pcdlf";
type PlatformFilter = "" | "facebook" | "instagram" | "tiktok" | "youtube";
type Tab = "overall" | "organic" | "ads" | "unassigned";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function platformLabel(p: OrganicPostRow["platform"]): string {
  if (!p) return "—";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function groupLabel(g: OrganicPostRow["group"]): string {
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

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function fmtPHP(n: number): string {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  const [tab, setTab] = useState<Tab>("overall");
  const [data, setData] = useState<TrackerFeedResponse>({ organicPosts: [], ads: [], contentItems: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    qs.set("month", month);
    if (group) qs.set("group", group);
    if (platform) qs.set("platform", platform);
    router.replace(`?${qs.toString()}`, { scroll: false });
  }, [month, group, platform, router]);

  useEffect(() => {
    setSelectedDay(null);
  }, [month]);

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
        return r.json() as Promise<TrackerFeedResponse>;
      })
      .then((body) => {
        if (cancelled) return;
        setData({
          organicPosts: body.organicPosts ?? [],
          ads: body.ads ?? [],
          contentItems: body.contentItems ?? [],
        });
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message ?? e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [month, group, platform]);

  // Days that have any posted content (organic or ad).
  const postedDays = useMemo(() => {
    const s = new Set<string>();
    for (const p of data.organicPosts) s.add(ymdUTC(p.publishedAt));
    for (const a of data.ads) s.add(a.firstDate);
    return s;
  }, [data]);

  // Split content items by link state.
  const linkedAdItems = useMemo(
    () => data.contentItems.filter((i) => i.link.state === "ad"),
    [data.contentItems],
  );
  const linkedOrganicItems = useMemo(
    () => data.contentItems.filter((i) => i.link.state === "organic"),
    [data.contentItems],
  );
  const unlinkedItems = useMemo(
    () => data.contentItems.filter((i) => i.link.state === "unlinked"),
    [data.contentItems],
  );

  // Day-filter helpers.
  const filterByDay = <T extends { date: string }>(rows: T[]): T[] =>
    selectedDay ? rows.filter((r) => r.date === selectedDay) : rows;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Tracker</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
            Monthly ledger of linked content items, organic posts, Meta ads, and unassigned tasks.
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
        postedDays={postedDays}
        selectedDay={selectedDay}
        onToggleDay={(d) => setSelectedDay((cur) => (cur === d ? null : d))}
      />

      <TabSwitcher
        value={tab}
        onChange={setTab}
        counts={{
          overall: linkedAdItems.length + linkedOrganicItems.length,
          organic: data.organicPosts.length,
          ads: data.ads.length,
          unassigned: unlinkedItems.length,
        }}
      />

      {loading ? (
        <Notice>Loading…</Notice>
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <>
          {tab === "overall" && (
            <OverallPanel
              month={month}
              adItems={filterByDay(
                linkedAdItems
                  .map((i) => ({
                    item: i,
                    date: i.link.state === "ad" ? (i.link.metricDate ?? i.plannedWeekStart ?? "") : "",
                  }))
                  .filter((r) => !!r.date),
              )
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => r.item)}
              organicItems={filterByDay(
                linkedOrganicItems
                  .map((i) => ({
                    item: i,
                    date: i.link.state === "organic"
                      ? (i.link.publishedAt ? ymdUTC(i.link.publishedAt) : (i.plannedWeekStart ?? ""))
                      : "",
                  }))
                  .filter((r) => !!r.date),
              )
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => r.item)}
            />
          )}
          {tab === "organic" && (
            <OrganicPanel
              month={month}
              rows={filterByDay(
                data.organicPosts.map((p) => ({ post: p, date: ymdUTC(p.publishedAt) })),
              )
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => r.post)}
            />
          )}
          {tab === "ads" && (
            <AdsPanel
              month={month}
              rows={filterByDay(data.ads.map((a) => ({ ad: a, date: a.firstDate })))
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => r.ad)}
            />
          )}
          {tab === "unassigned" && (
            <UnassignedPanel
              month={month}
              rows={filterByDay(
                unlinkedItems
                  .map((i) => ({ item: i, date: i.plannedWeekStart ?? "" }))
                  .filter((r) => !!r.date),
              ).map((r) => r.item)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function Notice({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className={`flex items-center justify-center h-48 text-sm bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] ${tone === "error" ? "text-red-400" : "text-[var(--color-text-tertiary)]"}`}>
      {children}
    </div>
  );
}

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

function TabSwitcher({
  value, onChange, counts,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
  counts: { overall: number; organic: number; ads: number; unassigned: number };
}) {
  const opts: { key: Tab; label: string; count: number }[] = [
    { key: "overall",    label: "Overall",          count: counts.overall },
    { key: "organic",    label: "Organic",          count: counts.organic },
    { key: "ads",        label: "Ads",              count: counts.ads },
    { key: "unassigned", label: "Unassigned Tasks", count: counts.unassigned },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)] text-xs w-fit">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
            value === o.key
              ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <span>{o.label}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${value === o.key ? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]" : "bg-[var(--color-bg-tertiary)]/50 text-[var(--color-text-tertiary)]"}`}>
            {o.count}
          </span>
        </button>
      ))}
    </div>
  );
}

function MiniCalendar({
  month,
  postedDays,
  selectedDay,
  onToggleDay,
}: {
  month: string;
  postedDays: Set<string>;
  selectedDay: string | null;
  onToggleDay: (d: string) => void;
}) {
  const days = daysInMonth(month);
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
          <div key={`blank-${i}`} className="h-10" />
        ))}
        {days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const hasPost = postedDays.has(key);
          const isSelected = selectedDay === key;
          return (
            <button
              key={key}
              onClick={() => onToggleDay(key)}
              className={`h-10 rounded flex flex-col items-center justify-center text-[10px] transition-colors ${
                isSelected
                  ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
              }`}
              aria-label={`${key}${hasPost ? " — has posts" : ""}`}
            >
              <span className="leading-none">{d.getUTCDate()}</span>
              {hasPost ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`mt-0.5 w-3 h-3 ${isSelected ? "text-[var(--color-text-inverted)]" : "text-emerald-400"}`}
                  aria-hidden
                >
                  <polyline points="5 12 10 17 19 7" />
                </svg>
              ) : (
                <span className="mt-0.5 w-3 h-3" aria-hidden />
              )}
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

// ── Panels ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-[var(--color-border-primary)] flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
        {subtitle && <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function PanelCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-4 py-6 text-center text-sm text-[var(--color-text-tertiary)]">{text}</div>
  );
}

function OverallPanel({
  month, adItems, organicItems,
}: {
  month: string;
  adItems: ContentItemRow[];
  organicItems: ContentItemRow[];
}) {
  const monthName = formatMonth(month);
  return (
    <div className="space-y-4">
      <PanelCard>
        <SectionHeader
          title={`${monthName} · Ads`}
          subtitle="Content items linked to a Meta ad this month."
          right={<span className="text-[11px] text-[var(--color-text-tertiary)]">{adItems.length} item{adItems.length === 1 ? "" : "s"}</span>}
        />
        {adItems.length === 0 ? (
          <EmptyRow text="No linked ads in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Campaign</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Creative Title</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Product / Collection</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Promo Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-primary)]">
                {adItems.map((i) => {
                  const date = i.link.state === "ad" ? (i.link.metricDate ?? i.plannedWeekStart) : i.plannedWeekStart;
                  const campaign = i.link.state === "ad" ? i.link.campaignName : null;
                  return (
                    <tr key={i.id} className="hover:bg-[var(--color-bg-secondary)]/40">
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] tabular-nums">{fmtDate(date)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-primary)]">{campaign ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-primary)]">{i.title}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{i.productOrCollection ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)] font-mono text-xs">{i.promoCode ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionHeader
          title={`${monthName} · Organic`}
          subtitle="Content items linked to a published organic post this month."
          right={<span className="text-[11px] text-[var(--color-text-tertiary)]">{organicItems.length} item{organicItems.length === 1 ? "" : "s"}</span>}
        />
        {organicItems.length === 0 ? (
          <EmptyRow text="No linked organic posts in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Creative Title</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Purpose</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Impr</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Reach</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Eng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-primary)]">
                {organicItems.map((i) => {
                  const date = i.link.state === "organic" ? (i.link.publishedAt ? ymdUTC(i.link.publishedAt) : i.plannedWeekStart) : i.plannedWeekStart;
                  const impr = i.link.state === "organic" ? i.link.impressions : null;
                  const reach = i.link.state === "organic" ? i.link.reach : null;
                  const eng = i.link.state === "organic" ? i.link.engagements : null;
                  const url = i.link.state === "organic" ? i.link.postUrl : null;
                  return (
                    <tr key={i.id} className="hover:bg-[var(--color-bg-secondary)]/40">
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] tabular-nums">{fmtDate(date)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-primary)]">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">{i.title}</a>
                        ) : i.title}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{i.creativeAngle ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-secondary)]">{fmtNum(impr)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-secondary)]">{fmtNum(reach)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-secondary)]">{fmtNum(eng)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}

function OrganicPanel({ month, rows }: { month: string; rows: OrganicPostRow[] }) {
  const monthName = formatMonth(month);
  return (
    <PanelCard>
      <SectionHeader
        title={`${monthName} · Organic posts`}
        subtitle="All organic posts captured this month — including those not yet linked to a content item."
        right={<span className="text-[11px] text-[var(--color-text-tertiary)]">{rows.length} post{rows.length === 1 ? "" : "s"}</span>}
      />
      {rows.length === 0 ? (
        <EmptyRow text="No organic posts in this window." />
      ) : (
        <ul className="divide-y divide-[var(--color-border-primary)]">
          {rows.map((p) => (
            <li key={p.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-bg-secondary)]/40">
              {p.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                  className="w-10 h-10 rounded object-cover shrink-0 bg-[var(--color-bg-tertiary)]"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-[var(--color-bg-tertiary)] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                  {p.postUrl ? (
                    <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {p.captionPreview ?? "(no caption)"}
                    </a>
                  ) : (p.captionPreview ?? "(no caption)")}
                </p>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 tabular-nums">{ymdUTC(p.publishedAt)}</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] tabular-nums text-[var(--color-text-secondary)] shrink-0">
                <span>{fmtNum(p.impressions)} impr</span>
                <span>{fmtNum(p.reach)} reach</span>
                <span>{fmtNum(p.engagements)} eng</span>
              </div>
              {p.platform && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${platformBadge(p.platform)}`}>
                  {platformLabel(p.platform)}
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                {groupLabel(p.group)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

function AdsPanel({ month, rows }: { month: string; rows: AdRow[] }) {
  const monthName = formatMonth(month);
  const totalSpend = rows.reduce((n, r) => n + (r.spend ?? 0), 0);
  return (
    <PanelCard>
      <SectionHeader
        title={`${monthName} · Ads`}
        subtitle="All Meta ads with spend in this month."
        right={
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            {rows.length} ad{rows.length === 1 ? "" : "s"} · {fmtPHP(totalSpend)}
          </span>
        }
      />
      {rows.length === 0 ? (
        <EmptyRow text="No ads in this window." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">First Date</th>
                <th className="text-left px-4 py-2.5 font-semibold">Campaign</th>
                <th className="text-left px-4 py-2.5 font-semibold">Ad Name</th>
                <th className="text-left px-4 py-2.5 font-semibold">Asset Title</th>
                <th className="text-right px-4 py-2.5 font-semibold">Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-primary)]">
              {rows.map((a) => (
                <tr key={a.adId} className="hover:bg-[var(--color-bg-secondary)]/40">
                  <td className="px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] tabular-nums">{a.firstDate}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-primary)]">{a.campaignName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{a.adName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{a.assetTitle ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-[var(--color-text-primary)]">{fmtPHP(a.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

function UnassignedPanel({ month, rows }: { month: string; rows: ContentItemRow[] }) {
  const monthName = formatMonth(month);
  return (
    <PanelCard>
      <SectionHeader
        title={`${monthName} · Unassigned tasks`}
        subtitle="Content items planned for this month with no linked post or ad."
        right={<span className="text-[11px] text-[var(--color-text-tertiary)]">{rows.length} task{rows.length === 1 ? "" : "s"}</span>}
      />
      {rows.length === 0 ? (
        <EmptyRow text="All tasks in this window have linked content." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Week of</th>
                <th className="text-left px-4 py-2.5 font-semibold">Creative Title</th>
                <th className="text-left px-4 py-2.5 font-semibold">Group</th>
                <th className="text-left px-4 py-2.5 font-semibold">Purpose</th>
                <th className="text-left px-4 py-2.5 font-semibold">Product / Collection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-primary)]">
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-[var(--color-bg-secondary)]/40">
                  <td className="px-4 py-2.5 text-xs text-[var(--color-text-tertiary)] tabular-nums">{i.plannedWeekStart ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-primary)]">
                    <a href="/creatives/planner" className="hover:underline">{i.title}</a>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                      {groupLabel(i.group)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{i.creativeAngle ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{i.productOrCollection ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}
