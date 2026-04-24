"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { CenterSpinner } from "@/components/ui/center-spinner";

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
  critical: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  high:     "bg-orange-100 text-orange-700",
  medium:   "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  low:      "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
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
            <span className="text-xs bg-[var(--color-error-light)] text-[var(--color-error)] px-3 py-1.5 rounded-lg font-semibold">
              {criticalCount} critical
            </span>
          )}
          {highCount > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-semibold">
              {highCount} high
            </span>
          )}
          <span className="text-xs text-[var(--color-text-secondary)]">{errors.length} unresolved total</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-5">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
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
        <CenterSpinner />
      ) : errors.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {showResolved ? "No resolved errors on record." : "No unresolved errors. All clear."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((err) => (
            <div key={err.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
              <div
                className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-[var(--color-surface-hover)]"
                onClick={() => setExpanded(expanded === err.id ? null : err.id)}
              >
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 shrink-0 ${SEVERITY_STYLES[err.severity]}`}>
                  {err.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-xs text-[var(--color-text-secondary)]">{err.error_type}</span>
                    {err.module && <span className="text-xs text-[var(--color-text-tertiary)]">· {err.module}</span>}
                    {err.request_path && (
                      <span className="text-xs text-[var(--color-text-tertiary)]">· {err.request_method} {err.request_path}</span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--color-text-primary)] truncate">{err.message}</p>
                </div>
                <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                  {formatDistanceToNow(parseISO(err.created_at), { addSuffix: true })}
                </span>
              </div>

              {expanded === err.id && (
                <div className="border-t border-[var(--color-border-secondary)] px-4 py-3 bg-[var(--color-bg-secondary)] space-y-2">
                  {err.stack_trace && (
                    <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] rounded-lg p-3 overflow-x-auto border border-[var(--color-border-secondary)] max-h-48 overflow-y-auto">
                      {err.stack_trace}
                    </pre>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    {!err.resolved ? (
                      <button
                        onClick={() => resolve(err.id, true)}
                        className="text-xs bg-[var(--color-success-light)] text-[var(--color-success)] border border-green-200 px-3 py-1.5 rounded-lg hover:bg-[var(--color-success-light)]"
                      >
                        Mark resolved
                      </button>
                    ) : (
                      <button
                        onClick={() => resolve(err.id, false)}
                        className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-border-primary)]"
                      >
                        Reopen
                      </button>
                    )}
                    {err.resolved_at && (
                      <span className="text-xs text-[var(--color-text-tertiary)]">
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
