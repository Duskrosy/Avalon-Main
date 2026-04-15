"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";

type Alert = {
  id: string;
  type: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  source_table: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-[var(--color-error-light)] text-[var(--color-error)] border-red-200",
  error:    "bg-orange-100 text-orange-700 border-orange-200",
  warning:  "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-border-primary)]",
  info:     "bg-[var(--color-accent-light)] text-[var(--color-accent)] border-[var(--color-accent)]",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-[var(--color-error-light)]0",
  error:    "bg-orange-400",
  warning:  "bg-amber-400",
  info:     "bg-blue-400",
};

export function AlertsTab() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ acknowledged: String(showAcknowledged), limit: "100" });
    const res = await fetch(`/api/obs/alerts?${params}`);
    if (res.ok) setAlerts(await res.json());
    setLoading(false);
  }, [showAcknowledged]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  async function acknowledge(id: string) {
    await fetch(`/api/obs/alerts?id=${id}`, { method: "PATCH" });
    await fetchAlerts();
  }

  const critCount = alerts.filter((a) => a.severity === "critical" && !a.acknowledged).length;

  return (
    <div>
      {critCount > 0 && (
        <div className="mb-5 bg-[var(--color-error-light)] border border-red-200 rounded-[var(--radius-lg)] px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 bg-[var(--color-error-light)]0 rounded-full animate-pulse" />
          <span className="text-sm text-[var(--color-error)] font-medium">{critCount} critical alert{critCount !== 1 ? "s" : ""} require attention</span>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={(e) => setShowAcknowledged(e.target.checked)}
            className="rounded"
          />
          Show acknowledged
        </label>
        <span className="text-xs text-[var(--color-text-tertiary)]">{alerts.length} alerts</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {showAcknowledged ? "No acknowledged alerts." : "No active alerts."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`border rounded-[var(--radius-lg)] px-4 py-3 flex items-start gap-3 ${
                alert.acknowledged ? "opacity-60" : ""
              } ${SEVERITY_STYLES[alert.severity]}`}
            >
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[alert.severity]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold uppercase">{alert.severity}</span>
                  <span className="text-xs opacity-60">· {alert.type}</span>
                  {alert.source_table && (
                    <span className="text-xs opacity-60">· {alert.source_table}</span>
                  )}
                </div>
                <p className="text-sm">{alert.message}</p>
                <p className="text-xs opacity-60 mt-0.5">
                  {formatDistanceToNow(parseISO(alert.created_at), { addSuffix: true })}
                  {alert.acknowledged_at && (
                    <span className="ml-2">
                      · Acknowledged {formatDistanceToNow(parseISO(alert.acknowledged_at), { addSuffix: true })}
                    </span>
                  )}
                </p>
              </div>
              {!alert.acknowledged && (
                <button
                  onClick={() => acknowledge(alert.id)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-[var(--color-bg-primary)]/60 hover:bg-[var(--color-bg-primary)]/90 border border-current opacity-70 hover:opacity-100 shrink-0"
                >
                  Ack
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
