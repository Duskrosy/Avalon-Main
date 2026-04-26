"use client";

import { useState, useRef, useEffect } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  MoreHorizontal,
  Undo2,
  X,
  RefreshCw,
} from "lucide-react";

type Props = {
  status: string;
  syncStatus: string;
  onRevert: () => void;
  onCancel: () => void;
  onRetrySync: () => void;
  onComplete?: () => void;
  onSplitBundle?: () => void;
  onOpenAdjustment?: () => void;
};

export function OrderActionsMenu({
  status,
  syncStatus,
  onRevert,
  onCancel,
  onRetrySync,
  onComplete,
  onSplitBundle,
  onOpenAdjustment,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (status === "cancelled") return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded"
        aria-label="Order actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 w-48 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md shadow-lg py-1 text-sm">
          {syncStatus === "failed" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRetrySync();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] flex items-center gap-2"
            >
              <RefreshCw size={13} /> Retry sync
            </button>
          )}
          {onComplete && status === "confirmed" && syncStatus === "synced" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onComplete();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-success-light)] text-[var(--color-success)] flex items-center gap-2"
            >
              <CheckCircle2 size={13} /> Mark complete
            </button>
          )}
          {onSplitBundle && status !== "draft" && status !== "cancelled" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSplitBundle();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent-light)] text-[var(--color-accent)] flex items-center gap-2"
              title="Distribute the order total evenly across all units (B1T1 COD waybill)"
            >
              <Calculator size={13} /> Split bundle evenly
            </button>
          )}
          {onOpenAdjustment && status !== "cancelled" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenAdjustment();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-warning-light)] text-[var(--color-warning)] flex items-center gap-2"
              title="Open a CS / Inventory / Fulfillment ticket on this order"
            >
              <AlertTriangle size={13} /> Open adjustment
            </button>
          )}
          {status !== "draft" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRevert();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] flex items-center gap-2"
            >
              <Undo2 size={13} /> Revert to draft
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCancel();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-error-light)] text-[var(--color-error)] flex items-center gap-2"
          >
            <X size={13} /> Cancel order
          </button>
        </div>
      )}
    </div>
  );
}
