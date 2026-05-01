"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Truck, X, Paperclip, AlertTriangle, Copy, Pencil, Check } from "lucide-react";

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
};

type Props = {
  ticket: TicketSummary;
  currentUserId: string;
  onClose: () => void;
  onTriaged: () => void;
};

// Auto-suggest the destination based on delivery_method. Pre-Order is
// CS's call (no inventory data here), so we never auto-pick it. The
// suggestion is a hint, not a hard rule — rep overrides freely.
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

export function TicketDrawer({ ticket, currentUserId, onClose, onTriaged }: Props) {
  const [destination, setDestination] = useState<TriageDestination>(
    suggestDestination(ticket.delivery_method),
  );
  const [holdReason, setHoldReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claimedByOther =
    !!ticket.claimed_by_user_id && ticket.claimed_by_user_id !== currentUserId;

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

  const previewReceipt = useCallback(async () => {
    const res = await fetch(`/api/sales/orders/${ticket.id}/receipt-signed-url`);
    if (!res.ok) return;
    const j = await res.json();
    if (j.url) window.open(j.url, "_blank");
  }, [ticket.id]);

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
              <LaneChip createdByName={ticket.created_by_name} />
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
          <Section
            label="Customer"
            action={
              <button
                type="button"
                disabled
                title="Inline edit coming in Pass 5"
                className="p-1 rounded text-[var(--color-text-tertiary)] cursor-not-allowed"
                aria-label="Edit customer (coming soon)"
              >
                <Pencil size={12} />
              </button>
            }
          >
            <div className="space-y-1.5">
              <CopyField
                label="Name"
                value={ticket.customer?.full_name ?? "—"}
                copyable={!!ticket.customer?.full_name}
              />
              <CopyField
                label="Phone"
                value={ticket.customer?.phone ?? "—"}
                copyable={!!ticket.customer?.phone}
              />
              <CopyField
                label="Order #"
                value={ticket.shopify_order_name ?? ticket.avalon_order_number ?? ticket.id.slice(0, 8)}
                copyable
              />
            </div>
          </Section>

          <Section label="Total">
            <div className="text-lg font-semibold tabular-nums">
              ₱{ticket.final_total_amount.toFixed(2)}
            </div>
          </Section>

          <Section label="Payment">
            <div className="flex items-center gap-2">
              <span>{ticket.mode_of_payment ?? "—"}</span>
              {ticket.payment_other_label && (
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  ({ticket.payment_other_label})
                </span>
              )}
              {ticket.payment_receipt_path && (
                <button
                  type="button"
                  onClick={() => void previewReceipt()}
                  className="ml-1 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:opacity-80"
                >
                  <Paperclip size={12} /> View receipt
                </button>
              )}
            </div>
            {ticket.shopify_financial_status && (
              <div className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                Shopify: {ticket.shopify_financial_status}
                {ticket.shopify_fulfillment_status
                  ? ` · ${ticket.shopify_fulfillment_status}`
                  : ""}
              </div>
            )}
          </Section>

          <Section label="Delivery">
            <div className="inline-flex items-center gap-1.5">
              <Truck size={14} />
              <span>{ticket.delivery_method?.toUpperCase() ?? "—"}</span>
            </div>
            {ticket.delivery_method_notes && (
              <div className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                {ticket.delivery_method_notes}
              </div>
            )}
          </Section>

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
        </div>

        {/* footer */}
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

function LaneChip({ createdByName }: { createdByName: string | null }) {
  // null created_by_name => storefront / Shopify-direct (conversion sale).
  // populated => an Avalon agent created the order via the chat-sales flow.
  const isConversion = !createdByName;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
        isConversion
          ? "bg-[var(--color-info-light)] text-[var(--color-info)]"
          : "bg-[var(--color-success-light)] text-[var(--color-success)]"
      }`}
    >
      {isConversion ? "Conversion" : "Sales"}
    </span>
  );
}

function CopyField({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API can fail in some browsers / iframe contexts. Silent fail.
    }
  };
  return (
    <div className="flex items-center gap-2 group">
      <span className="text-[11px] text-[var(--color-text-tertiary)] w-14 shrink-0">
        {label}
      </span>
      <span className="text-sm flex-1 min-w-0 truncate">{value}</span>
      {copyable && (
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label={`Copy ${label}`}
          className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      )}
    </div>
  );
}
