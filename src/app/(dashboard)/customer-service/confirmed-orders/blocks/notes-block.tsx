"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

type CsNote = {
  id: number;
  author_name_snapshot: string;
  body: string;
  created_at: string;
};

type Props = {
  /** The immutable sales-agent note set at order-confirm time (orders.notes). */
  salesNote: string | null;
  /** Feed of CS team notes from cs_order_notes, in chronological order. */
  csNotes: CsNote[];
  orderId: string;
};

const TRUNCATE_AT = 120;

function NoteCard({
  header,
  timestamp,
  body,
  italic,
}: {
  header: string;
  timestamp: string | null;
  body: string;
  italic?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isTruncatable = body.length > TRUNCATE_AT;
  const displayBody = isTruncatable && !expanded ? body.slice(0, TRUNCATE_AT) : body;

  return (
    <div className="rounded border border-[var(--color-border-primary)] bg-[var(--color-surface-card)] py-2 px-3">
      {/* Header row: label + timestamp on one line */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">{header}</span>
        {timestamp && (
          <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">{timestamp}</span>
        )}
      </div>
      <p className={`text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap ${italic ? "italic" : ""}`}>
        {displayBody}
        {isTruncatable && !expanded && (
          <>
            {"… "}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-[var(--color-accent)] hover:opacity-80"
            >
              Show more
            </button>
          </>
        )}
      </p>
    </div>
  );
}

export function NotesBlock({ salesNote, csNotes, orderId }: Props) {
  const [feed, setFeed] = useState<CsNote[]>(csNotes);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const hasContent = !!salesNote || feed.length > 0;

  async function postNote() {
    const trimmed = draft.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    setPostError(null);

    // Optimistic append — assign a temporary negative id so we can spot it.
    const optimisticId = -(Date.now());
    const optimistic: CsNote = {
      id: optimisticId,
      author_name_snapshot: "You",
      body: trimmed,
      created_at: new Date().toISOString(),
    };
    setFeed((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const res = await fetch(`/api/customer-service/orders/${orderId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });

      if (res.ok) {
        const { note } = await res.json();
        // Replace optimistic entry with the real one returned from the server.
        setFeed((prev) =>
          prev.map((n) => (n.id === optimisticId ? (note as CsNote) : n)),
        );
      } else {
        // Roll back optimistic entry and show error.
        setFeed((prev) => prev.filter((n) => n.id !== optimisticId));
        const j = await res.json().catch(() => ({}));
        setPostError(j.error ?? "Failed to post note. Please try again.");
        setDraft(trimmed); // restore draft so user doesn't lose their text
      }
    } catch {
      setFeed((prev) => prev.filter((n) => n.id !== optimisticId));
      setPostError("Network error. Please try again.");
      setDraft(trimmed);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Empty state */}
      {!hasContent && (
        <p className="text-sm italic text-[var(--color-text-tertiary)]">
          No notes yet. Add the first one.
        </p>
      )}

      {/* All notes: sales note + CS feed — compact cards, gap-1.5 */}
      <div className="flex flex-col gap-1.5">
        {/* Sales-agent note (immutable) */}
        {salesNote && (
          <NoteCard
            header="Sales note"
            timestamp="From the sales agent at order time"
            body={salesNote}
            italic
          />
        )}

        {/* CS team notes feed */}
        {feed.map((note) => (
          <NoteCard
            key={note.id}
            header={note.author_name_snapshot}
            timestamp={formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
            body={note.body}
          />
        ))}
      </div>

      {/* Inline post form — unchanged */}
      <div className="space-y-2 pt-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter posts (Esc is handled at the drawer level)
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.stopPropagation(); // don't let it bubble to the drawer's confirm shortcut
              void postNote();
            }
          }}
          placeholder="Add a note for the team..."
          disabled={posting}
          rows={3}
          className="w-full resize-y rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50"
        />
        {postError && (
          <div className="rounded bg-[var(--color-error-light)] border border-[var(--color-error-light)] px-3 py-1.5 text-xs text-[var(--color-error)]">
            {postError}
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void postNote()}
            disabled={posting || !draft.trim()}
            className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {posting ? "Posting…" : "Post note"}
          </button>
        </div>
      </div>
    </div>
  );
}
