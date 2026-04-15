"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";

type Request = { id: string; title: string; status: string; target_date: string | null; created_at: string };
type Asset = { id: string; asset_code: string; title: string; status: string; content_type: string | null; funnel_stage: string | null };
type Deployment = { id: string; status: string; campaign_name: string | null; launched_at: string | null; asset: { asset_code: string; title: string } | null };
type MetaAccount = { id: string; name: string; account_id: string; is_active: boolean; currency: string | null };

type SyncRun = {
  id: string;
  status: string;
  triggered_by: string | null;
  sync_date: string | null;
  completed_at: string | null;
  records_processed: number;
  account_results: { account_id: string; name: string; status: string; records?: number; error?: string }[] | null;
  error_log: string | null;
} | null;

type Props = {
  recentRequests: Request[];
  recentAssets: Asset[];
  activeDeployments: Deployment[];
  metaAccounts: MetaAccount[];
  requestCounts: { status: string }[];
  assetCounts: { status: string }[];
  canManage: boolean;
  lastSync: SyncRun;
  canSync: boolean;
  currentDeptSlug: string;
  yesterdayDate: string;
  hasYesterdayData: boolean;
  yesterdayTotals: { spend: number; impressions: number; conversions: number; roas: number | null };
  topByROAS: { name: string; roas: number } | null;
  topBySpend: { name: string; spend: number } | null;
  perAccountSpend: { id: string; name: string; spend: number; currency: string | null }[];
  totalsCurrency: string | null;
};

const REQUEST_STATUS_STYLES: Record<string, string> = {
  draft:       "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  submitted:   "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  in_progress: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  review:      "bg-purple-50 text-purple-600",
  approved:    "bg-[var(--color-success-light)] text-[var(--color-success)]",
  rejected:    "bg-[var(--color-error-light)] text-[var(--color-error)]",
  cancelled:   "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]",
};

const ASSET_STATUS_STYLES: Record<string, string> = {
  draft:          "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  pending_review: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  approved:       "bg-[var(--color-success-light)] text-[var(--color-success)]",
  needs_revision: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  archived:       "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]",
};

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  MOF: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
  BOF: "bg-[var(--color-success-light)] text-[var(--color-success)]",
};

const MODULES = [
  { href: "/ad-ops/campaigns",   label: "Live Campaigns", desc: "Auto-synced from Meta — all campaigns & ad stats" },
  { href: "/ad-ops/requests",    label: "Requests",       desc: "Creative briefs from Marketing" },
  { href: "/ad-ops/library",     label: "Asset Library",  desc: "All produced creatives" },
  { href: "/ad-ops/deployments", label: "Deployments",    desc: "Active campaigns across Meta accounts" },
  { href: "/ad-ops/performance", label: "Performance",    desc: "Metrics, hook rate, ROAS, ThruPlay" },
];

function countByStatus(rows: { status: string }[], status: string) {
  return rows.filter((r) => r.status === status).length;
}

function currencySymbol(code: string | null): string {
  const map: Record<string, string> = { USD: "$", PHP: "₱", EUR: "€", GBP: "£", SGD: "S$", AUD: "A$" };
  return map[code ?? ""] ?? (code ?? "$");
}

function fmtCurrency(n: number, currency: string | null = null) {
  return currencySymbol(currency) + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function AdDashboard({
  recentRequests,
  recentAssets,
  activeDeployments,
  metaAccounts,
  requestCounts,
  assetCounts,
  lastSync,
  canSync,
  yesterdayDate,
  hasYesterdayData,
  yesterdayTotals,
  topByROAS,
  topBySpend,
  perAccountSpend,
  totalsCurrency,
}: Props) {
  const { toast, setToast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/ad-ops/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSyncError(body.error ?? `Sync failed (${res.status})`);
      } else {
        setToast({ message: "Meta ads synced successfully", type: "success" });
      }
    } catch {
      setSyncError("Network error — sync request failed");
    } finally {
      setSyncing(false);
    }
  }

  const totalRequests = requestCounts.length;
  const openRequests = requestCounts.filter((r) =>
    ["submitted", "in_progress", "review"].includes(r.status)
  ).length;
  const approvedAssets = countByStatus(assetCounts, "approved");
  const pendingReview = countByStatus(assetCounts, "pending_review");
  const needsRevision = countByStatus(assetCounts, "needs_revision");

  // Format yesterday label
  let yesterdayLabel = "Yesterday";
  try {
    yesterdayLabel = format(parseISO(yesterdayDate), "d MMM yyyy");
  } catch {
    // keep default
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Ad Operations</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Shared workspace for Creatives &amp; Marketing · {metaAccounts.length} Meta account{metaAccounts.length !== 1 ? "s" : ""} connected
        </p>
      </div>

      {/* ── Yesterday's Performance ───────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Yesterday&apos;s Performance</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{yesterdayLabel}</span>
        </div>

        {!hasYesterdayData ? (
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-5 py-8 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-[var(--color-text-tertiary)]">No data yet — sync to get yesterday&apos;s metrics</p>
            {canSync && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
              >
                {syncing ? "Syncing…" : "Sync Now"}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Totals row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total Spend{totalsCurrency === null && perAccountSpend.length > 1 ? " (mixed)" : ""}</p>
                <p className="text-xl font-bold text-[var(--color-text-primary)]">{fmtCurrency(yesterdayTotals.spend, totalsCurrency)}</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Impressions</p>
                <p className="text-xl font-bold text-[var(--color-text-primary)]">{fmtK(yesterdayTotals.impressions)}</p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Overall ROAS</p>
                <p className="text-xl font-bold text-[var(--color-text-primary)]">
                  {yesterdayTotals.roas != null ? yesterdayTotals.roas.toFixed(2) + "x" : "—"}
                </p>
              </div>
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">Conversions</p>
                <p className="text-xl font-bold text-[var(--color-text-primary)]">{yesterdayTotals.conversions.toLocaleString()}</p>
              </div>
            </div>

            {/* Top campaigns + per-account */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {topByROAS && (
                <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                  <p className="text-xs text-[var(--color-text-secondary)] mb-1 uppercase tracking-wide">Top Campaign · ROAS</p>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate mb-1">{topByROAS.name}</p>
                  <p className="text-xl font-bold text-[var(--color-success)]">{topByROAS.roas.toFixed(2)}x</p>
                </div>
              )}
              {topBySpend && (
                <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                  <p className="text-xs text-[var(--color-text-secondary)] mb-1 uppercase tracking-wide">Top Campaign · Spend</p>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate mb-1">{topBySpend.name}</p>
                  <p className="text-xl font-bold text-[var(--color-text-primary)]">{fmtCurrency(topBySpend.spend, totalsCurrency)}</p>
                </div>
              )}
              {perAccountSpend.map((a) => (
                <div key={a.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                  <p className="text-xs text-[var(--color-text-secondary)] mb-1 uppercase tracking-wide">Account Spend</p>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate mb-1">{a.name}</p>
                  <p className="text-xl font-bold text-[var(--color-text-primary)]">{fmtCurrency(a.spend, a.currency)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Meta Sync status */}
      {canSync && (
        <div className="mb-6 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] bg-[var(--color-bg-primary)] p-4 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-1">Meta Ads Sync</p>
            {lastSync ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                  lastSync.status === "success" ? "bg-[var(--color-success-light)] text-[var(--color-success)]" :
                  lastSync.status === "failed"  ? "bg-[var(--color-error-light)] text-[var(--color-error)]" :
                  "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                }`}>
                  {lastSync.status === "success" ? "✓" : lastSync.status === "failed" ? "✕" : "⟳"} {lastSync.status}
                </span>
                {lastSync.completed_at && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {format(parseISO(lastSync.completed_at), "d MMM yyyy, h:mm a")}
                    {lastSync.triggered_by && ` · ${lastSync.triggered_by}`}
                  </span>
                )}
                {lastSync.records_processed > 0 && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">{lastSync.records_processed} records</span>
                )}
                {lastSync.account_results && lastSync.account_results.length > 0 && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {lastSync.account_results.filter((r) => r.status === "ok").length}/{lastSync.account_results.length} accounts ok
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-tertiary)]">Never synced — click Sync Now to pull Meta data</p>
            )}
            {syncError && <p className="text-xs text-[var(--color-error)] mt-1">{syncError}</p>}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="shrink-0 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Syncing…
              </>
            ) : "Sync Now"}
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Open Requests</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{openRequests}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">of {totalRequests} total</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Approved Assets</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{approvedAssets}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">ready to deploy</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Pending Review</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{pendingReview}</p>
          {needsRevision > 0 && (
            <p className="text-xs text-red-400 mt-1">{needsRevision} need revision</p>
          )}
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Active Campaigns</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{activeDeployments.length}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">live deployments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* Recent requests */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent Requests</h2>
            <Link href="/ad-ops/requests" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">View all →</Link>
          </div>
          {recentRequests.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-tertiary)]">No requests yet</div>
          ) : (
            <ul className="divide-y divide-[var(--color-border-secondary)]">
              {recentRequests.map((r) => (
                <li key={r.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${REQUEST_STATUS_STYLES[r.status] ?? ""}`}>
                    {r.status.replace("_", " ")}
                  </span>
                  <span className="flex-1 text-sm text-[var(--color-text-primary)] truncate">{r.title}</span>
                  {r.target_date && (
                    <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                      {format(parseISO(r.target_date), "d MMM")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Active deployments */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Active Deployments</h2>
            <Link href="/ad-ops/deployments" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">View all →</Link>
          </div>
          {activeDeployments.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-tertiary)]">No active deployments</div>
          ) : (
            <ul className="divide-y divide-[var(--color-border-secondary)]">
              {activeDeployments.map((d) => (
                <li key={d.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-text-primary)] truncate">{d.campaign_name ?? d.asset?.title ?? "Unnamed"}</p>
                    {d.asset && <p className="text-xs text-[var(--color-text-tertiary)]">{d.asset.asset_code}</p>}
                  </div>
                  {d.launched_at && (
                    <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                      {format(parseISO(d.launched_at), "d MMM")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent assets */}
      {recentAssets.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent Assets</h2>
            <Link href="/ad-ops/library" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">View library →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {recentAssets.map((a) => (
              <div key={a.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs text-[var(--color-text-secondary)]">{a.asset_code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ASSET_STATUS_STYLES[a.status] ?? ""}`}>
                    {a.status.replace("_", " ")}
                  </span>
                  {a.funnel_stage && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${FUNNEL_COLORS[a.funnel_stage] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}>
                      {a.funnel_stage}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{a.title}</p>
                {a.content_type && <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{a.content_type}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module links */}
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Modules</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 hover:border-[var(--color-border-primary)] hover:shadow-[var(--shadow-sm)] transition-all group"
          >
            <p className="font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-text-primary)]">{m.label}</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{m.desc}</p>
          </Link>
        ))}
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
