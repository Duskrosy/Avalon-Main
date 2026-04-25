"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Undo2, X, RefreshCw } from "lucide-react";

type Props = {
  status: string;
  syncStatus: string;
  onRevert: () => void;
  onCancel: () => void;
  onRetrySync: () => void;
};

export function OrderActionsMenu({ status, syncStatus, onRevert, onCancel, onRetrySync }: Props) {
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
        className="p-1 text-gray-400 hover:text-gray-700 rounded"
        aria-label="Order actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1 text-sm">
          {syncStatus === "failed" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRetrySync();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
            >
              <RefreshCw size={13} /> Retry sync
            </button>
          )}
          {status !== "draft" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRevert();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
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
            className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-700 flex items-center gap-2"
          >
            <X size={13} /> Cancel order
          </button>
        </div>
      )}
    </div>
  );
}
