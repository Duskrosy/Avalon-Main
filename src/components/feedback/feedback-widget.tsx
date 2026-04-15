"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "bug", label: "Bug" },
  { value: "missing_feature", label: "Missing feature" },
  { value: "confusing", label: "Confusing" },
  { value: "slow", label: "Slow" },
  { value: "other", label: "Other" },
] as const;

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("bug");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit feedback");
      }

      setSubmitted(true);
      setBody("");
      setCategory("bug");

      setTimeout(() => {
        setSubmitted(false);
        setOpen(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-text-primary)] text-white shadow-[var(--shadow-lg)] transition-transform hover:scale-105 active:scale-95"
        aria-label="Send feedback"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border-secondary)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Send feedback
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {submitted ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16a34a"
                strokeWidth="2"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Thanks for your feedback!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  What happened?
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Describe the issue or suggestion..."
                  rows={3}
                  maxLength={2000}
                  className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-border-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>

              {error && (
                <p className="text-xs text-[var(--color-error)]">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !body.trim()}
                className="w-full rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Sending..." : "Send feedback"}
              </button>

              <p className="text-center text-[11px] text-[var(--color-text-tertiary)]">
                Page: {typeof window !== "undefined" ? window.location.pathname : ""}
              </p>
            </form>
          )}
        </div>
      )}
    </>
  );
}
