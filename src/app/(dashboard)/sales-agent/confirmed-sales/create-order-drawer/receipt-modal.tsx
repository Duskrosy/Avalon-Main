"use client";

import { X } from "lucide-react";
import { useState } from "react";

type Props = {
  open: boolean;
  imageUrl: string | null;
  referenceNumber: string;
  transactionAt: string;
  onClose: () => void;
  onSetReferenceNumber: (s: string) => void;
  onSetTransactionAt: (s: string) => void;
};

export function ReceiptModal({
  open,
  imageUrl,
  referenceNumber,
  transactionAt,
  onClose,
  onSetReferenceNumber,
  onSetTransactionAt,
}: Props) {
  const [zoom, setZoom] = useState(1);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/50">
      <div className="m-auto w-full max-w-5xl h-[90vh] bg-white rounded-lg shadow-2xl flex">
        {/* Left: zoomable image */}
        <div className="flex-1 bg-gray-900 relative overflow-auto">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2 right-2 z-10 text-white bg-black/40 rounded-full p-1"
          >
            <X size={18} />
          </button>
          <div
            className="min-h-full flex items-center justify-center p-4 cursor-zoom-in"
            onClick={() => setZoom((z) => (z >= 3 ? 1 : z + 0.5))}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Receipt"
                style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.2s" }}
                className="max-w-full max-h-full"
              />
            ) : (
              <div className="text-gray-400 text-sm">No image to preview</div>
            )}
          </div>
          <div className="absolute bottom-2 left-2 text-[11px] text-white/70">
            Click image to zoom ({zoom.toFixed(1)}×)
          </div>
        </div>

        {/* Right: form */}
        <div className="w-80 p-4 space-y-4 border-l border-gray-200">
          <div className="text-sm font-semibold">Receipt details</div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Reference number *</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => onSetReferenceNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Transaction date &amp; time *</label>
            <input
              type="datetime-local"
              value={transactionAt}
              onChange={(e) => onSetTransactionAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
            />
            <button
              type="button"
              onClick={() => onSetTransactionAt(toLocalDatetimeInputValue(new Date()))}
              className="text-[11px] text-blue-600 mt-1"
            >
              Use current
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full px-3 py-2 bg-blue-600 text-white text-xs rounded-md"
          >
            Save &amp; close
          </button>
        </div>
      </div>
    </div>
  );
}

export function toLocalDatetimeInputValue(d: Date): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM" with no timezone.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
