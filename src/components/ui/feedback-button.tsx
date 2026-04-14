"use client";

import { useState } from "react";

export function FeedbackButton({ pageUrl = "/" }: { pageUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "missing_feature",
          body: text.trim(),
          page_url: pageUrl,
        }),
      });
      setSent(true);
      setText("");
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 1500);
    } catch {
      // silently fail — non-critical
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 text-xs flex items-center justify-center transition-colors"
        title="This isn't right?"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          {sent ? (
            <p className="text-xs text-green-600 font-medium py-2 text-center">
              Thanks for the feedback!
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                What should this show instead?
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full border border-gray-200 rounded-md text-xs p-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300"
                rows={3}
                placeholder="Describe what you expected..."
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !text.trim()}
                  className="text-xs bg-gray-900 text-white px-3 py-1 rounded-md hover:bg-gray-800 disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
