"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit3,
  RefreshCw,
  Sliders,
  Trash2,
} from "lucide-react";

// Inline detail panel for an order row in the Confirmed Sales list. Shows
// three columns: line items, completion checklist (with the "Complete this
// order →" call-to-action), and handoff/actions. Lazy-fetches the full
// order detail on first expand so the list endpoint can stay slim.

type OrderItem = {
  id: string;
  product_name: string;
  variant_name: string | null;
  size: string | null;
  color: string | null;
  image_url: string | null;
  quantity: number;
  unit_price_amount: number;
  adjusted_unit_price_amount: number | null;
  line_total_amount: number;
};

type OrderDetail = {
  id: string;
  status: string;
  sync_status: string;
  completion_status: string;
  final_total_amount: number;
  net_value_amount: number | null;
  ad_campaign_source: string | null;
  delivery_status: string | null;
  is_abandoned_cart: boolean | null;
  alex_ai_assist: boolean | null;
  mode_of_payment: string | null;
  person_in_charge_label: string | null;
  route_type: string;
  shopify_order_id: string | null;
  items: OrderItem[];
};

type Props = {
  orderId: string;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAdjust?: () => void;
};

export function ExpandedOrderRow({
  orderId,
  onComplete,
  onEdit,
  onDelete,
  onAdjust,
}: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sales/orders/${orderId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setOrder(j.order ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading || !order) {
    return (
      <div className="px-4 py-6 text-xs text-gray-500 bg-gray-50/50">
        Loading order…
      </div>
    );
  }

  const isCompleted = order.status === "completed";
  const isCancelled = order.status === "cancelled";
  const isDraft = order.status === "draft";
  const canComplete =
    order.status === "confirmed" && order.sync_status === "synced";

  // Completion checklist rows. Filled when the corresponding field is set
  // on the order; otherwise dashed and the agent can see what's missing.
  const checklist: Array<{ label: string; filled: boolean; value?: string }> = [
    {
      label: "Net Value",
      filled: order.net_value_amount != null,
      value:
        order.net_value_amount != null
          ? `₱${order.net_value_amount.toFixed(2)}`
          : undefined,
    },
    {
      label: "Ad Campaign",
      filled: !!order.ad_campaign_source,
      value: order.ad_campaign_source ?? undefined,
    },
    {
      label: "Delivery Status",
      filled: !!order.delivery_status,
      value: order.delivery_status ?? undefined,
    },
  ];
  const missingCount = checklist.filter((c) => !c.filled).length;

  return (
    <div className="bg-amber-50/30 border-t border-amber-200/40">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-6 py-5">
        {/* ── Line items ───────────────────────────────────────────── */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 pb-1 border-b border-gray-200">
            Line items
          </div>
          <ul className="divide-y divide-gray-100">
            {order.items.map((it) => {
              const unit =
                it.adjusted_unit_price_amount ?? it.unit_price_amount;
              return (
                <li key={it.id} className="py-2 flex items-center gap-3">
                  <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.image_url}
                        alt={it.product_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[repeating-linear-gradient(135deg,_#f3f4f6_0_4px,_#e5e7eb_4px_8px)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {it.product_name}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {[it.size && `Size ${it.size}`, it.color]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">×{it.quantity}</div>
                  <div className="text-sm tabular-nums w-20 text-right">
                    ₱{(unit * it.quantity).toLocaleString()}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-200">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
              Final Total
            </div>
            <div className="text-base font-semibold tabular-nums">
              ₱{order.final_total_amount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* ── Completion ───────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-200">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
              Completion
            </div>
            {isCompleted ? (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium flex items-center gap-1">
                <CheckCircle2 size={10} />
                Complete
              </span>
            ) : isCancelled ? (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 font-medium">
                Cancelled
              </span>
            ) : isDraft ? (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 font-medium">
                Draft
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium flex items-center gap-1">
                <AlertTriangle size={10} />
                Incomplete
              </span>
            )}
          </div>
          {!isCompleted && !isCancelled && !isDraft && missingCount > 0 && (
            <p className="text-xs italic text-gray-600 mb-3">
              {missingCount === 1
                ? "One field still needed before this order can close the loop."
                : `${spelledOut(missingCount)} fields still needed before this order can close the loop.`}
            </p>
          )}
          <ul className="space-y-1.5 mb-4">
            {checklist.map((c) => (
              <li
                key={c.label}
                className="flex items-center gap-2 text-xs"
              >
                {c.filled ? (
                  <Check size={12} className="text-emerald-600 shrink-0" />
                ) : (
                  <span className="w-3 h-3 rounded-full border border-dashed border-gray-400 shrink-0" />
                )}
                <span
                  className={c.filled ? "text-gray-900" : "text-gray-500"}
                >
                  {c.label}
                </span>
                {c.filled && c.value && (
                  <span className="ml-auto text-gray-500 truncate max-w-[140px]">
                    {c.value}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canComplete && (
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded bg-amber-700 text-white hover:bg-amber-800 transition-colors"
            >
              Complete this order →
            </button>
          )}
        </div>

        {/* ── Handoff & Actions ────────────────────────────────────── */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 pb-1 border-b border-gray-200">
            Handoff & Actions
          </div>
          <dl className="space-y-1.5 text-xs mb-4">
            <Row label="Mode of Payment" value={order.mode_of_payment ?? "—"} />
            <Row
              label="Person in Charge"
              value={order.person_in_charge_label ?? "—"}
            />
            <Row
              label="Route"
              value={
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    order.route_type === "tnvs"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {order.route_type === "tnvs" ? "Lalamove" : "Normal"}
                </span>
              }
            />
            <Row
              label="Shopify Sync"
              value={
                <span className="inline-flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      order.sync_status === "synced"
                        ? "bg-emerald-500"
                        : order.sync_status === "syncing"
                          ? "bg-amber-500"
                          : order.sync_status === "failed"
                            ? "bg-rose-500"
                            : "bg-gray-400"
                    }`}
                  />
                  <span className="capitalize">{order.sync_status}</span>
                </span>
              }
            />
          </dl>
          <div className="flex items-center gap-1.5">
            <ActionBtn
              icon={<Edit3 size={11} />}
              label={isDraft ? "Resume" : "Edit"}
              onClick={onEdit}
              disabled={isCancelled || isCompleted}
            />
            <ActionBtn
              icon={<Sliders size={11} />}
              label="Order adjustment"
              onClick={onAdjust ?? (() => {})}
              disabled={!onAdjust || isCancelled}
              title={
                onAdjust
                  ? undefined
                  : "Adjustments coming in a later phase"
              }
            />
            <ActionBtn
              icon={<Trash2 size={11} />}
              label="Delete"
              onClick={onDelete}
              tone="danger"
              disabled={isCancelled}
            />
            {order.sync_status === "failed" && (
              <ActionBtn
                icon={<RefreshCw size={11} />}
                label="Sync"
                onClick={() => {}}
                disabled
                title="Use the row's actions menu to retry sync"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 text-right">{value}</dd>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  tone,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const palette =
    tone === "danger"
      ? "border-rose-200 text-rose-700 hover:bg-rose-50"
      : "border-gray-200 text-gray-700 hover:bg-gray-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${palette}`}
    >
      {icon}
      {label}
    </button>
  );
}

function spelledOut(n: number): string {
  if (n === 1) return "One";
  if (n === 2) return "Two";
  if (n === 3) return "Three";
  return String(n);
}
