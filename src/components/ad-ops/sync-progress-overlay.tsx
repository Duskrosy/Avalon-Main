"use client";

import { useEffect, useState } from "react";

export type SyncProgressState = {
  open: boolean;
  title: string;
  label: string;
  detail: string | null;
  pct: number;
  status: "running" | "done" | "error";
  summaryText: string | null;
  errorText: string | null;
};

export const initialSyncProgress: SyncProgressState = {
  open: false,
  title: "Syncing from Meta",
  label: "Starting…",
  detail: null,
  pct: 0,
  status: "running",
  summaryText: null,
  errorText: null,
};

export function SyncProgressOverlay({
  state,
  onClose,
}: {
  state: SyncProgressState;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state.open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [state.open]);

  if (!state.open) return null;

  const dismissable = state.status !== "running";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
      />
      <div className="relative w-full max-w-md mx-4 bg-[var(--color-bg-primary)] rounded-2xl shadow-2xl border border-[var(--color-border-primary)] overflow-hidden">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center shrink-0">
              {state.status === "done" ? (
                <svg className="w-5 h-5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : state.status === "error" ? (
                <svg className="w-5 h-5 text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-[var(--color-accent)] animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)] truncate">{state.title}</h2>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                {state.status === "running" ? "This usually takes a minute or two." :
                 state.status === "done"    ? "Wrapped up successfully." :
                                              "Something went wrong."}
              </p>
            </div>
            {dismissable && (
              <button
                onClick={onClose}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-1 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug">
                {state.label}
              </p>
              <span className="text-xs font-semibold text-[var(--color-text-secondary)] tabular-nums shrink-0 ml-3">
                {state.pct}%
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  state.status === "error" ? "bg-[var(--color-error)]" : "bg-[var(--color-accent)]"
                }`}
                style={{ width: `${state.pct}%` }}
              />
            </div>
            {state.detail && (
              <p className="text-xs text-[var(--color-text-tertiary)] mt-2 truncate">{state.detail}</p>
            )}
          </div>

          {state.summaryText && state.status === "done" && (
            <div className="mt-4 px-3 py-2.5 bg-[var(--color-accent-light)] rounded-lg">
              <p className="text-sm text-[var(--color-text-primary)]">{state.summaryText}</p>
            </div>
          )}

          {state.errorText && (
            <div className="mt-4 px-3 py-2.5 bg-[var(--color-error-light)] rounded-lg">
              <p className="text-sm text-[var(--color-error)] break-words">{state.errorText}</p>
            </div>
          )}
        </div>

        {dismissable && (
          <div className="border-t border-[var(--color-border-secondary)] px-6 py-3 flex justify-end">
            <button
              onClick={onClose}
              className="text-sm font-medium px-4 py-1.5 rounded-lg bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)] transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper: consume SSE stream from fetch Response ────────────────────────

export async function consumeSyncStream(
  res: Response,
  onEvent: (event: unknown) => void,
): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: events are separated by a blank line (two \n\n).
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          onEvent(JSON.parse(payload));
        } catch {
          // Ignore malformed frames; server should never send them.
        }
      }
    }
  }
}
