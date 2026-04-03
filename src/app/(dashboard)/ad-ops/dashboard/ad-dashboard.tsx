"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";

type Request = { id: string; title: string; status: string; target_date: string | null; created_at: string };
type Asset = { id: string; asset_code: string; title: string; status: string; content_type: string | null; funnel_stage: string | null };
type Deployment = { id: string; status: string; campaign_name: string | null; launched_at: string | null; asset: { asset_code: string; title: string } | null };
type MetaAccount = { id: string; name: string; account_id: string; is_active: boolean };

type Props = {
  recentRequests: Request[];
  recentAssets: Asset[];
  activeDeployments: Deployment[];
  metaAccounts: MetaAccount[];
  requestCounts: { status: string }[];
  assetCounts: { status: string }[];
  canManage: boolean;
  currentDeptSlug: string;
};

const REQUEST_STATUS_STYLES: Record<string, string> = {
  draft:       "bg-gray-100 text-gray-500",
  submitted:   "bg-blue-50 text-blue-600",
  in_progress: "bg-amber-50 text-amber-600",
  review:      "bg-purple-50 text-purple-600",
  approved:    "bg-green-50 text-green-700",
  rejected:    "bg-red-50 text-red-500",
  cancelled:   "bg-gray-100 text-gray-400",
};

const ASSET_STATUS_STYLES: Record<string, string> = {
  draft:          "bg-gray-100 text-gray-500",
  pending_review: "bg-amber-50 text-amber-600",
  approved:       "bg-green-50 text-green-700",
  needs_revision: "bg-red-50 text-red-500",
  archived:       "bg-gray-100 text-gray-400",
};

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-blue-100 text-blue-700",
  MOF: "bg-amber-100 text-amber-700",
  BOF: "bg-green-100 text-green-700",
};

const MODULES = [
  { href: "/ad-ops/requests",    label: "Requests",      desc: "Creative briefs from Marketing" },
  { href: "/ad-ops/library",     label: "Asset Library", desc: "All produced creatives" },
  { href: "/ad-ops/deployments", label: "Deployments",   desc: "Active campaigns across Meta accounts" },
  { href: "/ad-ops/performance", label: "Performance",   desc: "Metrics, hook rate, ROAS, ThruPlay" },
];

function countByStatus(rows: { status: string }[], status: string) {
  return rows.filter((r) => r.status === status).length;
}

export function AdDashboard({
  recentRequests,
  recentAssets,
  activeDeployments,
  metaAccounts,
  requestCounts,
  assetCounts,
}: Props) {
  const totalRequests = requestCounts.length;
  const openRequests = requestCounts.filter((r) =>
    ["submitted", "in_progress", "review"].includes(r.status)
  ).length;
  const approvedAssets = countByStatus(assetCounts, "approved");
  const pendingReview = countByStatus(assetCounts, "pending_review");
  const needsRevision = countByStatus(assetCounts, "needs_revision");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Ad Operations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Shared workspace for Creatives &amp; Marketing · {metaAccounts.length} Meta account{metaAccounts.length !== 1 ? "s" : ""} connected
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Open Requests</p>
          <p className="text-2xl font-bold text-gray-900">{openRequests}</p>
          <p className="text-xs text-gray-400 mt-1">of {totalRequests} total</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Approved Assets</p>
          <p className="text-2xl font-bold text-gray-900">{approvedAssets}</p>
          <p className="text-xs text-gray-400 mt-1">ready to deploy</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Pending Review</p>
          <p className="text-2xl font-bold text-gray-900">{pendingReview}</p>
          {needsRevision > 0 && (
            <p className="text-xs text-red-400 mt-1">{needsRevision} need revision</p>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Active Campaigns</p>
          <p className="text-2xl font-bold text-gray-900">{activeDeployments.length}</p>
          <p className="text-xs text-gray-400 mt-1">live deployments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* Recent requests */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Recent Requests</h2>
            <Link href="/ad-ops/requests" className="text-xs text-gray-400 hover:text-gray-700">View all →</Link>
          </div>
          {recentRequests.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No requests yet</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentRequests.map((r) => (
                <li key={r.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${REQUEST_STATUS_STYLES[r.status] ?? ""}`}>
                    {r.status.replace("_", " ")}
                  </span>
                  <span className="flex-1 text-sm text-gray-800 truncate">{r.title}</span>
                  {r.target_date && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {format(parseISO(r.target_date), "d MMM")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Active deployments */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Active Deployments</h2>
            <Link href="/ad-ops/deployments" className="text-xs text-gray-400 hover:text-gray-700">View all →</Link>
          </div>
          {activeDeployments.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No active deployments</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {activeDeployments.map((d) => (
                <li key={d.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{d.campaign_name ?? d.asset?.title ?? "Unnamed"}</p>
                    {d.asset && <p className="text-xs text-gray-400">{d.asset.asset_code}</p>}
                  </div>
                  {d.launched_at && (
                    <span className="text-xs text-gray-400 shrink-0">
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
            <h2 className="text-sm font-semibold text-gray-700">Recent Assets</h2>
            <Link href="/ad-ops/library" className="text-xs text-gray-400 hover:text-gray-700">View library →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {recentAssets.map((a) => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs text-gray-500">{a.asset_code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ASSET_STATUS_STYLES[a.status] ?? ""}`}>
                    {a.status.replace("_", " ")}
                  </span>
                  {a.funnel_stage && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${FUNNEL_COLORS[a.funnel_stage] ?? "bg-gray-100 text-gray-500"}`}>
                      {a.funnel_stage}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                {a.content_type && <p className="text-xs text-gray-400 mt-0.5">{a.content_type}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module links */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Modules</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:shadow-sm transition-all group"
          >
            <p className="font-medium text-gray-900 group-hover:text-gray-700">{m.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
