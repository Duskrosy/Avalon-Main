"use client";

import { useEffect, useState } from "react";
import { Truck, Upload } from "lucide-react";
import type { DrawerHandoff } from "./types";
import { ReceiptModal, toLocalDatetimeInputValue } from "./receipt-modal";

type Props = {
  orderId: string | null;
  handoff: DrawerHandoff;
  onSetHandoff: (patch: Partial<DrawerHandoff>) => void;
};

const MOP_OPTIONS = ["COD", "GCash", "Credit Card", "Bank Transfer", "QR PH", "Other"] as const;
const DIGITAL_MOPS = new Set(["GCash", "Credit Card", "Bank Transfer", "QR PH"]);

const DELIVERY_OPTIONS_NON_COD = [
  { value: "tnvs", label: "TNVS" },
  { value: "lwe", label: "LWE" },
  { value: "other", label: "Other" },
] as const;

export function StepHandoff({ orderId, handoff, onSetHandoff }: Props) {
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
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Mode of Payment</label>
        <select
          value={handoff.mode_of_payment ?? ""}
          onChange={(e) => onSetMop(e.target.value || null)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
        >
          <option value="">— Select —</option>
          {MOP_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {isOther && (
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Payment label</label>
          <input
            type="text"
            value={handoff.payment_other_label ?? ""}
            onChange={(e) => onSetHandoff({ payment_other_label: e.target.value || null })}
            placeholder="e.g. Maya, Cebuana, store credit…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
          />
        </div>
      )}

      {(requiresReceipt || isOther) && (
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

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Delivery Method</label>
        {isCOD ? (
          <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
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
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
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
          <label className="text-xs font-medium text-gray-700 block mb-1">
            Delivery notes (visible to all downstream)
          </label>
          <textarea
            value={handoff.delivery_method_notes ?? ""}
            onChange={(e) => onSetHandoff({ delivery_method_notes: e.target.value || null })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md min-h-[60px]"
            placeholder="Courier name, instructions, tracking…"
          />
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Notes (optional)</label>
        <textarea
          value={handoff.notes ?? ""}
          onChange={(e) => onSetHandoff({ notes: e.target.value || null })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md min-h-[60px]"
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

  const upload = async (file: File) => {
    if (!orderId) return;
    setUploading(true);
    try {
      const sigRes = await fetch(`/api/sales/orders/${orderId}/receipt-upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const sig = await sigRes.json();
      if (!sigRes.ok) return;
      const put = await fetch(sig.signedUrl, { method: "PUT", body: file });
      if (!put.ok) return;
      onChangeReceipt(sig.path);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 block">Receipt</label>
        {receiptPath ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-24 h-16 bg-gray-100 rounded border border-gray-200 overflow-hidden flex-shrink-0"
            >
              {thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl} alt="receipt" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[11px] text-gray-500">Loading…</span>
              )}
            </button>
            <div className="flex-1 text-xs">
              <div className="text-gray-700 truncate">{receiptPath.split("/").pop()}</div>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="text-blue-600"
                >
                  ⤢ Expand
                </button>
                <button
                  type="button"
                  onClick={() => onChangeReceipt(null)}
                  className="text-rose-600"
                >
                  ✕ Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-xs border border-dashed border-gray-300 rounded-md px-3 py-2 cursor-pointer hover:bg-gray-50">
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
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          Reference number {requireRef && "*"}
        </label>
        <input
          type="text"
          value={referenceNumber}
          onChange={(e) => onChangeRef(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          Transaction date &amp; time *
        </label>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={transactionAt}
            onChange={(e) => onChangeTxnAt(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md"
          />
          <button
            type="button"
            onClick={() => onChangeTxnAt(toLocalDatetimeInputValue(new Date()))}
            className="px-2 text-[11px] text-blue-600 border border-blue-200 rounded"
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
