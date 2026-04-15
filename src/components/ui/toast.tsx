"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ToastData = { message: string; type: "success" | "error" | "info" };

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, setToast };
}

export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (toast) {
      // Trigger enter animation
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 transition-all duration-200",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-3 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] text-sm font-medium max-w-sm",
          toast.type === "success" && "bg-[var(--color-success)] text-white",
          toast.type === "error" && "bg-[var(--color-error)] text-white",
          toast.type === "info" && "bg-[var(--color-text-primary)] text-white",
        )}
      >
        {toast.type === "success" && (
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {toast.type === "error" && (
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        <span className="flex-1">{toast.message}</span>
        <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
