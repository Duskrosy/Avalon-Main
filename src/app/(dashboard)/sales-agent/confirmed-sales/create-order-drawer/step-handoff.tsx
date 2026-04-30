"use client";

import { useState } from "react";
import { Truck, Upload, X } from "lucide-react";
import type { DrawerHandoff } from "./types";

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  const onUploadReceipt = async (file: File) => {
    if (!orderId) {
      setUploadError("Save draft first");
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
        setUploadError(sig.error ?? "Upload failed");
        return;
      }
      const put = await fetch(sig.signedUrl, { method: "PUT", body: file });
      if (!put.ok) {
        setUploadError("Upload to storage failed");
        return;
      }
      onSetHandoff({ payment_receipt_path: sig.path });
    } finally {
      setUploading(false);
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

      {requiresReceipt && (
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Receipt</label>
          {handoff.payment_receipt_path ? (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
              <span className="truncate flex-1">{handoff.payment_receipt_path.split("/").pop()}</span>
              <button
                type="button"
                onClick={() => onSetHandoff({ payment_receipt_path: null })}
                aria-label="Remove receipt"
              >
                <X size={12} />
              </button>
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
                  if (f) void onUploadReceipt(f);
                }}
              />
            </label>
          )}
          {uploadError && <div className="text-[11px] text-rose-600 mt-1">{uploadError}</div>}
        </div>
      )}

      {isOther && (
        <>
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
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Receipt (optional)</label>
            {handoff.payment_receipt_path ? (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
                <span className="truncate flex-1">{handoff.payment_receipt_path.split("/").pop()}</span>
                <button
                  type="button"
                  onClick={() => onSetHandoff({ payment_receipt_path: null })}
                  aria-label="Remove receipt"
                >
                  <X size={12} />
                </button>
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
                    if (f) void onUploadReceipt(f);
                  }}
                />
              </label>
            )}
          </div>
        </>
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
