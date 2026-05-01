"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Truck, X, AlertTriangle } from "lucide-react";
import { ShippingBlock } from "./blocks/shipping-block";
import { BillingBlock } from "./blocks/billing-block";
import { ItemsBlock } from "./blocks/items-block";
import { NotesBlock } from "./blocks/notes-block";
import { SalesPaymentBlock } from "./blocks/sales-payment-block";
import { ConversionPaymentBlock } from "./blocks/conversion-payment-block";
import { ShopifyAdminPaymentBlock } from "./blocks/shopify-admin-payment-block";
import { QuarantinePaymentBlock } from "./blocks/quarantine-payment-block";
import { CockpitComposer } from "./blocks/cockpit-composer";

// Right-side drawer for working a claimed CS ticket. Shows the order
// summary up top, body sections (customer, payment, delivery), and a
// footer with the 5-destination triage picker. Hold inline-prompts
// for a reason instead of using window.prompt().

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
  };
  customer: FullCustomer | null;
  items: FullOrderItem[];
  payment: Record<string, unknown>;
  notes: string | null;
  plan: DrawerPlan;
};

// ── Auto-suggest the destination based on delivery_method ─────────────────────
// Pre-Order is CS's call (no inventory data here), so we never auto-pick it.
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

// ── Payment block dispatcher ──────────────────────────────────────────────────

function PaymentBlock({
  lane,
  payment,
  shopifyFinancialStatus,
  orderId,
}: {
  lane: string | null;
  payment: Record<string, unknown>;
  shopifyFinancialStatus: string | null;
  orderId: string;
}) {
  if (lane === "quarantine" && payment.quarantine === true) {
    return <QuarantinePaymentBlock adminUrl={String(payment.admin_url ?? "")} />;
  }
  if (lane === "shopify_admin") {
    return (
      <ShopifyAdminPaymentBlock
        payment={payment as Parameters<typeof ShopifyAdminPaymentBlock>[0]["payment"]}
        shopifyFinancialStatus={shopifyFinancialStatus}
        orderId={orderId}
      />
    );
  }
  if (lane === "conversion" || (lane === null && !("payment_reference_number" in payment))) {
    return (
      <ConversionPaymentBlock
        payment={payment as Parameters<typeof ConversionPaymentBlock>[0]["payment"]}
      />
    );
  }
  // sales lane (or fallback)
  return (
    <SalesPaymentBlock
      payment={payment as Parameters<typeof SalesPaymentBlock>[0]["payment"]}
      orderId={orderId}
    />
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function BodySkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[80, 120, 60, 100, 80].map((w, i) => (
        <div key={i} className="space-y-2">
          <div className="h-2 w-16 rounded bg-[var(--color-border-primary)]" />
          <div className={`h-3 w-${w} rounded bg-[var(--color-border-primary)] max-w-full`} />
        </div>
      ))}
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

  const claimedByOther =
    !!ticket.claimed_by_user_id && ticket.claimed_by_user_id !== currentUserId;

  // Fetch full drawer data on mount
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

  // Esc closes; Cmd/Ctrl+Enter triggers Confirm & Route.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !saving && !claimedByOther) {
        e.preventDefault();
        void confirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, holdReason, saving, claimedByOther]);

  async function confirm() {
    setError(null);
    if (destination === "hold" && !holdReason.trim()) {
      setError("Please give a reason for the hold.");
      return;
    }
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

  // Resolve intake_lane: prefer the /full response; fall back to ticket prop.
  const intake_lane = fullData?.order.intake_lane ?? ticket.intake_lane ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-drawer-title"
      className="fixed inset-0 z-50 flex"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      {/* backdrop */}
      <div className="flex-1 bg-black/30" />
      {/* drawer */}
      <aside
        className="w-full md:w-[560px] h-full bg-[var(--color-surface-card)] border-l border-[var(--color-border-primary)] shadow-xl flex flex-col"
      >
        {/* header */}
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--color-border-primary)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
              <span>Working ticket</span>
              <LaneChip lane={intake_lane} />
            </div>
            <h2
              id="ticket-drawer-title"
              className="text-base font-semibold truncate"
            >
              {ticket.shopify_order_name ?? ticket.avalon_order_number ?? ticket.id.slice(0, 6)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="p-1.5 rounded hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        {/* stale banner if claim was reassigned mid-edit */}
        {claimedByOther && (
          <div className="mx-5 mt-3 px-3 py-2 rounded text-xs bg-[var(--color-warning-light)] text-[var(--color-warning)] border border-[var(--color-warning-light)] flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">
                {ticket.claimer?.full_name ?? "Another agent"} was assigned this ticket.
              </div>
              <div>Your changes are read-only.</div>
            </div>
          </div>
        )}

        {/* body */}
        <div
          className={`flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm ${claimedByOther ? "opacity-60 pointer-events-none" : ""}`}
        >
          {/* Order header row */}
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold tabular-nums">
              ₱{ticket.final_total_amount.toFixed(2)}
            </div>
            {ticket.delivery_method && (
              <div className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
                <Truck size={14} />
                <span>{ticket.delivery_method.toUpperCase()}</span>
                {ticket.delivery_method_notes && (
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    · {ticket.delivery_method_notes}
                  </span>
                )}
              </div>
            )}
          </div>

          {ticket.cs_hold_reason && (
            <Section label="Hold reason (existing)">
              <div className="text-xs italic text-[var(--color-text-secondary)]">
                {ticket.cs_hold_reason}
              </div>
            </Section>
          )}

          {ticket.completed_at && (
            <Section label="Completed">
              <div className="text-xs text-[var(--color-text-secondary)]">
                {format(new Date(ticket.completed_at), "MMM d, h:mm a")}
              </div>
            </Section>
          )}

          {/* Body from /full endpoint */}
          {fetchLoading && <BodySkeleton />}

          {fetchError && !fetchLoading && (
            <div className="px-3 py-2 rounded text-xs bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error-light)]">
              {fetchError}
            </div>
          )}

          {!fetchLoading && fullData && (
            <>
              <Section label="Shipping">
                <ShippingBlock customer={fullData.customer} />
              </Section>

              <Section label="Billing">
                <BillingBlock billing={fullData.customer} />
              </Section>

              <Section label="Items">
                <ItemsBlock
                  items={fullData.items}
                  finalTotal={fullData.order.final_total_amount}
                />
              </Section>

              <Section label="Payment">
                <PaymentBlock
                  lane={intake_lane}
                  payment={fullData.payment}
                  shopifyFinancialStatus={fullData.order.shopify_financial_status}
                  orderId={ticket.id}
                />
              </Section>

              {fullData.notes && (
                <Section label="Sales notes">
                  <NotesBlock notes={fullData.notes} />
                </Section>
              )}

              <Section label="Edit plan">
                <CockpitComposer
                  orderId={ticket.id}
                  existingItems={
                    (fullData.plan?.items ?? []) as Array<{
                      id: number;
                      op: import("@/lib/cs/edit-plan/types").EditPlanOp;
                      payload: unknown;
                      created_at: string;
                    }>
                  }
                  orderItems={fullData.items.map((i) => ({
                    id: i.id,
                    product_name: i.product_name,
                    variant_name: i.variant_name,
                    quantity: i.quantity,
                  }))}
                />
              </Section>
            </>
          )}
        </div>

        {/* footer — preserves all Pass 1 triage functionality */}
        <footer className="border-t border-[var(--color-border-primary)] px-5 py-4 space-y-3">
          {!claimedByOther && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Route to
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
                  className="w-full px-3 py-1.5 text-sm border border-[var(--color-border-primary)] rounded-md"
                />
              )}

              {error && (
                <div className="text-xs px-3 py-2 rounded bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error-light)]">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={() => void confirm()}
                disabled={saving || (destination === "hold" && !holdReason.trim())}
                className="w-full px-3 py-2 rounded text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Routing…" : "Confirm & Route →"}
              </button>
              <div className="text-[10px] text-[var(--color-text-tertiary)] text-center">
                Esc to close · ⌘/Ctrl+Enter to confirm
              </div>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
          {label}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

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
  // Unknown / null: render nothing
  return null;
}

