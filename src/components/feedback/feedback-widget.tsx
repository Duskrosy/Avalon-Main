"use client";

import { useState, useEffect, useRef } from "react";

const CATEGORIES = [
  { value: "bug", label: "Bug" },
  { value: "missing_feature", label: "Missing feature" },
  { value: "confusing", label: "Confusing" },
  { value: "slow", label: "Slow" },
  { value: "other", label: "Other" },
] as const;

const PRIORITIES = [
  { value: "low",    label: "Low",    bg: "bg-gray-100 text-gray-700",       on: "bg-gray-600 text-white" },
  { value: "medium", label: "Medium", bg: "bg-blue-100 text-blue-700",       on: "bg-blue-600 text-white" },
  { value: "high",   label: "High",   bg: "bg-amber-100 text-amber-800",     on: "bg-amber-600 text-white" },
  { value: "urgent", label: "Urgent", bg: "bg-red-100 text-red-700",         on: "bg-red-600 text-white" },
] as const;

const MAX_IMAGES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Priority = typeof PRIORITIES[number]["value"];

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

type Attachment = {
  file: File;
  preview: string;
};

export function FeedbackWidget() {
  const [open, setOpen]           = useState(false);
  const [category, setCategory]   = useState<string>("bug");
  const [priority, setPriority]   = useState<Priority>("medium");
  const [body, setBody]           = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-feedback", handler);
    return () => window.removeEventListener("open-feedback", handler);
  }, []);

  // Clean up object URLs when attachments change
  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.preview);
    };
  }, [attachments]);

  // Paste-to-attach inside the panel
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!panelRef.current || !e.clipboardData) return;
      const target = e.target as Node | null;
      if (target && !panelRef.current.contains(target)) return;
      const items = Array.from(e.clipboardData.items);
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && ALLOWED_MIME.includes(item.type)) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attachments.length]);

  const deviceInfo = typeof navigator !== "undefined"
    ? parseDeviceInfo(navigator.userAgent)
    : null;

  function addFiles(files: File[]) {
    setError(null);
    const space = MAX_IMAGES - attachments.length;
    if (space <= 0) {
      setError(`Maximum ${MAX_IMAGES} images.`);
      return;
    }
    const next: Attachment[] = [];
    for (const f of files.slice(0, space)) {
      if (!ALLOWED_MIME.includes(f.type)) {
        setError(`Unsupported file type: ${f.type || "unknown"}.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`Image too large: ${f.name} (max 10 MB).`);
        continue;
      }
      next.push({ file: f, preview: URL.createObjectURL(f) });
    }
    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function resetForm() {
    setBody("");
    setCategory("bug");
    setPriority("medium");
    for (const a of attachments) URL.revokeObjectURL(a.preview);
    setAttachments([]);
  }

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
          priority,
          body: body.trim(),
          page_url: window.location.pathname,
          user_agent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit feedback");
      }

      const { feedback } = await res.json();

      if (attachments.length > 0 && feedback?.id) {
        const form = new FormData();
        for (const a of attachments) form.append("files", a.file);
        const upload = await fetch(`/api/feedback/${feedback.id}/attachments`, {
          method: "POST",
          body: form,
        });
        if (!upload.ok) {
          const data = await upload.json().catch(() => ({}));
          throw new Error(typeof data.error === "string" ? data.error : "Feedback saved but image upload failed");
        }
      }

      setSubmitted(true);
      resetForm();
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
      <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

      <div
        ref={panelRef}
        className="fixed top-12 lg:top-14 right-4 lg:right-6 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-2xl"
      >
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

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">Priority</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PRIORITIES.map((p) => {
                  const active = priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={`rounded-[var(--radius-md)] px-2 py-1.5 text-xs font-medium transition-colors ${active ? p.on : p.bg}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

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

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Images <span className="text-[var(--color-text-tertiary)]">({attachments.length}/{MAX_IMAGES})</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_IMAGES}
                  className="text-[11px] text-[var(--color-accent)] hover:underline disabled:text-[var(--color-text-tertiary)] disabled:no-underline disabled:cursor-not-allowed"
                >
                  + Attach
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_MIME.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  addFiles(files);
                  e.target.value = "";
                }}
              />
              {attachments.length === 0 ? (
                <p className="text-[11px] text-[var(--color-text-tertiary)]">
                  Paste (⌘V) or click + Attach. Up to 3 images.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {attachments.map((a, i) => (
                    <div key={i} className="relative group aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-primary)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.preview} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="absolute top-0.5 right-0.5 rounded-full bg-black/70 text-white w-5 h-5 flex items-center justify-center text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="w-full rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-inverted)] transition-colors hover:bg-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send feedback"}
            </button>

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
