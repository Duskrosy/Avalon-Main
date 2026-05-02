"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Truck, X } from "lucide-react";
import { ShippingBlock } from "./blocks/shipping-block";
import type { AddressShippingStagedOp } from "./blocks/shipping-block";
import { BillingBlock } from "./blocks/billing-block";
import type { AddressBillingStagedOp } from "./blocks/billing-block";
import { ItemsBlock } from "./blocks/items-block";
import type { ItemStagedOp } from "./blocks/items-block";
import { NotesBlock } from "./blocks/notes-block";
import { SalesPaymentBlock } from "./blocks/sales-payment-block";
import { ConversionPaymentBlock } from "./blocks/conversion-payment-block";
import { ShopifyAdminPaymentBlock } from "./blocks/shopify-admin-payment-block";
import { QuarantinePaymentBlock } from "./blocks/quarantine-payment-block";
import { useToast, Toast } from "@/components/ui/toast";

// Near-full-screen overlay modal for working a claimed CS ticket.
// Layout: sticky header | scrollable body (2-col grid + notes) | sticky footer.
// Pass 1 triage behavior, claim/lock model, and keyboard shortcuts are all preserved.

type DeliveryMethod = "lwe" | "tnvs" | "other" | null;
type TriageDestination =
  | "preorder"
  | "inventory" // LWE / regular inventory
  | "hold"
  | "fulfillment" // On-Hand
  | "dispatch"; // TNVS / Lalamove

type TicketSummary = {
  id: string;
  avalon_order_number: string | null;
  shopify_order_name: string | null;
  customer: { full_name: string; phone: string | null } | null;
  mode_of_payment: string | null;
  payment_other_label: string | null;
  payment_receipt_path: string | null;
  delivery_method: DeliveryMethod;
  delivery_method_notes: string | null;
  final_total_amount: number;
  shopify_financial_status: string | null;
  shopify_fulfillment_status: string | null;
  cs_hold_reason: string | null;
  claimed_by_user_id: string | null;
  claimer: { full_name: string } | null;
  completed_at: string | null;
  created_by_name: string | null; // null => conversion (storefront), else chat-sales
  intake_lane: string | null; // Pass 2: direct lane column
};

type Props = {
  ticket: TicketSummary;
  currentUserId: string;
  onClose: () => void;
  onTriaged: () => void;
};

// ── Full drawer response types ────────────────────────────────────────────────

type FullCustomer = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city_text: string | null;
  region_text: string | null;
  postal_code: string | null;
  full_address: string | null;
  /** Auto-assigned region sent to Shopify's address.province (read-only in CS). */
  shopify_region: string | null;
};

type FullOrderItem = {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price_amount: number;
  line_total_amount: number;
  size: string | null;
  color: string | null;
  image_url: string | null;
  product_variant_id: string | null;
};

type CsNote = {
  id: number;
  author_name_snapshot: string;
  body: string;
  created_at: string;
};

type DrawerPlan = {
  id: number;
  status: string;
  chosen_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  items: Array<{ id: number; op: string; payload: unknown; created_at: string }>;
} | null;

type FullDrawerData = {
  order: {
    id: string;
    intake_lane: string | null;
    final_total_amount: number;
    shopify_financial_status: string | null;
    delivery_method: string | null;
    delivery_method_notes: string | null;
    cs_hold_reason: string | null;
    completed_at: string | null;
    mode_of_payment: string | null;
    payment_other_label: string | null;
    voucher_code: string | null;
    voucher_discount_amount: number;
    manual_discount_amount: number;
    manual_discount_reason: string | null;
    shipping_fee_amount: number;
  };
  customer: FullCustomer | null;
  items: FullOrderItem[];
  payment: Record<string, unknown>;
  notes: string | null;
  cs_notes: CsNote[];
  plan: DrawerPlan;
};

// ── Auto-suggest the destination based on delivery_method ─────────────────────
function suggestDestination(delivery: DeliveryMethod): TriageDestination {
  if (delivery === "tnvs") return "dispatch";
  if (delivery === "lwe") return "inventory";
  return "fulfillment";
}

const DESTINATIONS: Array<{ key: TriageDestination; label: string; sublabel?: string }> = [
  { key: "preorder", label: "Pre-Order" },
  { key: "inventory", label: "LWE", sublabel: "Inventory" },
  { key: "hold", label: "Hold" },
  { key: "fulfillment", label: "On-Hand", sublabel: "Fulfillment" },
  { key: "dispatch", label: "TNVS", sublabel: "Dispatch" },
];

// ── Staged-op summary helpers ─────────────────────────────────────────────────

function describeItemOp(op: ItemStagedOp): string {
  if (op.op === "add_item") {
    return `Add item: variant ${op.payload.variant_id}, qty ${op.payload.qty}, ₱${op.payload.unit_price}`;
  }
  if (op.op === "remove_item") {
    return `Remove item: line ${op.payload.line_item_id}`;
  }
  if (op.op === "qty_change") {
    return `Change qty: line ${op.payload.line_item_id} → ${op.payload.new_qty}`;
  }
  return "Item change";
}

function describeAddressOp(op: AddressShippingStagedOp | AddressBillingStagedOp): string {
  const kind = op.op === "address_shipping" ? "Shipping" : "Billing";
  const { street, city, country } = op.payload;
  return `Address (${kind}): ${[street, city, country].filter(Boolean).join(", ")}`;
}

// ── Payment block dispatcher ──────────────────────────────────────────────────

function PaymentBlock({
  lane,
  payment,
  shopifyFinancialStatus,
  orderId,
  mop,
  paymentOtherLabel,
}: {
  lane: string | null;
  payment: Record<string, unknown>;
  shopifyFinancialStatus: string | null;
  orderId: string;
  mop?: string | null;
  paymentOtherLabel?: string | null;
}) {
  if (lane === "quarantine" && payment.quarantine === true) {
    return (
      <QuarantinePaymentBlock
        adminUrl={String(payment.admin_url ?? "")}
        mop={mop}
        paymentOtherLabel={paymentOtherLabel}
      />
    );
  }
  if (lane === "shopify_admin") {
    return (
      <ShopifyAdminPaymentBlock
        payment={payment as Parameters<typeof ShopifyAdminPaymentBlock>[0]["payment"]}
        shopifyFinancialStatus={shopifyFinancialStatus}
        orderId={orderId}
        mop={mop}
        paymentOtherLabel={paymentOtherLabel}
      />
    );
  }
  if (lane === "conversion" || (lane === null && !("payment_reference_number" in payment))) {
    return (
      <ConversionPaymentBlock
        payment={payment as Parameters<typeof ConversionPaymentBlock>[0]["payment"]}
        mop={mop}
        paymentOtherLabel={paymentOtherLabel}
      />
    );
  }
  return (
    <SalesPaymentBlock
      readOnly={false}
      payment={payment as Parameters<typeof SalesPaymentBlock>[0]["payment"]}
      orderId={orderId}
      mop={mop}
      paymentOtherLabel={paymentOtherLabel}
    />
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function BodySkeleton() {
  // Use only valid Tailwind v4 width classes (w-16, w-20, w-24, w-28, w-32).
  const widths = ["w-20", "w-32", "w-16", "w-28", "w-20"] as const;
  return (
    <div className="space-y-4 animate-pulse">
      {widths.map((w, i) => (
        <div key={i} className="space-y-2">
          <div className="h-2 w-16 rounded bg-[var(--color-border-primary)]" />
          <div className={`h-3 ${w} rounded bg-[var(--color-border-primary)] max-w-full`} />
        </div>
      ))}
    </div>
  );
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">
      {children}
    </div>
  );
}

// ── Header strip ──────────────────────────────────────────────────────────────

function HeaderStrip({
  ticket,
  intakeLane,
  saving,
  pendingCount,
  onClose,
}: {
  ticket: TicketSummary;
  intakeLane: string | null;
  saving: boolean;
  pendingCount: number;
  onClose: () => void;
}) {
  const orderLabel =
    ticket.shopify_order_name ?? ticket.avalon_order_number ?? ticket.id.slice(0, 8);

  return (
    <header className="shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--color-border-primary)] bg-[var(--color-surface-card)]">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2
            id="ticket-drawer-title"
            className="text-base font-semibold"
          >
            {orderLabel}
          </h2>
          <LaneChip lane={intakeLane} />
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
              style={{ color: "var(--color-warning)", borderColor: "var(--color-warning)", backgroundColor: "var(--color-warning-light)" }}
            >
              {/* Colored dot */}
              <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true">
                <circle cx="3" cy="3" r="3" fill="var(--color-warning)" />
              </svg>
              {pendingCount} pending
            </span>
          )}
          {ticket.completed_at && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] border border-[var(--color-border-primary)]">
              Completed
            </span>
          )}
        </div>
        {ticket.claimer && ticket.claimed_by_user_id && (
          <span className="text-[11px] text-[var(--color-text-tertiary)] shrink-0">
            Claimed by{" "}
            <span className="font-medium text-[var(--color-text-secondary)]">
              {ticket.claimer.full_name}
            </span>
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        aria-label="Close"
        className="shrink-0 p-1.5 rounded hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
      >
        <X size={18} />
      </button>
    </header>
  );
}

// ── Customer column (left) ─────────────────────────────────────────────────────

function CustomerColumn({
  customer,
  ticket,
  onShippingOpsChange,
  onBillingOpsChange,
  readOnly,
}: {
  customer: FullCustomer | null;
  ticket: TicketSummary;
  onShippingOpsChange: (ops: AddressShippingStagedOp[]) => void;
  onBillingOpsChange: (ops: AddressBillingStagedOp[]) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Delivery info */}
      {ticket.delivery_method && (
        <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          <Truck size={14} />
          <span className="font-medium">{ticket.delivery_method.toUpperCase()}</span>
          {ticket.delivery_method_notes && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              · {ticket.delivery_method_notes}
            </span>
          )}
        </div>
      )}

      {/* Existing hold reason */}
      {ticket.cs_hold_reason && (
        <div>
          <SectionLabel>Hold reason</SectionLabel>
          <p className="text-xs italic text-[var(--color-text-secondary)]">
            {ticket.cs_hold_reason}
          </p>
        </div>
      )}

      {/* Shipping */}
      <div>
        <SectionLabel>Shipping address</SectionLabel>
        <ShippingBlock
          customer={customer}
          onStagedOpsChange={onShippingOpsChange}
          readOnly={readOnly}
        />
      </div>

      {/* Billing — BillingBlock manages its own collapse */}
      <BillingBlock
        billing={customer}
        onStagedOpsChange={onBillingOpsChange}
        readOnly={readOnly}
      />
    </div>
  );
}

// ── Items + payment column (right) ────────────────────────────────────────────

function ItemsPaymentColumn({
  fullData,
  intakeLane,
  orderId,
  shopifyFinancialStatus,
  onItemsOpsChange,
  readOnly,
}: {
  fullData: FullDrawerData;
  intakeLane: string | null;
  orderId: string;
  shopifyFinancialStatus: string | null;
  onItemsOpsChange: (ops: ItemStagedOp[]) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>Items</SectionLabel>
        <ItemsBlock
          items={fullData.items}
          finalTotal={fullData.order.final_total_amount}
          voucher_code={fullData.order.voucher_code}
          voucherDiscountAmount={fullData.order.voucher_discount_amount}
          manualDiscountAmount={fullData.order.manual_discount_amount}
          manualDiscountReason={fullData.order.manual_discount_reason}
          shippingFeeAmount={fullData.order.shipping_fee_amount}
          onStagedOpsChange={onItemsOpsChange}
          readOnly={readOnly}
        />
      </div>
      <div>
        <SectionLabel>Payment</SectionLabel>
        <PaymentBlock
          lane={intakeLane}
          payment={fullData.payment}
          shopifyFinancialStatus={shopifyFinancialStatus}
          orderId={orderId}
          mop={fullData.order.mode_of_payment}
          paymentOtherLabel={fullData.order.payment_other_label}
        />
      </div>
    </div>
  );
}

// ── Sticky action bar (footer) ────────────────────────────────────────────────

function ActionBar({
  ticket,
  destination,
  setDestination,
  holdReason,
  setHoldReason,
  saving,
  error,
  onConfirm,
}: {
  ticket: TicketSummary;
  destination: TriageDestination;
  setDestination: (d: TriageDestination) => void;
  holdReason: string;
  setHoldReason: (v: string) => void;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <footer className="shrink-0 border-t border-[var(--color-border-primary)] bg-[var(--color-surface-card)] px-5 py-4 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Route this order
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {DESTINATIONS.map((d) => {
          const isSuggested = d.key === suggestDestination(ticket.delivery_method);
          const isActive = destination === d.key;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setDestination(d.key)}
              disabled={saving}
              className={`px-2 py-2 rounded text-xs border transition-colors ${
                isActive
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "border-[var(--color-border-primary)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
              } disabled:opacity-50`}
            >
              <div className="font-medium leading-tight">{d.label}</div>
              {d.sublabel && (
                <div
                  className={`text-[10px] ${
                    isActive ? "opacity-90" : "text-[var(--color-text-tertiary)]"
                  }`}
                >
                  {d.sublabel}
                </div>
              )}
              {isSuggested && (
                <div
                  className={`text-[9px] uppercase tracking-wider mt-0.5 ${
                    isActive ? "opacity-90" : "text-[var(--color-text-tertiary)]"
                  }`}
                >
                  Suggested
                </div>
              )}
            </button>
          );
        })}
      </div>

      {destination === "hold" && (
        <input
          type="text"
          value={holdReason}
          onChange={(e) => setHoldReason(e.target.value)}
          placeholder="Why is this on hold?"
          disabled={saving}
          className="w-full px-3 py-1.5 text-sm border border-[var(--color-border-primary)] rounded-md bg-[var(--color-bg-primary)]"
        />
      )}

      {error && (
        <div className="text-xs px-3 py-2 rounded bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error-light)]">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={saving || (destination === "hold" && !holdReason.trim())}
        className="w-full px-3 py-2 rounded text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Routing…" : "Confirm & Route →"}
      </button>
      <div className="text-[10px] text-[var(--color-text-tertiary)] text-center">
        Esc to close · ⌘/Ctrl+Enter to confirm
      </div>
    </footer>
  );
}

// ── Confirmation modal ────────────────────────────────────────────────────────

function ConfirmationModal({
  itemOps,
  shippingOps,
  billingOps,
  orderId,
  onClose,
  onConfirmed,
}: {
  itemOps: ItemStagedOp[];
  shippingOps: AddressShippingStagedOp[];
  billingOps: AddressBillingStagedOp[];
  orderId: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const hasItemOps = itemOps.length > 0;
  const hasAddressOps = shippingOps.length > 0 || billingOps.length > 0;
  const allOps = [...itemOps, ...shippingOps, ...billingOps];

  async function handleApply() {
    setModalError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customer-service/orders/${orderId}/edit-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: allOps }),
      });

      if (res.ok) {
        onConfirmed();
      } else if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        setModalError(
          j.error ?? "Another rep is composing changes for this order. Refresh to see their plan."
        );
      } else {
        const j = await res.json().catch(() => ({}));
        setModalError(j.error ?? "Failed to save plan. Please try again.");
      }
    } catch {
      setModalError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // Modal backdrop — absolute inside drawer card
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-[var(--color-surface-card)] rounded-lg shadow-2xl border border-[var(--color-border-primary)] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Apply pending changes?
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contextual copy */}
        <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          {hasAddressOps && (
            <p>
              You are editing — address. This will update the existing order in place if Shopify allows it.
            </p>
          )}
          {hasItemOps && (
            <p>
              Adding or editing items will create a new linked order. The original sales agent keeps the close.
            </p>
          )}
        </div>

        {/* Op list */}
        <ul className="space-y-1">
          {itemOps.map((op, i) => (
            <li key={`item-${i}`} className="text-xs text-[var(--color-text-secondary)] flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)] inline-block" />
              {describeItemOp(op)}
            </li>
          ))}
          {shippingOps.map((op, i) => (
            <li key={`ship-${i}`} className="text-xs text-[var(--color-text-secondary)] flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)] inline-block" />
              {describeAddressOp(op)}
            </li>
          ))}
          {billingOps.map((op, i) => (
            <li key={`bill-${i}`} className="text-xs text-[var(--color-text-secondary)] flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)] inline-block" />
              {describeAddressOp(op)}
            </li>
          ))}
        </ul>

        {/* Error */}
        {modalError && (
          <div className="text-xs px-3 py-2 rounded bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error-light)]">
            {modalError}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded text-sm border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={submitting}
            className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Applying…" : "Confirm and apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TicketDrawer({ ticket, currentUserId, onClose, onTriaged }: Props) {
  const [destination, setDestination] = useState<TriageDestination>(
    suggestDestination(ticket.delivery_method),
  );
  const [holdReason, setHoldReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Full drawer data fetched from /full endpoint
  const [fullData, setFullData] = useState<FullDrawerData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);

  // Staged ops from child blocks
  const [itemOps, setItemOps] = useState<ItemStagedOp[]>([]);
  const [shippingOps, setShippingOps] = useState<AddressShippingStagedOp[]>([]);
  const [billingOps, setBillingOps] = useState<AddressBillingStagedOp[]>([]);
  const allStagedOps = [...itemOps, ...shippingOps, ...billingOps];
  const pendingCount = allStagedOps.length;

  // Confirmation modal
  const [showModal, setShowModal] = useState(false);

  // Toast
  const { toast, setToast } = useToast();

  const claimedByOther =
    !!ticket.claimed_by_user_id && ticket.claimed_by_user_id !== currentUserId;

  // Fetch full drawer data on mount, with cancellation guard
  useEffect(() => {
    let cancelled = false;
    setFetchLoading(true);
    setFetchError(null);
    fetch(`/api/customer-service/orders/${ticket.id}/full`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) { setFetchError("Order not found."); return; }
        if (!res.ok) { setFetchError("Could not load order details."); return; }
        const data = await res.json();
        if (!cancelled) setFullData(data as FullDrawerData);
      })
      .catch(() => { if (!cancelled) setFetchError("Could not load order details."); })
      .finally(() => { if (!cancelled) setFetchLoading(false); });
    return () => { cancelled = true; };
  }, [ticket.id]);

  // Esc closes modal first, then drawer. Cmd/Ctrl+Enter triggers confirm.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        if (showModal) {
          setShowModal(false);
          return;
        }
        onClose();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !saving && !claimedByOther) {
        // Don't fire if the event was already handled by the notes textarea
        if (e.defaultPrevented) return;
        // When modal is open, Cmd+Enter triggers modal apply — handled inside modal
        if (showModal) return;
        e.preventDefault();
        void handleConfirmClick();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, holdReason, saving, claimedByOther, showModal]);

  async function runTriage() {
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = { action: destination };
      if (destination === "hold") body.hold_reason = holdReason.trim();
      const res = await fetch(`/api/customer-service/orders/${ticket.id}/triage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onTriaged();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Triage failed");
      }
    } finally {
      setSaving(false);
    }
  }

  // Called by action bar "Confirm & Route" button and Cmd+Enter
  function handleConfirmClick() {
    // Validate hold reason first
    if (destination === "hold" && !holdReason.trim()) {
      setError("Please give a reason for the hold.");
      return;
    }
    setError(null);

    if (pendingCount > 0) {
      // Open confirmation modal to apply staged ops first
      setShowModal(true);
    } else {
      // No pending ops — run triage directly
      void runTriage();
    }
  }

  // Called by modal's "Confirm and apply" after edit-plan POST succeeds
  function handleModalConfirmed() {
    // Clear staged ops
    setItemOps([]);
    setShippingOps([]);
    setBillingOps([]);
    setShowModal(false);
    setToast({ message: "Plan saved. Will apply to Shopify in Phase B.", type: "success" });
    // Proceed with triage
    void runTriage();
  }

  // Resolve intake_lane: prefer the /full response; fall back to ticket prop.
  const intake_lane = fullData?.order.intake_lane ?? ticket.intake_lane ?? null;

  return (
    // Backdrop: fixed inset-0 centers the card. Clicking the backdrop closes.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-drawer-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      {/* Modal card — near-full-screen, stops propagation so backdrop doesn't close on inner clicks */}
      <div
        className="relative w-[95vw] max-w-[1400px] h-[95vh] bg-[var(--color-surface-card)] rounded-lg shadow-2xl border border-[var(--color-border-primary)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Sticky header ──────────────────────────────────────────────────── */}
        <HeaderStrip
          ticket={ticket}
          intakeLane={intake_lane}
          saving={saving}
          pendingCount={pendingCount}
          onClose={onClose}
        />

        {/* ── Claimed-by-other banner ─────────────────────────────────────────── */}
        {claimedByOther && (
          <div className="mx-5 mt-3 px-3 py-2 rounded text-xs bg-[var(--color-warning-light)] text-[var(--color-warning)] border border-[var(--color-warning-light)] flex items-start gap-2 shrink-0">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">
                {ticket.claimer?.full_name ?? "Another agent"} was assigned this ticket.
              </div>
              <div>Your changes are read-only.</div>
            </div>
          </div>
        )}

        {/* ── Scrollable body ─────────────────────────────────────────────────── */}
        <div
          className={`flex-1 overflow-y-auto px-5 py-5 space-y-6 text-sm ${
            claimedByOther ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          {/* Completed badge */}
          {ticket.completed_at && (
            <div className="text-xs text-[var(--color-text-tertiary)] italic">
              Completed {format(new Date(ticket.completed_at), "MMM d, h:mm a")}
            </div>
          )}

          {/* Loading skeleton */}
          {fetchLoading && <BodySkeleton />}

          {/* Fetch error */}
          {fetchError && !fetchLoading && (
            <div className="px-3 py-2 rounded text-xs bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error-light)]">
              {fetchError}
            </div>
          )}

          {/* Main content once loaded */}
          {!fetchLoading && fullData && (
            <div className="space-y-6">
              {/* 2-column grid: customer/addresses | items/payment */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column — customer */}
                <div className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                  <SectionLabel>Customer</SectionLabel>
                  <CustomerColumn
                    customer={fullData.customer}
                    ticket={ticket}
                    onShippingOpsChange={setShippingOps}
                    onBillingOpsChange={setBillingOps}
                    readOnly={claimedByOther}
                  />
                </div>

                {/* Right column — items + payment */}
                <div className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                  <ItemsPaymentColumn
                    fullData={fullData}
                    intakeLane={intake_lane}
                    orderId={ticket.id}
                    shopifyFinancialStatus={fullData.order.shopify_financial_status}
                    onItemsOpsChange={setItemOps}
                    readOnly={claimedByOther}
                  />
                </div>
              </div>

              {/* Notes & Discussion — full width */}
              <div className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <SectionLabel>Notes &amp; Discussion</SectionLabel>
                <NotesBlock
                  salesNote={fullData.notes}
                  csNotes={fullData.cs_notes ?? []}
                  orderId={ticket.id}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky footer action bar ────────────────────────────────────────── */}
        {!claimedByOther && (
          <ActionBar
            ticket={ticket}
            destination={destination}
            setDestination={setDestination}
            holdReason={holdReason}
            setHoldReason={setHoldReason}
            saving={saving}
            error={error}
            onConfirm={handleConfirmClick}
          />
        )}

        {/* ── Confirmation modal (inside drawer card) ─────────────────────────── */}
        {showModal && (
          <ConfirmationModal
            itemOps={itemOps}
            shippingOps={shippingOps}
            billingOps={billingOps}
            orderId={ticket.id}
            onClose={() => setShowModal(false)}
            onConfirmed={handleModalConfirmed}
          />
        )}
      </div>

      {/* Toast — rendered outside the drawer card so z-index works correctly */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

// ── LaneChip ─────────────────────────────────────────────────────────────────

function LaneChip({ lane }: { lane: string | null }) {
  if (lane === "sales") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[var(--color-success-light)] text-[var(--color-success)]">
        Sales
      </span>
    );
  }
  if (lane === "conversion") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[var(--color-info-light)] text-[var(--color-info)]">
        Conversion
      </span>
    );
  }
  if (lane === "shopify_admin") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[var(--color-accent-light,var(--color-info-light))] text-[var(--color-accent)]">
        Shopify Admin
      </span>
    );
  }
  if (lane === "quarantine") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[var(--color-error-light)] text-[var(--color-error)]">
        Quarantine
      </span>
    );
  }
  return null;
}
