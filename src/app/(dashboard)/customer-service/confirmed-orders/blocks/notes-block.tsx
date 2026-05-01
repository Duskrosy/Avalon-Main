"use client";

type Props = {
  notes: string | null;
};

export function NotesBlock({ notes }: Props) {
  if (!notes) {
    return (
      <div className="text-sm text-[var(--color-text-tertiary)] italic">No sales notes.</div>
    );
  }

  return (
    <div className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap rounded border border-[var(--color-border-primary)] px-3 py-2 bg-[var(--color-bg-secondary)]">
      {notes}
    </div>
  );
}
