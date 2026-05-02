"use client";

import { useState } from "react";
import { Pencil, Check, X, Plus } from "lucide-react";

type OrderItem = {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price_amount: number;
  line_total_amount: number;
  size: string | null;
  color: string | null;
  image_url: string | null;
};

// ── Staged op types (subset used here) ───────────────────────────────────────
export type ItemStagedOp =
  | { op: "qty_change"; payload: { line_item_id: string; new_qty: number } }
  | { op: "remove_item"; payload: { line_item_id: string } }
  | { op: "add_item"; payload: { variant_id: string; qty: number; unit_price: number } };

type Props = {
  items: OrderItem[];
  finalTotal: number;
  voucher_code?: string | null;
  voucherDiscountAmount?: number;
  manualDiscountAmount?: number;
  manualDiscountReason?: string | null;
  shippingFeeAmount?: number;
  // Lift staged ops up to ticket-drawer for pending-changes tracking.
  onStagedOpsChange?: (ops: ItemStagedOp[]) => void;
  // Read-only when claimed by another agent.
  readOnly?: boolean;
};

// ── Image thumbnail ───────────────────────────────────────────────────────────

function ProductThumb({ url, alt }: { url: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!url || errored) {
    return (
      <div
        aria-hidden="true"
        className="w-14 h-14 rounded shrink-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border-secondary)] flex items-center justify-center"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-text-tertiary)]">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setErrored(true)}
      className="w-14 h-14 rounded shrink-0 object-cover border border-[var(--color-border-secondary)] transition-transform hover:scale-105"
    />
  );
}

// ── Add item form ─────────────────────────────────────────────────────────────

function AddItemForm({ onStage, onCancel }: { onStage: (op: ItemStagedOp) => void; onCancel: () => void }) {
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  const canStage = variantId.trim() && qty && Number(qty) > 0 && unitPrice && Number(unitPrice) >= 0;

  return (
    <tr className="border-t border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
      <td colSpan={5} className="px-3 py-2">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">Variant ID</span>
            <input
              className="w-40 px-2 py-1 border border-[var(--color-border-primary)] rounded bg-[var(--color-bg-primary)] text-xs"
              placeholder="variant-uuid"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">Qty</span>
            <input
              className="w-16 px-2 py-1 border border-[var(--color-border-primary)] rounded bg-[var(--color-bg-primary)] text-xs"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">Unit price (₱)</span>
            <input
              className="w-24 px-2 py-1 border border-[var(--color-border-primary)] rounded bg-[var(--color-bg-primary)] text-xs"
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 pb-0.5">
            <button
              type="button"
              disabled={!canStage}
              onClick={() => {
                if (!canStage) return;
                onStage({
                  op: "add_item",
                  payload: { variant_id: variantId.trim(), qty: parseInt(qty, 10), unit_price: parseFloat(unitPrice) },
                });
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--color-accent)] text-white text-xs hover:opacity-90 disabled:opacity-40"
            >
              <Check size={12} /> Stage
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] text-xs hover:bg-[var(--color-bg-secondary)]"
            >
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ItemsBlock({
  items,
  finalTotal,
  voucher_code,
  voucherDiscountAmount = 0,
  manualDiscountAmount = 0,
  manualDiscountReason,
  shippingFeeAmount = 0,
  onStagedOpsChange,
  readOnly,
}: Props) {
  // Per-row edit state: item id → edited qty string
  const [editingQty, setEditingQty] = useState<Record<string, string>>({});
  // Track which items are staged for removal (for visual strikethrough)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  // Staged ops for this block — lifted to parent on each change
  const [stagedOps, setStagedOps] = useState<ItemStagedOp[]>([]);
  // Show add-item form
  const [showAddForm, setShowAddForm] = useState(false);

  function pushOp(op: ItemStagedOp, newRemovedIds?: Set<string>) {
    const next = [...stagedOps, op];
    setStagedOps(next);
    if (newRemovedIds) setRemovedIds(newRemovedIds);
    onStagedOpsChange?.(next);
  }

  function commitQtyEdit(item: OrderItem) {
    const raw = editingQty[item.id];
    if (raw === undefined) return;
    const newQty = parseInt(raw, 10);
    if (!isNaN(newQty) && newQty !== item.quantity && newQty >= 0) {
      if (newQty === 0) {
        // Treat qty=0 as remove
        const nextRemoved = new Set(removedIds).add(item.id);
        pushOp({ op: "remove_item", payload: { line_item_id: item.id } }, nextRemoved);
      } else {
        pushOp({ op: "qty_change", payload: { line_item_id: item.id, new_qty: newQty } });
      }
    }
    setEditingQty((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
  }

  function stageRemove(item: OrderItem) {
    const nextRemoved = new Set(removedIds).add(item.id);
    pushOp({ op: "remove_item", payload: { line_item_id: item.id } }, nextRemoved);
  }

  function stageAdd(op: ItemStagedOp) {
    pushOp(op);
    setShowAddForm(false);
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-tertiary)] italic">No line items.</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded border border-[var(--color-border-primary)] overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
            <tr>
              <th className="text-left px-3 py-1.5 w-16">Photo</th>
              <th className="text-left px-3 py-1.5">Item</th>
              <th className="text-right px-3 py-1.5">Qty</th>
              <th className="text-right px-3 py-1.5">Unit</th>
              <th className="text-right px-3 py-1.5">Total</th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isRemoved = removedIds.has(item.id);
              const isEditingQtyRow = item.id in editingQty;
              const label = [
                item.product_name,
                item.variant_name,
                item.size,
                item.color,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <tr
                  key={item.id}
                  className={`border-t border-[var(--color-border-secondary)] ${isRemoved ? "opacity-40 line-through" : ""}`}
                >
                  {/* Photo */}
                  <td className="px-3 py-2">
                    <ProductThumb url={item.image_url} alt={item.product_name} />
                  </td>

                  {/* Item label */}
                  <td className="px-3 py-2 text-[var(--color-text-primary)]">{label}</td>

                  {/* Qty — inline pencil edit */}
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-secondary)]">
                    {!readOnly && !isRemoved && isEditingQtyRow ? (
                      <span className="inline-flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          min={0}
                          className="w-14 px-1.5 py-0.5 border border-[var(--color-accent)] rounded text-xs text-right bg-[var(--color-bg-primary)]"
                          value={editingQty[item.id]}
                          onChange={(e) => setEditingQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commitQtyEdit(item); }
                            if (e.key === "Escape") { setEditingQty((prev) => { const n = { ...prev }; delete n[item.id]; return n; }); }
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => commitQtyEdit(item)}
                          aria-label="Confirm qty"
                          className="p-0.5 text-[var(--color-success)] hover:opacity-80"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingQty((prev) => { const n = { ...prev }; delete n[item.id]; return n; })}
                          aria-label="Cancel qty edit"
                          className="p-0.5 text-[var(--color-text-tertiary)] hover:opacity-80"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 justify-end">
                        {item.quantity}
                        {!readOnly && !isRemoved && (
                          <button
                            type="button"
                            onClick={() => setEditingQty((prev) => ({ ...prev, [item.id]: String(item.quantity) }))}
                            aria-label="Edit quantity"
                            className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-secondary)]">
                    ₱{item.unit_price_amount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    ₱{item.line_total_amount.toFixed(2)}
                  </td>

                  {/* Remove button */}
                  {!readOnly && (
                    <td className="pr-2 py-2 text-right">
                      {!isRemoved && (
                        <button
                          type="button"
                          onClick={() => stageRemove(item)}
                          aria-label={`Remove ${item.product_name}`}
                          className="p-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-error)]"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {/* Add item inline form */}
            {!readOnly && showAddForm && (
              <AddItemForm
                onStage={stageAdd}
                onCancel={() => setShowAddForm(false)}
              />
            )}
          </tbody>
          <tfoot className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <tr>
              <td colSpan={!readOnly ? 4 : 3} className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                Order total
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                ₱{finalTotal.toFixed(2)}
              </td>
              {!readOnly && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Voucher code */}
      {voucher_code && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--color-text-tertiary)]">Voucher applied:</span>
          <span className="font-mono font-medium px-1.5 py-0.5 rounded bg-[var(--color-success-light)] text-[var(--color-success)] border border-[var(--color-success-light)]">
            {voucher_code}
          </span>
          {voucherDiscountAmount > 0 && (
            <span className="text-[var(--color-text-secondary)] tabular-nums">
              −₱{voucherDiscountAmount.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Manual discount + reason */}
      {manualDiscountAmount > 0 && (
        <div className="text-xs space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-tertiary)]">Manual discount:</span>
            <span className="text-[var(--color-text-secondary)] tabular-nums">
              −₱{manualDiscountAmount.toFixed(2)}
            </span>
          </div>
          {manualDiscountReason && (
            <div className="pl-[5.25rem] text-[11px] italic text-[var(--color-text-secondary)]">
              <span className="not-italic text-[var(--color-text-tertiary)]">Reason: </span>
              {manualDiscountReason}
            </div>
          )}
        </div>
      )}

      {/* Shipping fee */}
      {shippingFeeAmount > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--color-text-tertiary)]">Shipping fee:</span>
          <span className="text-[var(--color-text-secondary)] tabular-nums">
            +₱{shippingFeeAmount.toFixed(2)}
          </span>
        </div>
      )}

      {/* Add item button */}
      {!readOnly && !showAddForm && (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] py-1"
        >
          <Plus size={13} /> Add item
        </button>
      )}
    </div>
  );
}
