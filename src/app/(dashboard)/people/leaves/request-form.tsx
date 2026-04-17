"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaveType = "vacation" | "sick" | "emergency" | "personal" | "absent";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function todayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toDateStr(d);
}

/** Returns min date for start field based on leave type. */
function getStartMin(type: LeaveType): string | undefined {
  if (type === "emergency" || type === "sick" || type === "absent") return undefined;
  return todayStr();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RequestForm({ open, onClose, onSuccess }: Props) {
  const [leaveType, setLeaveType]   = useState<LeaveType>("vacation");
  const [startDate, setStartDate]   = useState("");
  const [endDate, setEndDate]       = useState("");
  const [reason, setReason]         = useState("");
  const [files, setFiles]           = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setLeaveType("vacation");
      setStartDate("");
      setEndDate("");
      setReason("");
      setFiles(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const startMin = getStartMin(leaveType);
  const endMin   = startDate || startMin;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Step 1: create leave request
    let requestId: string;
    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date:   endDate,
          reason:     reason || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit leave request.");
        setSubmitting(false);
        return;
      }
      requestId = data.id;
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
      return;
    }

    // Step 2: upload attachments if any
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append("file", files[i]);
        try {
          const res = await fetch(`/api/leave-requests/${requestId}/attachments`, {
            method: "POST",
            body:   fd,
          });
          if (!res.ok) {
            setError("Request submitted but an attachment failed to upload.");
            setSubmitting(false);
            // Still treat as success since the leave was created
            onSuccess();
            onClose();
            return;
          }
        } catch {
          setError("Request submitted but an attachment failed to upload.");
          setSubmitting(false);
          onSuccess();
          onClose();
          return;
        }
      }
    }

    setSubmitting(false);
    onSuccess();
    onClose();
  }

  return (
    /* Backdrop */
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full max-w-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">New Leave Request</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Leave type */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              Leave type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "vacation",  label: "Vacation" },
                { value: "sick",      label: "Sick Leave" },
                { value: "emergency", label: "Emergency" },
                { value: "personal",  label: "Personal" },
                { value: "absent",    label: "Absent" },
              ] as { value: LeaveType; label: string }[]).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setLeaveType(value);
                    setStartDate("");
                    setEndDate("");
                  }}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm font-medium text-left transition-all",
                    leaveType === value
                      ? "border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                      : "border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-secondary)]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Start date
              </label>
              <input
                type="date"
                required
                min={startMin}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate && e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] text-[var(--color-text-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                End date
              </label>
              <input
                type="date"
                required
                min={endMin}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] text-[var(--color-text-primary)]"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Reason{" "}
              <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add context for your manager…"
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] resize-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Supporting documents{" "}
              <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
            </label>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFiles(e.target.files)}
              className="w-full text-sm text-[var(--color-text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--color-border-primary)] file:text-xs file:font-medium file:text-[var(--color-text-secondary)] file:bg-transparent file:cursor-pointer hover:file:border-[var(--color-text-secondary)] cursor-pointer"
            />
            {files && files.length > 0 && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] py-2.5 rounded-lg text-sm font-medium hover:border-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
