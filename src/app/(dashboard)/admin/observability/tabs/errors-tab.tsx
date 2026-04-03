"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";

type ErrorLog = {
  id: string;
  error_type: string;
  message: string;
  stack_trace: string | null;
  module: string | null;
  severity: "low" | "medium" | "high" | "critical";
  actor_id: string | null;
  request_path: string | null;
  request_method: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high:     "bg-orange-100 text-orange-700",
  medium:   "bg-amber-50 text-amber-600",
  low:      "bg-gray-100 text-gray-500",
};

export function ErrorsTab() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ resolved: String(showResolved), limit: "100" });
    const res = await fetch(`/api/obs/errors?${params}`);
    if (res.ok) setErrors(await res.json());
    setLoading(false);
  }, [showResolved]);

  useEffect(() => { fetchErrors(); }, [fetchErrors]);

  async function resolve(id: string, resolved: boolean) {
    await fetch(`/api/obs/errors?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    await fetchErrors();
    setExpanded(null);
  }

  const criticalCount = errors.filter((e) => e.severity === "critical").length;
  const highCount = errors.filter((e) => e.severity === "high").length;

  return (
    <div>
      {/* Summary */}
      {!showResolved && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {criticalCount > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg font-semibold">
              {criticalCount} critical
            </span>
          )}
          {highCount > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-semibold">
              {highCount} high
            </span>
          )}
          <span className="text-xs text-gray-500">{errors.length} unresolved total</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-5">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded"
          />
          Show resolved
        </label>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : errors.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">
            {showResolved ? "No resolved errors on record." : "No unresolved errors. All clear."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((err) => (
            <div key={err.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(expanded === err.id ? null : err.id)}
              >
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 shrink-0 ${SEVERITY_STYLES[err.severity]}`}>
                  {err.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-xs text-gray-600">{err.error_type}</span>
                    {err.module && <span className="text-xs text-gray-400">· {err.module}</span>}
                    {err.request_path && (
                      <span className="text-xs text-gray-400">· {err.request_method} {err.request_path}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 truncate">{err.message}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatDistanceToNow(parseISO(err.created_at), { addSuffix: true })}
                </span>
              </div>

              {expanded === err.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                  {err.stack_trace && (
                    <pre className="text-xs text-gray-600 bg-white rounded-lg p-3 overflow-x-auto border border-gray-100 max-h-48 overflow-y-auto">
                      {err.stack_trace}
                    </pre>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    {!err.resolved ? (
                      <button
                        onClick={() => resolve(err.id, true)}
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100"
                      >
                        Mark resolved
                      </button>
                    ) : (
                      <button
                        onClick={() => resolve(err.id, false)}
                        className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                      >
                        Reopen
                      </button>
                    )}
                    {err.resolved_at && (
                      <span className="text-xs text-gray-400">
                        Resolved {formatDistanceToNow(parseISO(err.resolved_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
