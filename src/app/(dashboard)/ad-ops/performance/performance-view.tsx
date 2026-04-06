"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type DeploymentOption = {
  id: string;
  campaign_name: string | null;
  status: string;
  meta_account_id: string | null;
  asset: {
    asset_code: string;
    title: string;
    thumbnail_url: string | null;
    content_type: string | null;
    hook_type: string | null;
  } | null;
};

type Group = {
  id: string;
  name: string;
};

type AccountLink = {
  id: string;
  group_id: string | null;
  currency: string | null;
};

type Snapshot = {
  id: string;
  metric_date: string;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  conversions: number | null;
  conversion_value: number | null;
  video_plays: number | null;
  video_plays_25pct: number | null;
  hook_rate: number | null;
  thruplay_rate: number | null;
  ctr: number | null;
  roas: number | null;
};

type Props = {
  deployments: DeploymentOption[];
  groups: Group[];
  accounts: AccountLink[];
  canManage: boolean;
};

function currencySymbol(code: string | null): string {
  const map: Record<string, string> = { USD: "$", PHP: "₱", EUR: "€", GBP: "£", SGD: "S$", AUD: "A$" };
  return map[code ?? ""] ?? (code ?? "$");
}

function fmt(n: number | null, decimals = 2, suffix = "") {
  if (n == null) return "—";
  return n.toFixed(decimals) + suffix;
}

function fmtK(n: number | null) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function PerformanceView({ deployments, groups, accounts, canManage }: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(deployments[0]?.id ?? "");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"charts" | "creatives">("charts");
  const [latestSnapshotMap, setLatestSnapshotMap] = useState<Record<string, Snapshot>>({});
  const [creativesLoading, setCreativesLoading] = useState(false);
  const [form, setForm] = useState({
    metric_date: new Date().toISOString().split("T")[0],
    impressions: "",
    clicks: "",
    spend: "",
    conversions: "",
    conversion_value: "",
    video_plays: "",
    video_plays_25pct: "",
  });

  // Build a set of meta_account IDs that belong to the selected group
  const accountIdsInGroup: Set<string> = selectedGroupId
    ? new Set(accounts.filter((a) => a.group_id === selectedGroupId).map((a) => a.id))
    : new Set();

  // Filter deployments based on selected group
  const filteredDeployments = selectedGroupId
    ? deployments.filter((d) => d.meta_account_id && accountIdsInGroup.has(d.meta_account_id))
    : deployments;

  // Auto-select first deployment when group changes
  useEffect(() => {
    if (!filteredDeployments.find((d) => d.id === selectedId)) {
      setSelectedId(filteredDeployments[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  const fetchSnapshots = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    const res = await fetch(`/api/ad-ops/performance?deployment_id=${selectedId}&limit=60`);
    if (res.ok) setSnapshots(await res.json());
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  // Fetch latest snapshot for each deployment when switching to creatives view
  useEffect(() => {
    if (viewMode !== "creatives") return;
    setCreativesLoading(true);
    Promise.allSettled(
      filteredDeployments.map((d) =>
        fetch(`/api/ad-ops/performance?deployment_id=${d.id}&limit=1`)
          .then((r) => (r.ok ? r.json() : []))
          .then((data: Snapshot[]) => ({ id: d.id, snapshot: data[0] ?? null }))
      )
    ).then((results) => {
      const map: Record<string, Snapshot> = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.snapshot) {
          map[r.value.id] = r.value.snapshot;
        }
      }
      setLatestSnapshotMap(map);
      setCreativesLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedGroupId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      deployment_id: selectedId,
      metric_date: form.metric_date,
      impressions: form.impressions ? parseInt(form.impressions) : null,
      clicks: form.clicks ? parseInt(form.clicks) : null,
      spend: form.spend ? parseFloat(form.spend) : null,
      conversions: form.conversions ? parseInt(form.conversions) : null,
      conversion_value: form.conversion_value ? parseFloat(form.conversion_value) : null,
      video_plays: form.video_plays ? parseInt(form.video_plays) : null,
      video_plays_25pct: form.video_plays_25pct ? parseInt(form.video_plays_25pct) : null,
    };
    const res = await fetch("/api/ad-ops/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await fetchSnapshots();
      setShowAddModal(false);
    }
    setSaving(false);
  }

  const selectedDep = filteredDeployments.find((d) => d.id === selectedId);
  const selectedAccount = selectedDep?.meta_account_id
    ? accounts.find((a) => a.id === selectedDep.meta_account_id)
    : undefined;
  const depCurrency: string | null = selectedAccount?.currency ?? null;
  const sym = currencySymbol(depCurrency);
  const chartData = [...snapshots]
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
    .map((s) => ({
      date: format(parseISO(s.metric_date), "d MMM"),
      "Hook Rate": s.hook_rate != null ? parseFloat(s.hook_rate.toFixed(2)) : null,
      "ThruPlay Rate": s.thruplay_rate != null ? parseFloat(s.thruplay_rate.toFixed(2)) : null,
      "CTR": s.ctr != null ? parseFloat(s.ctr.toFixed(3)) : null,
      "ROAS": s.roas != null ? parseFloat(s.roas.toFixed(2)) : null,
    }));

  const totals = snapshots.reduce(
    (acc, s) => ({
      spend: acc.spend + (s.spend ?? 0),
      conversion_value: acc.conversion_value + (s.conversion_value ?? 0),
      impressions: acc.impressions + (s.impressions ?? 0),
      clicks: acc.clicks + (s.clicks ?? 0),
      conversions: acc.conversions + (s.conversions ?? 0),
    }),
    { spend: 0, conversion_value: 0, impressions: 0, clicks: 0, conversions: 0 },
  );
  const overallROAS = totals.spend > 0 ? totals.conversion_value / totals.spend : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Performance</h1>
        <p className="text-sm text-gray-500 mt-1">Daily metrics by deployment</p>
      </div>

      {/* Account group tabs */}
      {groups.length > 0 && (
        <div className="flex items-center gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setSelectedGroupId(null)}
            className={`px-4 py-2.5 text-sm font-medium shrink-0 border-b-2 transition-colors ${
              selectedGroupId === null
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            All
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`px-4 py-2.5 text-sm font-medium shrink-0 border-b-2 transition-colors ${
                selectedGroupId === g.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* Deployment selector + view toggle */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {viewMode === "charts" && (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 flex-1 max-w-sm"
          >
            {filteredDeployments.length === 0 && <option value="">No deployments</option>}
            {filteredDeployments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.campaign_name ?? d.asset?.title ?? d.id.slice(0, 8)} ({d.status})
              </option>
            ))}
          </select>
        )}
        {selectedId && viewMode === "charts" && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Log Metrics
          </button>
        )}
        <div className="ml-auto flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("charts")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "charts"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Charts
          </button>
          <button
            onClick={() => setViewMode("creatives")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "creatives"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Creatives
          </button>
        </div>
      </div>

      {/* Creatives view */}
      {viewMode === "creatives" && (
        <>
          {creativesLoading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading creatives...</div>
          ) : filteredDeployments.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-12 text-center">
              <p className="text-sm text-gray-400">No deployments in this group.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredDeployments.map((dep) => {
                const snap = latestSnapshotMap[dep.id] ?? null;
                const depAccount = dep.meta_account_id
                  ? accounts.find((a) => a.id === dep.meta_account_id)
                  : undefined;
                const cardSym = currencySymbol(depAccount?.currency ?? null);
                const statusColors: Record<string, string> = {
                  active: "bg-green-100 text-green-700",
                  paused: "bg-amber-100 text-amber-700",
                  ended: "bg-gray-100 text-gray-500",
                };
                const badgeClass = statusColors[dep.status] ?? "bg-gray-100 text-gray-500";
                const initials = dep.asset?.asset_code
                  ? dep.asset.asset_code.slice(0, 2).toUpperCase()
                  : (dep.campaign_name ?? "??").slice(0, 2).toUpperCase();
                return (
                  <div
                    key={dep.id}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-gray-100 shrink-0">
                      {dep.asset?.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={dep.asset.thumbnail_url}
                          alt={dep.asset.title ?? dep.asset.asset_code}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-xl font-bold text-gray-400 font-mono">{initials}</span>
                        </div>
                      )}
                      {/* Status badge */}
                      <span
                        className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}
                      >
                        {dep.status}
                      </span>
                    </div>

                    {/* Card body */}
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      {/* Content type + hook type tags */}
                      {(dep.asset?.content_type || dep.asset?.hook_type) && (
                        <div className="flex gap-1 flex-wrap">
                          {dep.asset.content_type && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              {dep.asset.content_type}
                            </span>
                          )}
                          {dep.asset.hook_type && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              {dep.asset.hook_type}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Asset code */}
                      {dep.asset?.asset_code && (
                        <p className="text-[10px] font-mono text-gray-400">{dep.asset.asset_code}</p>
                      )}

                      {/* Campaign name */}
                      <p className="text-sm text-gray-800 line-clamp-2 leading-snug">
                        {dep.campaign_name ?? dep.asset?.title ?? dep.id.slice(0, 8)}
                      </p>

                      {/* Metrics */}
                      {snap ? (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
                          {([
                            ["Spend", snap.spend != null ? `${cardSym}${fmt(snap.spend, 2)}` : "—"],
                            ["ROAS", snap.roas != null ? `${fmt(snap.roas, 2)}x` : "—"],
                            ["CTR", snap.ctr != null ? `${fmt(snap.ctr * 100, 2)}%` : "—"],
                            ["Impr.", fmtK(snap.impressions)],
                            ["Clicks", fmtK(snap.clicks)],
                          ] as [string, string][]).map(([label, value]) => (
                            <div key={label} className="flex flex-col">
                              <span className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</span>
                              <span className="text-xs font-medium text-gray-700">{value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 mt-1">No data yet</p>
                      )}

                      {/* View details */}
                      <button
                        onClick={() => {
                          setSelectedId(dep.id);
                          setViewMode("charts");
                        }}
                        className="mt-auto pt-2 text-xs text-gray-500 hover:text-gray-900 text-left transition-colors"
                      >
                        View details →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {viewMode === "charts" && selectedDep && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total Spend</p>
              <p className="text-xl font-bold text-gray-900">{sym}{totals.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Conv. Value</p>
              <p className="text-xl font-bold text-gray-900">{sym}{totals.conversion_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">ROAS</p>
              <p className="text-xl font-bold text-gray-900">{overallROAS != null ? overallROAS.toFixed(2) + "x" : "—"}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Impressions</p>
              <p className="text-xl font-bold text-gray-900">{fmtK(totals.impressions)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Conversions</p>
              <p className="text-xl font-bold text-gray-900">{totals.conversions.toLocaleString()}</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
          ) : snapshots.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-12 text-center">
              <p className="text-sm text-gray-400">No metrics logged yet for this deployment.</p>
            </div>
          ) : (
            <>
              {/* Charts */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Hook Rate & ThruPlay Rate (%)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => [`${v}%`]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="Hook Rate" stroke="#6366f1" dot={false} strokeWidth={2} connectNulls />
                      <Line type="monotone" dataKey="ThruPlay Rate" stroke="#f59e0b" dot={false} strokeWidth={2} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">ROAS (daily)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="x" />
                      <Tooltip formatter={(v) => [`${v}x`]} />
                      <Line type="monotone" dataKey="ROAS" stroke="#10b981" dot={false} strokeWidth={2} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Daily table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Daily Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="px-4 py-3 text-left font-medium">Date</th>
                        <th className="px-4 py-3 text-right font-medium">Spend</th>
                        <th className="px-4 py-3 text-right font-medium">Conv. Value</th>
                        <th className="px-4 py-3 text-right font-medium">ROAS</th>
                        <th className="px-4 py-3 text-right font-medium">Impressions</th>
                        <th className="px-4 py-3 text-right font-medium">Clicks</th>
                        <th className="px-4 py-3 text-right font-medium">CTR</th>
                        <th className="px-4 py-3 text-right font-medium">Hook Rate</th>
                        <th className="px-4 py-3 text-right font-medium">ThruPlay</th>
                        <th className="px-4 py-3 text-right font-medium">Conversions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[...snapshots]
                        .sort((a, b) => b.metric_date.localeCompare(a.metric_date))
                        .map((s) => (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-700 font-medium">
                              {format(parseISO(s.metric_date), "d MMM yyyy")}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {s.spend != null ? `${sym}${s.spend.toFixed(0)}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {s.conversion_value != null ? `${sym}${s.conversion_value.toFixed(0)}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-800">
                              {fmt(s.roas, 2, "x")}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">{fmtK(s.impressions)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{fmtK(s.clicks)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{fmt(s.ctr, 3, "%")}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(s.hook_rate, 1, "%")}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{fmt(s.thruplay_rate, 1, "%")}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{s.conversions ?? "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {filteredDeployments.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No deployments in this group.</p>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Log Daily Metrics</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                <input
                  required
                  type="date"
                  value={form.metric_date}
                  onChange={(e) => setForm((f) => ({ ...f, metric_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["impressions", "Impressions"],
                  ["clicks", "Clicks"],
                  ["spend", "Spend ($)"],
                  ["conversions", "Conversions"],
                  ["conversion_value", "Conv. Value ($)"],
                  ["video_plays", "3s Video Plays"],
                  ["video_plays_25pct", "25% ThruPlay"],
                ] as [keyof typeof form, string][]).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                    <input
                      type="number"
                      min="0"
                      step={key === "spend" || key === "conversion_value" ? "0.01" : "1"}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">Hook Rate, ThruPlay Rate, CTR, and ROAS are calculated automatically.</p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
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
