"use client";

import { useState, useEffect } from "react";

const CATEGORIES = [
  { value: "bug", label: "Bug" },
  { value: "missing_feature", label: "Missing feature" },
  { value: "confusing", label: "Confusing" },
  { value: "slow", label: "Slow" },
  { value: "other", label: "Other" },
] as const;

function parseDeviceInfo(ua: string): string {
  let browser = "Browser";
  if (ua.includes("Edg/"))                                    browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera/"))     browser = "Opera";
  else if (ua.includes("Chrome/") && !ua.includes("Chromium")) browser = "Chrome";
  else if (ua.includes("Firefox/"))                          browser = "Firefox";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";

  let device = "Unknown";
  if (ua.includes("iPhone"))          device = "iPhone";
  else if (ua.includes("iPad"))       device = "iPad";
  else if (ua.includes("Android"))    device = "Android";
  else if (ua.includes("Mac OS X"))   device = "macOS";
  else if (ua.includes("Windows"))    device = "Windows";
  else if (ua.includes("Linux"))      device = "Linux";

  return `${browser} · ${device}`;
}

export function FeedbackWidget() {
  const [open, setOpen]           = useState(false);
  const [category, setCategory]   = useState<string>("bug");
  const [body, setBody]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Listen for trigger from sidebar gear dropdown or any other caller
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-feedback", handler);
    return () => window.removeEventListener("open-feedback", handler);
  }, []);

  const deviceInfo = typeof navigator !== "undefined"
    ? parseDeviceInfo(navigator.userAgent)
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          body: body.trim(),
          page_url: window.location.pathname,
          user_agent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit feedback");
      }

      setSubmitted(true);
      setBody("");
      setCategory("bug");
      setTimeout(() => { setSubmitted(false); setOpen(false); }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop — closes on outside click */}
      <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

      {/* Panel — drops from topbar */}
      <div className="fixed top-12 lg:top-14 right-4 lg:right-6 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-secondary)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Send feedback</h3>
          <button
            onClick={() => setOpen(false)}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-success)]">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Thanks for your feedback!</p>
            <a
              href="/pulse/tickets"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              View your tickets at /pulse/tickets
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Body */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">What happened?</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe the issue or suggestion..."
                rows={3}
                maxLength={2000}
                className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>

            {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="w-full rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-inverted)] transition-colors hover:bg-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send feedback"}
            </button>

            {/* Device tag */}
            <div className="flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)]">
              <span>Page: {typeof window !== "undefined" ? window.location.pathname : ""}</span>
              {deviceInfo && (
                <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] font-medium">{deviceInfo}</span>
              )}
            </div>
          </form>
        )}
      </div>
    </>
  );
}
