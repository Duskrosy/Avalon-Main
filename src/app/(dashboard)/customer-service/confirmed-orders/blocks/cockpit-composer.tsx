"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { EditPlanOp } from "@/lib/cs/edit-plan/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanItem = {
  id: number;
  op: EditPlanOp;
  payload: unknown;
  created_at: string;
};

type DrawerPlan = {
  id: number;
  status: string;
  chosen_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  items: PlanItem[];
} | null;

type PlanAnalysis = {
  price_delta: number;
  payment_implication: string;
  proposed_path: string;
};

type AddressFormState = {
  street: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
  recipient_name: string;
};

type StagedItem = { op: EditPlanOp; payload: unknown };

type ActiveForm =
  | { type: "add_item" }
  | { type: "remove_item" }
  | { type: "qty_change" }
  | { type: "address_shipping" }
  | { type: "address_billing" }
  | { type: "note" }
  | null;

type Props = {
  orderId: string;
  existingItems: PlanItem[];
  orderItems: Array<{ id: string; product_name: string; variant_name: string | null; quantity: number }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function opLabel(op: EditPlanOp): string {
  switch (op) {
    case "add_item": return "Add item";
    case "remove_item": return "Remove item";
    case "qty_change": return "Change qty";
    case "address_shipping": return "Change shipping address";
    case "address_billing": return "Change billing address";
    case "note": return "Add note";
  }
}

function payloadSummary(op: EditPlanOp, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  switch (op) {
    case "add_item":
      return `variant ${p.variant_id ?? "?"}, qty ${p.qty ?? "?"}, ₱${p.unit_price ?? "?"}`;
    case "remove_item":
      return `line item ${p.line_item_id ?? "?"}`;
    case "qty_change":
      return `line item ${p.line_item_id ?? "?"} → qty ${p.new_qty ?? "?"}`;
    case "address_shipping":
    case "address_billing":
      return [p.street, p.city, p.country].filter(Boolean).join(", ");
    case "note":
      return String(p.text ?? "").slice(0, 60);
  }
}

function implicationLabel(implication: string): string {
  switch (implication) {
    case "additional_charge": return "Additional charge due";
    case "refund_due": return "Refund due";
    default: return "No payment change";
  }
}

const EMPTY_ADDRESS: AddressFormState = {
  street: "", city: "", province: "", country: "Philippines",
  zip: "", phone: "", recipient_name: "",
};

// ── Inline forms ──────────────────────────────────────────────────────────────

function AddItemForm({ onAdd }: { onAdd: (payload: unknown) => void }) {
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  return (
    <div className="space-y-2 p-3 border border-[var(--color-border-primary)] rounded text-xs">
      <div className="font-medium text-[var(--color-text-primary)]">Add item</div>
      <input
        className="w-full px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs"
        placeholder="Variant ID"
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="w-20 px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs"
          placeholder="Qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <input
          className="flex-1 px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs"
          placeholder="Unit price (₱)"
          type="number"
          min={0}
          step="0.01"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          if (!variantId.trim() || !qty || !unitPrice) return;
          onAdd({ variant_id: variantId.trim(), qty: parseInt(qty, 10), unit_price: parseFloat(unitPrice) });
        }}
        className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs hover:opacity-90"
      >
        Stage
      </button>
    </div>
  );
}

function RemoveItemForm({
  orderItems,
  onAdd,
}: {
  orderItems: Props["orderItems"];
  onAdd: (payload: unknown) => void;
}) {
  const [lineItemId, setLineItemId] = useState(orderItems[0]?.id ?? "");
  return (
    <div className="space-y-2 p-3 border border-[var(--color-border-primary)] rounded text-xs">
      <div className="font-medium text-[var(--color-text-primary)]">Remove item</div>
      <select
        className="w-full px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs"
        value={lineItemId}
        onChange={(e) => setLineItemId(e.target.value)}
      >
        {orderItems.map((oi) => (
          <option key={oi.id} value={oi.id}>
            {oi.product_name}{oi.variant_name ? ` · ${oi.variant_name}` : ""} (qty {oi.quantity})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => { if (lineItemId) onAdd({ line_item_id: lineItemId }); }}
        className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs hover:opacity-90"
      >
        Stage
      </button>
    </div>
  );
}

function QtyChangeForm({
  orderItems,
  onAdd,
}: {
  orderItems: Props["orderItems"];
  onAdd: (payload: unknown) => void;
}) {
  const [lineItemId, setLineItemId] = useState(orderItems[0]?.id ?? "");
  const [newQty, setNewQty] = useState("1");
  return (
    <div className="space-y-2 p-3 border border-[var(--color-border-primary)] rounded text-xs">
      <div className="font-medium text-[var(--color-text-primary)]">Change quantity</div>
      <select
        className="w-full px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs"
        value={lineItemId}
        onChange={(e) => setLineItemId(e.target.value)}
      >
        {orderItems.map((oi) => (
          <option key={oi.id} value={oi.id}>
            {oi.product_name}{oi.variant_name ? ` · ${oi.variant_name}` : ""} (currently {oi.quantity})
          </option>
        ))}
      </select>
      <input
        className="w-24 px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs"
        type="number"
        min={0}
        placeholder="New qty"
        value={newQty}
        onChange={(e) => setNewQty(e.target.value)}
      />
      <button
        type="button"
        onClick={() => { if (lineItemId && newQty !== "") onAdd({ line_item_id: lineItemId, new_qty: parseInt(newQty, 10) }); }}
        className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs hover:opacity-90"
      >
        Stage
      </button>
    </div>
  );
}

function AddressForm({
  title,
  onAdd,
}: {
  title: string;
  onAdd: (payload: unknown) => void;
}) {
  const [form, setForm] = useState<AddressFormState>(EMPTY_ADDRESS);
  const set = (key: keyof AddressFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="space-y-2 p-3 border border-[var(--color-border-primary)] rounded text-xs">
      <div className="font-medium text-[var(--color-text-primary)]">{title}</div>
      <input className="w-full px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs" placeholder="Recipient name" value={form.recipient_name} onChange={set("recipient_name")} />
      <input className="w-full px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs" placeholder="Street *" value={form.street} onChange={set("street")} />
      <div className="flex gap-2">
        <input className="flex-1 px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs" placeholder="City *" value={form.city} onChange={set("city")} />
        <input className="w-24 px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs" placeholder="ZIP" value={form.zip} onChange={set("zip")} />
      </div>
      <div className="flex gap-2">
        <input className="flex-1 px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs" placeholder="Province" value={form.province} onChange={set("province")} />
        <input className="flex-1 px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs" placeholder="Country *" value={form.country} onChange={set("country")} />
      </div>
      <input className="w-full px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs" placeholder="Phone" value={form.phone} onChange={set("phone")} />
      <button
        type="button"
        onClick={() => {
          if (!form.street.trim() || !form.city.trim() || !form.country.trim()) return;
          const payload: Record<string, string> = { street: form.street, city: form.city, country: form.country };
          if (form.province.trim()) payload.province = form.province;
          if (form.zip.trim()) payload.zip = form.zip;
          if (form.phone.trim()) payload.phone = form.phone;
          if (form.recipient_name.trim()) payload.recipient_name = form.recipient_name;
          onAdd(payload);
        }}
        className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs hover:opacity-90"
      >
        Stage
      </button>
    </div>
  );
}

function NoteForm({ onAdd }: { onAdd: (payload: unknown) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2 p-3 border border-[var(--color-border-primary)] rounded text-xs">
      <div className="font-medium text-[var(--color-text-primary)]">Add note</div>
      <textarea
        className="w-full px-2 py-1 border border-[var(--color-border-primary)] rounded text-xs resize-none"
        rows={3}
        placeholder="Note text…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        onClick={() => { if (text.trim()) onAdd({ text: text.trim() }); }}
        className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs hover:opacity-90"
      >
        Stage
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CockpitComposer({ orderId, existingItems, orderItems }: Props) {
  // Staged items start from the existing plan items; the rep can add more.
  const [staged, setStaged] = useState<StagedItem[]>(
    existingItems.map((item) => ({ op: item.op, payload: item.payload })),
  );
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [submitting, setSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<PlanAnalysis | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const addStaged = (op: EditPlanOp) => (payload: unknown) => {
    setStaged((prev) => [...prev, { op, payload }]);
    setActiveForm(null);
  };

  const removeStaged = (index: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== index));
    setAnalysis(null);
  };

  const submitPlan = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customer-service/orders/${orderId}/edit-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: staged }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.plan) {
        setAnalysis({
          price_delta: j.plan.price_delta,
          payment_implication: j.plan.payment_implication,
          proposed_path: j.plan.proposed_path,
        });
      } else if (res.status === 409) {
        setSubmitError(j.error ?? "Another rep is composing a draft for this order.");
      } else {
        setSubmitError(j.error ?? "Failed to save plan.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">

      {/* Staged items list */}
      {staged.length > 0 && (
        <div className="space-y-1">
          {staged.map((item, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded border border-[var(--color-border-primary)] text-xs"
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {opLabel(item.op)}
                </span>
                {" — "}
                <span className="text-[var(--color-text-secondary)] truncate">
                  {payloadSummary(item.op, item.payload)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeStaged(i)}
                aria-label="Remove staged item"
                className="p-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {staged.length === 0 && !activeForm && (
        <div className="text-xs text-[var(--color-text-tertiary)] italic">
          No edits staged yet. Use the buttons below to add operations.
        </div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="px-3 py-2 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] text-xs space-y-1">
          <div className="font-medium text-[var(--color-text-primary)]">Plan analysis</div>
          <div className="flex items-center gap-4 text-[var(--color-text-secondary)]">
            <span>
              Price delta:{" "}
              <span className={`font-semibold tabular-nums ${analysis.price_delta > 0 ? "text-[var(--color-error)]" : analysis.price_delta < 0 ? "text-[var(--color-success)]" : ""}`}>
                {analysis.price_delta > 0 ? "+" : ""}₱{analysis.price_delta.toFixed(2)}
              </span>
            </span>
            <span>{implicationLabel(analysis.payment_implication)}</span>
          </div>
          <div className="text-[var(--color-text-tertiary)]">
            Suggested path: <span className="font-medium">{analysis.proposed_path}</span>
          </div>
        </div>
      )}

      {/* Inline form */}
      {activeForm?.type === "add_item" && <AddItemForm onAdd={addStaged("add_item")} />}
      {activeForm?.type === "remove_item" && (
        <RemoveItemForm orderItems={orderItems} onAdd={addStaged("remove_item")} />
      )}
      {activeForm?.type === "qty_change" && (
        <QtyChangeForm orderItems={orderItems} onAdd={addStaged("qty_change")} />
      )}
      {activeForm?.type === "address_shipping" && (
        <AddressForm title="Change shipping address" onAdd={addStaged("address_shipping")} />
      )}
      {activeForm?.type === "address_billing" && (
        <AddressForm title="Change billing address" onAdd={addStaged("address_billing")} />
      )}
      {activeForm?.type === "note" && <NoteForm onAdd={addStaged("note")} />}

      {/* Op buttons */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { op: "add_item", label: "Add item" },
            { op: "remove_item", label: "Remove item" },
            { op: "qty_change", label: "Change qty" },
            { op: "address_shipping", label: "Shipping addr" },
            { op: "address_billing", label: "Billing addr" },
            { op: "note", label: "Note" },
          ] as { op: EditPlanOp; label: string }[]
        ).map(({ op, label }) => (
          <button
            key={op}
            type="button"
            onClick={() =>
              setActiveForm((prev) => (prev?.type === op ? null : { type: op }))
            }
            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors ${
              activeForm?.type === op
                ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                : "border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
            }`}
          >
            <Plus size={10} /> {label}
          </button>
        ))}
      </div>

      {/* Submit errors */}
      {submitError && (
        <div className="text-xs px-3 py-2 rounded bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error-light)]">
          {submitError}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => void submitPlan()}
          disabled={submitting || staged.length === 0}
          className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save draft plan"}
        </button>

        {/* Phase A: Apply plan is disabled */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled
            title="Apply plan is available in Phase B"
            className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] opacity-50 cursor-not-allowed"
          >
            Apply plan
          </button>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-warning-light)] text-[var(--color-warning)] font-semibold uppercase tracking-wider">
            Phase B
          </span>
        </div>
      </div>
    </div>
  );
}
