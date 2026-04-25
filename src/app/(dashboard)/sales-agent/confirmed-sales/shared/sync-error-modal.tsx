"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { format, parseISO } from "date-fns";

// Inspector for orders that failed to sync to Shopify. Shows the latest
// error message + every prior attempt from order_shopify_syncs so the
// agent can see whether the failure is fresh or chronic, with a Retry
// button that hits the existing sync-retry endpoint.

type Sync = {
  id: string;
  attempt_number: number;
  status: string;
  error_message: string | null;
  shopify_order_id: string | null;
  created_at: string;
};

type Order = {
  id: string;
  avalon_order_number: string | null;
  sync_error: string | null;
};

type Props = {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  onRetried: () => void;
};

export function SyncErrorModal({ open, order, onClose, onRetried }: Props) {
  const [syncs, setSyncs] = useState<Sync[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !order) return;
    setLoading(true);
    setRetryError(null);
    fetch(`/api/sales/orders/${order.id}`)
      .then((r) => r.json())
      .then((j) => {
        const list = (j.order?.syncs ?? []) as Sync[];
        // Newest attempt first.
        list.sort((a, b) => b.attempt_number - a.attempt_number);
        setSyncs(list);
      })
      .finally(() => setLoading(false));
  }, [open, order]);

  if (!open || !order) return null;

  const onRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/sales/orders/${order.id}/sync-retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json();
        setRetryError(j.error ?? "Retry failed");
        return;
      }
      onRetried();
      onClose();
    } finally {
      setRetrying(false);
    }
  };

  const latestError =
    syncs.find((s) => s.status === "failed")?.error_message ??
    order.sync_error ??
    "(no error detail recorded)";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <AlertTriangle size={14} className="text-rose-600" />
            Sync failure — {order.avalon_order_number ?? "(no number yet)"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Latest error
            </div>
            <div className="text-xs bg-rose-50 border border-rose-200 rounded p-2 font-mono text-rose-900 whitespace-pre-wrap break-words">
              {latestError}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Attempt history
            </div>
            {loading && (
              <div className="text-xs text-gray-500">Loading…</div>
            )}
            {!loading && syncs.length === 0 && (
              <div className="text-xs text-gray-500">
                No attempt records yet. The reconciler will pick this up
                within five minutes; or click Retry now to try again.
              </div>
            )}
            <ul className="space-y-1.5">
              {syncs.map((s) => (
                <li
                  key={s.id}
                  className="text-xs border border-gray-200 rounded p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      Attempt #{s.attempt_number}
                    </span>
                    <span className="text-gray-500">
                      {format(parseISO(s.created_at), "MMM d, HH:mm:ss")}
                    </span>
                  </div>
                  <div className="mt-0.5 text-gray-600">
                    Status:{" "}
                    <span
                      className={
                        s.status === "succeeded"
                          ? "text-emerald-700"
                          : s.status === "failed"
                            ? "text-rose-700"
                            : "text-amber-700"
                      }
                    >
                      {s.status}
                    </span>
                    {s.shopify_order_id && (
                      <span className="ml-2 text-gray-500">
                        Shopify #{s.shopify_order_id}
                      </span>
                    )}
                  </div>
                  {s.error_message && (
                    <div className="mt-1 text-rose-700 font-mono whitespace-pre-wrap break-words">
                      {s.error_message}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {retryError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {retryError}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900"
          >
            Close
          </button>
          <button
            type="button"
            disabled={retrying}
            onClick={onRetry}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            <RefreshCw
              size={11}
              className={retrying ? "animate-spin" : ""}
            />
            {retrying ? "Retrying…" : "Retry sync"}
          </button>
        </div>
      </div>
    </div>
  );
}
