"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, X } from "lucide-react";

// Module-level cache for /api/sales/ad-creatives responses. Keyed by query
// string. 5-minute TTL — Meta sync runs at least daily so older creative
// metadata is fine for picking. Avoids cold-start every time the modal opens.
type CachedResponse = { at: number; data: CreativeItem[] };
const CREATIVES_CACHE = new Map<string, CachedResponse>();
const CREATIVES_TTL_MS = 5 * 60_000;

// Modal for marking a synced order complete with post-delivery
// attribution. Lives separate from the create drawer because completion
// happens days later (when the COD parcel comes back), and the fields
// captured here drive reporting (net GMV, abandoned-cart recovery, ad
// attribution, Alex AI coverage).
//
// Net value defaults to empty — agents must confirm the actually
// collected amount. Ad creative is required and pulled from the live
// Meta-backed picker so attribution data stays clean (no free text).

type CreativeItem = {
  ad_id: string;
  ad_name: string;
  campaign_name: string | null;
  campaign_date: string | null;
  status: string;
};

type Props = {
  open: boolean;
  order: {
    id: string;
    avalon_order_number: string | null;
    shopify_order_name?: string | null;
    final_total_amount: number;
    net_value_amount?: number | null;
    is_abandoned_cart?: boolean | null;
  } | null;
  onClose: () => void;
  onCompleted: () => void;
};

export function CompleteOrderModal({
  open,
  order,
  onClose,
  onCompleted,
}: Props) {
  const [netValue, setNetValue] = useState<number | null>(null);
  const [creativeQuery, setCreativeQuery] = useState("");
  const [creatives, setCreatives] = useState<CreativeItem[]>([]);
  const [selectedCreative, setSelectedCreative] = useState<CreativeItem | null>(
    null,
  );
  const [isAbandonedCart, setIsAbandonedCart] = useState(false);
  const [alexLevel, setAlexLevel] = useState<"none" | "partial" | "full">(
    "none",
  );
  const [loadingCreatives, setLoadingCreatives] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the modal opens for a new order. Net value is
  // intentionally left blank — agents should not autofill the collected
  // amount from the order total because it would mask short-payments.
  //
  // Depend on order.id (stable string) — NOT the order object itself, since
  // the parent re-creates the object reference on every render, which would
  // spuriously reset selectedCreative right after the user clicked it.
  useEffect(() => {
    if (!open || !order) return;
    setNetValue(order.net_value_amount ?? null);
    setCreativeQuery("");
    setSelectedCreative(null);
    setIsAbandonedCart(order.is_abandoned_cart ?? false);
    setAlexLevel("none");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  // Debounced creative search with module-level cache. Hits the Meta-backed
  // picker endpoint via cache first; on miss, fetches and stores. 200ms
  // debounce keeps typing responsive without spam.
  useEffect(() => {
    if (!open) return;
    const cached = CREATIVES_CACHE.get(creativeQuery);
    if (cached && Date.now() - cached.at < CREATIVES_TTL_MS) {
      setCreatives(cached.data);
      setLoadingCreatives(false);
      return;
    }
    const t = setTimeout(() => {
      setLoadingCreatives(true);
      const params = new URLSearchParams();
      if (creativeQuery) params.set("q", creativeQuery);
      fetch(`/api/sales/ad-creatives?${params.toString()}`)
        .then((r) => r.json())
        .then((j) => {
          const list = (j.creatives ?? []) as CreativeItem[];
          CREATIVES_CACHE.set(creativeQuery, { at: Date.now(), data: list });
          setCreatives(list);
        })
        .catch(() => setCreatives([]))
        .finally(() => setLoadingCreatives(false));
    }, 200);
    return () => clearTimeout(t);
  }, [creativeQuery, open]);

  const refreshCreatives = () => {
    CREATIVES_CACHE.delete(creativeQuery);
    // Re-trigger by toggling a state nudge: the simplest way is to set the
    // query to a temporary value and back, but that's ugly. Instead, force a
    // direct fetch here so the user sees an immediate spinner.
    setLoadingCreatives(true);
    const params = new URLSearchParams();
    if (creativeQuery) params.set("q", creativeQuery);
    fetch(`/api/sales/ad-creatives?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        const list = (j.creatives ?? []) as CreativeItem[];
        CREATIVES_CACHE.set(creativeQuery, { at: Date.now(), data: list });
        setCreatives(list);
      })
      .catch(() => setCreatives([]))
      .finally(() => setLoadingCreatives(false));
  };

  // Mirror of selectedCreative in a ref so transient state resets (from
  // unforeseen effect triggers) don't lose the user's pick. Submit reads
  // state primarily but falls back to ref. Updated on every state change.
  const selectedRef = useRef<CreativeItem | null>(null);
  useEffect(() => {
    selectedRef.current = selectedCreative;
  }, [selectedCreative]);

  if (!open || !order) return null;

  const submit = async () => {
    setError(null);
    if (!netValue || netValue <= 0) {
      setError("Net value is required");
      return;
    }
    // Read state first; fall back to ref if state was transiently reset.
    const picked = selectedCreative ?? selectedRef.current;
    if (!picked) {
      setError("Pick an ad creative");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/orders/${order.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          net_value_amount: netValue,
          ad_creative_id: picked.ad_id,
          ad_creative_name: picked.ad_name,
          is_abandoned_cart: isAbandonedCart,
          alex_ai_assist_level: alexLevel,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Failed to mark complete");
        return;
      }
      onCompleted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--color-surface-card)] rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
            <CheckCircle2 size={14} className="text-[var(--color-success)]" />
            Complete order — {order.shopify_order_name ?? "(no number)"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {/* Net value */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">
              Net value (₱) *
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={netValue ?? ""}
              onChange={(e) =>
                setNetValue(
                  e.target.value ? parseFloat(e.target.value) : null,
                )
              }
              className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
              Order total ₱{order.final_total_amount.toFixed(2)}. Enter the
              actual amount collected.
            </div>
          </div>

          {/* Ad creative picker */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">
              Ad creative *
            </label>
            {selectedCreative && (
              <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-success-text)] bg-[var(--color-success-light)] border border-[var(--color-success)]/30 rounded px-2 py-0.5">
                ✓ Selected: {selectedCreative.ad_name}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={creativeQuery}
                onChange={(e) => setCreativeQuery(e.target.value)}
                placeholder="Search by creative name…"
                className="flex-1 px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={refreshCreatives}
                title="Refresh creatives"
                className="px-2 text-xs text-[var(--color-text-secondary)] border border-[var(--color-border-primary)] rounded-md hover:bg-[var(--color-surface-hover)]"
              >
                <RefreshCw size={12} className={loadingCreatives ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-1 max-h-56 overflow-y-auto border border-[var(--color-border-secondary)] rounded-md">
              {loadingCreatives && (
                <div className="p-2 text-xs text-[var(--color-text-tertiary)]">Loading…</div>
              )}
              {!loadingCreatives && creatives.length === 0 && (
                <div className="p-2 text-xs text-[var(--color-text-tertiary)]">
                  No creatives found
                </div>
              )}
              {creatives.map((c) => (
                <button
                  type="button"
                  key={c.ad_id}
                  onClick={() => {
                    selectedRef.current = c;
                    setSelectedCreative(c);
                  }}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-surface-hover)] ${
                    selectedCreative?.ad_id === c.ad_id ? "bg-[var(--color-accent-light)]" : ""
                  }`}
                >
                  <CreativeThumb adId={c.ad_id} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {c.ad_name}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-secondary)] truncate">
                      {c.campaign_name ?? "—"}
                      {c.campaign_date
                        ? ` · synced ${new Date(c.campaign_date).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] uppercase font-semibold ${
                      c.status === "live"
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-text-tertiary)]"
                    }`}
                  >
                    {c.status === "live" ? "LIVE" : c.status}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Abandoned cart */}
          <div>
            <label className="inline-flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!isAbandonedCart}
                onChange={(e) => setIsAbandonedCart(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Came from abandoned cart</span>
                <span className="block text-[11px] text-[var(--color-text-secondary)]">
                  Only check if the customer was a recovered abandoned cart,
                  not a forecast.
                </span>
              </span>
            </label>
          </div>

          {/* Alex AI assist */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">
              Alex AI assist
            </label>
            <select
              value={alexLevel}
              onChange={(e) =>
                setAlexLevel(e.target.value as "none" | "partial" | "full")
              }
              className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">None</option>
              <option value="partial">Partial</option>
              <option value="full">Full</option>
            </select>
          </div>

          {error && (
            <div className="text-xs text-[var(--color-error-text)] bg-[var(--color-error-light)] border border-[var(--color-error)]/30 rounded p-2">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border-primary)] px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="text-xs px-4 py-1.5 bg-emerald-600 text-[var(--color-text-inverted)] rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Mark complete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Thumbnails endpoint returns a flat { [adId]: url } map (see
// src/app/api/ad-ops/live-ads/thumbnails/route.ts). One fetch per row
// is fine here — the visible list is short and results are cached
// per-render.
function CreativeThumb({ adId }: { adId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/ad-ops/live-ads/thumbnails?ad_ids=${adId}`)
      .then((r) => r.json())
      .then((j) => setSrc((j?.[adId] as string | undefined) ?? null))
      .catch(() => setSrc(null));
  }, [adId]);
  return (
    <div className="w-8 h-8 rounded bg-[var(--color-bg-tertiary)] overflow-hidden flex-shrink-0">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : null}
    </div>
  );
}
