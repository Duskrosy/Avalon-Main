"use client";

import { useCallback, useEffect, useState } from "react";
import { Truck, Upload } from "lucide-react";
import type {
  DrawerHandoff,
  CustomerLite,
  DrawerLineItem,
  DrawerVoucher,
  AutoDiscountSnapshot,
} from "./types";
import { ReceiptModal, toLocalDatetimeInputValue } from "./receipt-modal";
import { OrderPreviewCard } from "./order-preview-card";

type Props = {
  orderId: string | null;
  handoff: DrawerHandoff;
  onSetHandoff: (patch: Partial<DrawerHandoff>) => void;
  customer: CustomerLite | null;
  items: DrawerLineItem[];
  voucher: DrawerVoucher | null;
  manualDiscount: number;
  manualDiscountReason: string | null;
  applyAutoDiscounts: boolean;
  autoDiscountPreview: AutoDiscountSnapshot | null;
  shippingFee: number;
  onJumpToStep: (step: 1 | 2 | 3) => void;
  addLater: boolean;
  onSetAddLater: (b: boolean) => void;
};

const MOP_OPTIONS = ["COD", "GCash", "Credit Card", "Bank Transfer", "QR PH", "Other"] as const;
const DIGITAL_MOPS = new Set(["GCash", "Credit Card", "Bank Transfer", "QR PH"]);

const DELIVERY_OPTIONS_NON_COD = [
  { value: "tnvs", label: "TNVS" },
  { value: "lwe", label: "LWE" },
  { value: "other", label: "Other" },
] as const;

export function StepHandoff({
  orderId,
  handoff,
  onSetHandoff,
  customer,
  items,
  voucher,
  manualDiscount,
  manualDiscountReason,
  applyAutoDiscounts,
  autoDiscountPreview,
  shippingFee,
  onJumpToStep,
  addLater,
  onSetAddLater,
}: Props) {
  const isCOD = handoff.mode_of_payment === "COD";
  const isOther = handoff.mode_of_payment === "Other";
  const requiresReceipt = handoff.mode_of_payment !== null && DIGITAL_MOPS.has(handoff.mode_of_payment);
  const dmIsOther = handoff.delivery_method === "other";

  const onSetMop = (mop: string | null) => {
    if (mop === "COD") {
      onSetHandoff({
        mode_of_payment: mop,
        delivery_method: "lwe",
        delivery_method_notes: null,
      });
    } else {
      onSetHandoff({
        mode_of_payment: mop,
        delivery_method:
          handoff.delivery_method === "lwe" && handoff.mode_of_payment === "COD"
            ? null
            : handoff.delivery_method,
      });
    }
  };

  return (
    <div className="space-y-4">
      <OrderPreviewCard
        customer={customer}
        items={items}
        voucher={voucher}
        manualDiscount={manualDiscount}
        manualDiscountReason={manualDiscountReason}
        applyAutoDiscounts={applyAutoDiscounts}
        autoDiscountPreview={autoDiscountPreview}
        shippingFee={shippingFee}
        onJumpToStep={onJumpToStep}
      />
      <div>
        <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">Mode of Payment</label>
        <select
          value={handoff.mode_of_payment ?? ""}
          onChange={(e) => onSetMop(e.target.value || null)}
          className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
        >
          <option value="">— Select —</option>
          {MOP_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {isOther && (
        <div>
          <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">Payment label</label>
          <input
            type="text"
            value={handoff.payment_other_label ?? ""}
            onChange={(e) => onSetHandoff({ payment_other_label: e.target.value || null })}
            placeholder="e.g. Maya, Cebuana, store credit…"
            className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
          />
        </div>
      )}

      {(requiresReceipt || isOther) && (
        <div className="space-y-3">
          <label className="inline-flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={addLater}
              onChange={(e) => onSetAddLater(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Add later</span>
              <span className="block text-[11px] text-[var(--color-text-secondary)]">
                I&apos;ll attach receipt, reference number, and transaction time after confirming
              </span>
            </span>
          </label>

          {addLater ? (
            <div className="text-[11px] text-[var(--color-text-secondary)] italic px-2 py-1.5 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-md">
              Receipt and payment details will be added after confirm.
            </div>
          ) : (
            <ReceiptBlock
              orderId={orderId}
              receiptPath={handoff.payment_receipt_path}
              referenceNumber={handoff.payment_reference_number ?? ""}
              transactionAt={handoff.payment_transaction_at ?? toLocalDatetimeInputValue(new Date())}
              requireRef={requiresReceipt}
              onChangeReceipt={(path) => onSetHandoff({ payment_receipt_path: path })}
              onChangeRef={(ref) => onSetHandoff({ payment_reference_number: ref || null })}
              onChangeTxnAt={(at) => onSetHandoff({ payment_transaction_at: at || null })}
            />
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">Delivery Method</label>
        {isCOD ? (
          <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-[var(--color-warning-light)] border border-[var(--color-warning)]/30 text-[var(--color-warning-text)]">
            <Truck size={11} /> LWE (auto, COD)
          </div>
        ) : (
          <select
            value={handoff.delivery_method ?? ""}
            onChange={(e) =>
              onSetHandoff({
                delivery_method:
                  (e.target.value as DrawerHandoff["delivery_method"]) || null,
                delivery_method_notes:
                  e.target.value === "other" ? handoff.delivery_method_notes : null,
              })
            }
            className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
          >
            <option value="">— Select —</option>
            {DELIVERY_OPTIONS_NON_COD.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {dmIsOther && (
        <div>
          <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">
            Delivery notes (visible to all downstream)
          </label>
          <textarea
            value={handoff.delivery_method_notes ?? ""}
            onChange={(e) => onSetHandoff({ delivery_method_notes: e.target.value || null })}
            className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md min-h-[60px]"
            placeholder="Courier name, instructions, tracking…"
          />
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">Notes (optional)</label>
        <textarea
          value={handoff.notes ?? ""}
          onChange={(e) => onSetHandoff({ notes: e.target.value || null })}
          className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md min-h-[60px]"
          placeholder="Any handoff details for ops…"
        />
      </div>
    </div>
  );
}

function ReceiptBlock({
  orderId,
  receiptPath,
  referenceNumber,
  transactionAt,
  requireRef,
  onChangeReceipt,
  onChangeRef,
  onChangeTxnAt,
}: {
  orderId: string | null;
  receiptPath: string | null;
  referenceNumber: string;
  transactionAt: string;
  requireRef: boolean;
  onChangeReceipt: (path: string | null) => void;
  onChangeRef: (ref: string) => void;
  onChangeTxnAt: (at: string) => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptPath || !orderId) {
      setThumbUrl(null);
      return;
    }
    fetch(`/api/sales/orders/${orderId}/receipt-signed-url`)
      .then((r) => r.json())
      .then((j) => setThumbUrl(j.url ?? null))
      .catch(() => setThumbUrl(null));
  }, [receiptPath, orderId]);

  const upload = useCallback(async (file: File) => {
    if (!orderId) {
      setUploadError("Save draft first (click 'Save draft' before uploading)");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const sigRes = await fetch(`/api/sales/orders/${orderId}/receipt-upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const sig = await sigRes.json();
      if (!sigRes.ok) {
        const msg = sig.error ?? `Upload URL signing failed (${sigRes.status})`;
        console.error("[receipt-upload]", msg, sig);
        setUploadError(msg);
        return;
      }
      const put = await fetch(sig.signedUrl, { method: "PUT", body: file });
      if (!put.ok) {
        const text = await put.text().catch(() => "");
        const msg = `Upload to storage failed (${put.status}): ${text.slice(0, 200)}`;
        console.error("[receipt-upload]", msg);
        setUploadError(msg);
        return;
      }
      onChangeReceipt(sig.path);
    } finally {
      setUploading(false);
    }
  }, [orderId, onChangeReceipt]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void upload(file);
            return;
          }
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [upload]);

  return (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-[var(--color-text-primary)] block">Receipt</label>
        {receiptPath ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-24 h-16 bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] overflow-hidden flex-shrink-0"
            >
              {thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl} alt="receipt" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[11px] text-[var(--color-text-secondary)]">Loading…</span>
              )}
            </button>
            <div className="flex-1 text-xs">
              <div className="text-[var(--color-text-primary)] truncate">{receiptPath.split("/").pop()}</div>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="text-[var(--color-accent)]"
                >
                  ⤢ Expand
                </button>
                <button
                  type="button"
                  onClick={() => onChangeReceipt(null)}
                  className="text-[var(--color-error)] bg-[var(--color-error-light)] border border-[var(--color-error)]/30 rounded px-1.5 py-0.5"
                >
                  ✕ Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 text-xs border border-dashed border-[var(--color-border-primary)] rounded-md px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-hover)]">
              <Upload size={12} />
              {uploading ? "Uploading…" : "Upload receipt"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
            </label>
            <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">
              Or paste an image (⌘V) directly here
            </div>
          </>
        )}
        {uploadError && (
          <div className="text-[11px] text-[var(--color-error)] mt-1 break-words">
            {uploadError}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">
          Reference number {requireRef && "*"}
        </label>
        <input
          type="text"
          value={referenceNumber}
          onChange={(e) => onChangeRef(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">
          Transaction date &amp; time *
        </label>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={transactionAt}
            onChange={(e) => onChangeTxnAt(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
          />
          <button
            type="button"
            onClick={() => onChangeTxnAt(toLocalDatetimeInputValue(new Date()))}
            className="px-2 text-[11px] text-[var(--color-accent)] border border-[var(--color-accent)]/30 rounded"
          >
            Use current
          </button>
        </div>
      </div>

      <ReceiptModal
        open={modalOpen}
        imageUrl={thumbUrl}
        referenceNumber={referenceNumber}
        transactionAt={transactionAt}
        onClose={() => setModalOpen(false)}
        onSetReferenceNumber={onChangeRef}
        onSetTransactionAt={onChangeTxnAt}
      />
    </>
  );
}
