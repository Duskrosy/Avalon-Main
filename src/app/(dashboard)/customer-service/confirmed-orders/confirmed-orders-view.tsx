"use client";

import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Lock, Paperclip, Truck } from "lucide-react";
import { TicketDrawer } from "./ticket-drawer";

type ConfirmedOrder = {
  id: string;
  avalon_order_number: string | null;
  shopify_order_name: string | null;
  shopify_financial_status: string | null;
  shopify_fulfillment_status: string | null;
  mode_of_payment: string | null;
  payment_other_label: string | null;
  payment_receipt_path: string | null;
  delivery_method: "lwe" | "tnvs" | "other" | null;
  delivery_method_notes: string | null;
  final_total_amount: number;
  completed_at: string | null;
  created_by_name: string | null;
  intake_lane: string | null; // Pass 2: direct lane column
  customer: { id: string; full_name: string; phone: string | null } | null;
  cs_hold_reason: string | null;
  person_in_charge_label: string | null;
  status: string;
  completion_status: "incomplete" | "complete";
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  claimer: { id: string; full_name: string } | null;
};

type Tab = "inbox" | "in_progress" | "done" | "all";

export function ConfirmedOrdersView({ currentUserId }: { currentUserId: string }) {
  const [orders, setOrders] = useState<ConfirmedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("inbox");
  const [search, setSearch] = useState("");
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (search) params.set("q", search);
      const res = await fetch(`/api/customer-service/confirmed-orders?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  // Auto-dismiss toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const claim = async (orderId: string) => {
    setPendingClaimId(orderId);
    try {
      const res = await fetch(`/api/customer-service/orders/${orderId}/triage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      if (res.ok) {
        setOpenTicketId(orderId);
        void fetchOrders();
      } else if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        // Two distinct 409 cases: actually claimed by someone (claimer_name
        // present) vs the row simply isn't in inbox state anymore (already
        // routed, cancelled, etc.). Toast wording differs.
        if (j.claimer_name) {
          setToast(`${j.claimer_name} just claimed this`);
        } else {
          setToast(j.error ?? "Cannot claim this ticket");
        }
        void fetchOrders();
      } else {
        const j = await res.json().catch(() => ({}));
        setToast(j.error ?? "Could not claim ticket");
      }
    } finally {
      setPendingClaimId(null);
    }
  };

  const previewReceipt = async (orderId: string) => {
    const res = await fetch(`/api/sales/orders/${orderId}/receipt-signed-url`);
    if (!res.ok) return;
    const j = await res.json();
    if (j.url) window.open(j.url, "_blank");
  };

  const openTicket = orders.find((o) => o.id === openTicketId) ?? null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Confirmed Orders</h1>
        <input
          type="search"
          placeholder="Search order # / name / phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[var(--color-border-primary)] rounded-md w-72"
        />
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--color-border-primary)]">
        {(["inbox", "in_progress", "done", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs border-b-2 -mb-px ${
              tab === t
                ? "border-[var(--color-accent)] text-[var(--color-accent)] font-medium"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {t === "in_progress" ? "In progress" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Desktop / tablet: table. Mobile: card list. */}
      <div className="hidden md:block border border-[var(--color-border-primary)] rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg-secondary)] text-xs text-[var(--color-text-secondary)]">
            <tr>
              <th className="text-left px-3 py-2">Order</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell">MOP</th>
              <th className="text-left px-3 py-2">Delivery</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell">Agent</th>
              <th className="text-right px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-[var(--color-text-tertiary)]">Loading…</td></tr>
            )}
            {!loading && orders.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-[var(--color-text-tertiary)]">No orders</td></tr>
            )}
            {orders.map((o) => {
              const claimedByMe =
                o.claimed_by_user_id !== null && o.claimed_by_user_id === currentUserId;
              const claimedByOther =
                o.claimed_by_user_id !== null && o.claimed_by_user_id !== currentUserId;
              // Inbox state = the row is actually claimable. Outside the
              // inbox tab, rows may be already routed/done/cancelled. Requires
              // completion_status='complete' (sales has handed off) and that
              // CS hasn't triaged it yet (no person_in_charge_label).
              const inboxState =
                o.status === "confirmed" &&
                o.completion_status === "complete" &&
                o.person_in_charge_label === null;
              return (
                <tr
                  key={o.id}
                  className={`border-t border-[var(--color-border-secondary)] ${
                    claimedByOther ? "opacity-60" : ""
                  } ${claimedByMe ? "border-l-2 border-l-[var(--color-success)]" : ""}`}
                >
                  <td className="px-3 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{o.shopify_order_name ?? o.id.slice(0, 6)}</span>
                      <LaneChip lane={o.intake_lane} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <ShopifyBadges
                      fin={o.shopify_financial_status}
                      ful={o.shopify_fulfillment_status}
                    />
                    {o.cs_hold_reason && (
                      <span className="ml-1 inline-block text-[10px] uppercase font-semibold rounded px-1.5 py-0.5 bg-[var(--color-warning-light)] text-[var(--color-warning)] border border-[var(--color-warning-light)]">
                        ON HOLD — {o.cs_hold_reason}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div>{o.customer?.full_name ?? "—"}</div>
                    <div className="text-[11px] text-[var(--color-text-tertiary)]">
                      {o.customer?.phone ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    <span>{o.mode_of_payment ?? "—"}</span>
                    {o.payment_other_label && (
                      <span className="text-[11px] text-[var(--color-text-tertiary)]">
                        {" "}
                        ({o.payment_other_label})
                      </span>
                    )}
                    {o.payment_receipt_path && (
                      <button
                        type="button"
                        onClick={() => void previewReceipt(o.id)}
                        className="ml-1.5 text-[var(--color-accent)] hover:opacity-80"
                        aria-label="Preview receipt"
                      >
                        <Paperclip size={12} />
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2" title={o.delivery_method_notes ?? ""}>
                    <span className="inline-flex items-center gap-1">
                      <Truck size={12} />
                      {o.delivery_method?.toUpperCase() ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ₱{o.final_total_amount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-xs hidden lg:table-cell">
                    <div>{o.created_by_name ?? "—"}</div>
                    <div className="text-[var(--color-text-tertiary)]">
                      {o.completed_at ? format(new Date(o.completed_at), "MMM d, h:mm a") : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ActionCell
                      claimedByMe={claimedByMe}
                      claimedByOther={claimedByOther}
                      claimerName={o.claimer?.full_name ?? null}
                      claimedAt={o.claimed_at}
                      inboxState={inboxState}
                      routedTo={o.person_in_charge_label}
                      pending={pendingClaimId === o.id}
                      onClaim={() => void claim(o.id)}
                      onOpen={() => setOpenTicketId(o.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {loading && (
          <div className="px-3 py-4 text-center text-[var(--color-text-tertiary)] text-sm">
            Loading…
          </div>
        )}
        {!loading && orders.length === 0 && (
          <div className="px-3 py-4 text-center text-[var(--color-text-tertiary)] text-sm">
            No orders
          </div>
        )}
        {orders.map((o) => {
          const claimedByMe =
            o.claimed_by_user_id !== null && o.claimed_by_user_id === currentUserId;
          const claimedByOther =
            o.claimed_by_user_id !== null && o.claimed_by_user_id !== currentUserId;
          const inboxState =
            o.status === "confirmed" &&
            o.completion_status === "complete" &&
            o.person_in_charge_label === null;
          return (
            <div
              key={o.id}
              className={`p-3 rounded-md border border-[var(--color-border-primary)] bg-[var(--color-surface-card)] ${
                claimedByOther ? "opacity-60" : ""
              } ${claimedByMe ? "border-l-2 border-l-[var(--color-success)]" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <span>{o.shopify_order_name ?? o.id.slice(0, 6)}</span>
                    <LaneChip lane={o.intake_lane} />
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)] truncate">
                    {o.customer?.full_name ?? "—"}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                    <span className="inline-flex items-center gap-1">
                      <Truck size={11} />
                      {o.delivery_method?.toUpperCase() ?? "—"}
                    </span>
                    <span className="tabular-nums">₱{o.final_total_amount.toFixed(2)}</span>
                  </div>
                </div>
                <ActionCell
                  claimedByMe={claimedByMe}
                  claimedByOther={claimedByOther}
                  claimerName={o.claimer?.full_name ?? null}
                  claimedAt={o.claimed_at}
                  inboxState={inboxState}
                  routedTo={o.person_in_charge_label}
                  pending={pendingClaimId === o.id}
                  onClaim={() => void claim(o.id)}
                  onOpen={() => setOpenTicketId(o.id)}
                />
              </div>
              {o.cs_hold_reason && (
                <div className="mt-2 inline-block text-[10px] uppercase font-semibold rounded px-1.5 py-0.5 bg-[var(--color-warning-light)] text-[var(--color-warning)]">
                  ON HOLD — {o.cs_hold_reason}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openTicket && (
        <TicketDrawer
          ticket={{
            ...openTicket,
            intake_lane: openTicket.intake_lane ?? null,
          }}
          currentUserId={currentUserId}
          onClose={() => setOpenTicketId(null)}
          onTriaged={() => {
            setOpenTicketId(null);
            void fetchOrders();
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm bg-[var(--color-surface-card)] border border-[var(--color-border-primary)] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function ActionCell({
  claimedByMe,
  claimedByOther,
  claimerName,
  claimedAt,
  inboxState,
  routedTo,
  pending,
  onClaim,
  onOpen,
}: {
  claimedByMe: boolean;
  claimedByOther: boolean;
  claimerName: string | null;
  claimedAt: string | null;
  inboxState: boolean;
  routedTo: string | null;
  pending: boolean;
  onClaim: () => void;
  onOpen: () => void;
}) {
  if (claimedByMe) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[var(--color-accent)] text-white hover:opacity-90"
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
        Open
      </button>
    );
  }
  if (claimedByOther) {
    const ago = claimedAt ? formatDistanceToNowStrict(new Date(claimedAt)) : "";
    const firstName = claimerName?.split(" ")[0] ?? "Agent";
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)]"
        aria-label={`Claimed by ${claimerName ?? "another agent"}${ago ? ` ${ago} ago` : ""}`}
      >
        <Lock size={11} />
        {firstName}
        {ago && <span className="text-[var(--color-text-tertiary)]"> · {shortAgo(ago)}</span>}
      </span>
    );
  }
  // Not in inbox state — already routed, done, or cancelled. No claim
  // affordance; show where it went so the All / In progress tabs are
  // still informative.
  if (!inboxState) {
    return (
      <span className="text-xs text-[var(--color-text-tertiary)]">
        {routedTo ? `→ ${routedTo}` : "—"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClaim}
      disabled={pending}
      className="px-3 py-1 rounded text-xs font-medium border border-[var(--color-border-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
    >
      {pending ? "…" : "Claim"}
    </button>
  );
}

// "2 minutes" -> "2m", "1 hour" -> "1h", etc. Compact for the badge.
function shortAgo(human: string): string {
  const match = human.match(/^(\d+)\s+(\w+)/);
  if (!match) return human;
  const [, num, unit] = match;
  const u = unit.startsWith("second")
    ? "s"
    : unit.startsWith("minute")
      ? "m"
      : unit.startsWith("hour")
        ? "h"
        : unit.startsWith("day")
          ? "d"
          : unit[0];
  return `${num}${u}`;
}

function LaneChip({ lane }: { lane: string | null }) {
  if (lane === "sales") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-[var(--color-success-light)] text-[var(--color-success)]">
        Sales
      </span>
    );
  }
  if (lane === "conversion") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-[var(--color-info-light)] text-[var(--color-info)]">
        Conversion
      </span>
    );
  }
  if (lane === "shopify_admin") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-[var(--color-accent-light,var(--color-info-light))] text-[var(--color-accent)]">
        Shopify Admin
      </span>
    );
  }
  if (lane === "quarantine") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-[var(--color-error-light)] text-[var(--color-error)]">
        Quarantine
      </span>
    );
  }
  return null;
}

function ShopifyBadges({ fin, ful }: { fin: string | null; ful: string | null }) {
  return (
    <div className="inline-flex items-center gap-1">
      {fin && (
        <span className="text-[10px] uppercase font-semibold rounded-full px-2 py-0.5 bg-[var(--color-warning-light)] text-[var(--color-warning)] border border-[var(--color-warning-light)]">
          {fin === "pending" ? "Payment pending" : fin}
        </span>
      )}
      {(ful === null || ful === "unfulfilled" || ful === "partial") && (
        <span className="text-[10px] uppercase font-semibold rounded-full px-2 py-0.5 bg-[var(--color-info-light)] text-[var(--color-info)] border border-[var(--color-info-light)]">
          {ful ?? "Unfulfilled"}
        </span>
      )}
    </div>
  );
}
