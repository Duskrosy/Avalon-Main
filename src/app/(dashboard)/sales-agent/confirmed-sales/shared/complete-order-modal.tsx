"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

type CampaignItem = { name: string; source: "live" | "history" };

// Modal for marking a synced order complete with post-delivery
// attribution. Lives separate from the create drawer because completion
// happens days later (when the COD parcel comes back), and the fields
// captured here drive reporting (net GMV, abandon rate, ad attribution).
//
// Defaults net_value_amount to the order total — most orders deliver
// in full, so the agent confirms by hitting save. Marking abandoned
// auto-zeros the net value and sets delivery_status to "abandoned".

const DELIVERY_STATUSES = [
  { value: "delivered", label: "Delivered" },
  { value: "partially_delivered", label: "Partially delivered" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "rejected", label: "Rejected by customer" },
  { value: "returned", label: "Returned to sender" },
  { value: "abandoned", label: "Abandoned" },
  { value: "lost", label: "Lost in transit" },
];

type Props = {
  open: boolean;
  order: {
    id: string;
    avalon_order_number: string | null;
    shopify_order_name?: string | null;
    final_total_amount: number;
    net_value_amount?: number | null;
    delivery_status?: string | null;
    is_abandoned_cart?: boolean | null;
    ad_campaign_source?: string | null;
    alex_ai_assist?: boolean | null;
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
  const [netValue, setNetValue] = useState<string>("");
  const [deliveryStatus, setDeliveryStatus] = useState<string>("delivered");
  const [isAbandoned, setIsAbandoned] = useState(false);
  const [adCampaign, setAdCampaign] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const campaignBoxRef = useRef<HTMLDivElement>(null);
  const [alexAssist, setAlexAssist] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !order) return;
    // Seed from existing values where present, else default to the order
    // total + delivered (most-common path).
    setNetValue(
      String(order.net_value_amount ?? order.final_total_amount ?? 0),
    );
    setDeliveryStatus(order.delivery_status ?? "delivered");
    setIsAbandoned(order.is_abandoned_cart ?? false);
    setAdCampaign(order.ad_campaign_source ?? "");
    setAlexAssist(order.alex_ai_assist ?? false);
    setError(null);
  }, [open, order]);

  // Load campaign suggestions on open. Failures fall back to free-text
  // only — the free-text input still works without a campaign list.
  useEffect(() => {
    if (!open) return;
    fetch("/api/sales/ad-campaigns")
      .then((r) => r.json())
      .then((j) => setCampaigns((j.items ?? []) as CampaignItem[]))
      .catch(() => setCampaigns([]));
  }, [open]);

  // Click-outside the campaign combobox closes the dropdown.
  useEffect(() => {
    if (!campaignOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (
        campaignBoxRef.current &&
        !campaignBoxRef.current.contains(e.target as Node)
      ) {
        setCampaignOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [campaignOpen]);

  const filteredCampaigns = useMemo(() => {
    const q = adCampaign.trim().toLowerCase();
    const list = q
      ? campaigns.filter((c) => c.name.toLowerCase().includes(q))
      : campaigns;
    return list.slice(0, 30);
  }, [campaigns, adCampaign]);

  if (!open || !order) return null;

  // Toggling abandoned has cascading effects: zero the net value and
  // flip delivery_status to "abandoned" so the agent doesn't have to
  // sync them by hand.
  const onToggleAbandoned = (next: boolean) => {
    setIsAbandoned(next);
    if (next) {
      setNetValue("0");
      setDeliveryStatus("abandoned");
    } else if (deliveryStatus === "abandoned") {
      setDeliveryStatus("delivered");
      setNetValue(String(order.final_total_amount ?? 0));
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const parsedNet = parseFloat(netValue);
      if (Number.isNaN(parsedNet) || parsedNet < 0) {
        setError("Net value must be a non-negative number");
        return;
      }
      const res = await fetch(`/api/sales/orders/${order.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          net_value_amount: parsedNet,
          delivery_status: deliveryStatus,
          is_abandoned_cart: isAbandoned,
          ad_campaign_source: adCampaign.trim() || null,
          alex_ai_assist: alexAssist,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Complete failed");
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <CheckCircle2 size={14} className="text-emerald-600" />
            Complete order —{" "}
            {order.shopify_order_name ??
              order.avalon_order_number ??
              "(no number)"}
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Net value collected (₱)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={netValue}
              onChange={(e) => setNetValue(e.target.value)}
              disabled={isAbandoned}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
            <div className="text-[10px] text-gray-400 mt-0.5">
              Order total ₱{order.final_total_amount.toFixed(2)}. Override
              for partial deliveries or split shipments.
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Delivery status
            </label>
            <select
              value={deliveryStatus}
              onChange={(e) => setDeliveryStatus(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DELIVERY_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700 select-none">
            <input
              type="checkbox"
              checked={isAbandoned}
              onChange={(e) => onToggleAbandoned(e.target.checked)}
              className="rounded"
            />
            Customer abandoned the order (zeroes net + flags abandoned)
          </label>

          <div ref={campaignBoxRef} className="relative">
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Ad campaign source
            </label>
            <input
              type="text"
              value={adCampaign}
              onChange={(e) => {
                setAdCampaign(e.target.value);
                setCampaignOpen(true);
              }}
              onFocus={() => setCampaignOpen(true)}
              placeholder="e.g. Meta - Avalon Aug Promo"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {campaignOpen && filteredCampaigns.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredCampaigns.map((c) => (
                  <li key={`${c.source}:${c.name}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setAdCampaign(c.name);
                        setCampaignOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between gap-2 ${
                        adCampaign === c.name ? "bg-blue-50 text-blue-900" : ""
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      <span
                        className={`text-[9px] uppercase tracking-wide px-1 py-0.5 rounded shrink-0 ${
                          c.source === "live"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {c.source}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-[10px] text-gray-400 mt-0.5">
              Pick a live Meta campaign or type a custom source. Free text
              accepted — submits whatever&apos;s in the field.
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700 select-none">
            <input
              type="checkbox"
              checked={alexAssist}
              onChange={(e) => setAlexAssist(e.target.checked)}
              className="rounded"
            />
            Alex AI assisted on this order
          </label>

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="text-xs px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Mark complete"}
          </button>
        </div>
      </div>
    </div>
  );
}
