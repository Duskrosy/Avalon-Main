"use client";

import Link from "next/link";

type Card = {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
};

type Column = {
  id: string;
  name: string;
  sort_order: number;
  cards: Card[];
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-l-red-400",
  high:   "border-l-amber-400",
  medium: "border-l-blue-400",
  low:    "border-l-gray-300",
};

export function CeoPlanning({ columns }: { columns: Column[] }) {
  const sorted = [...columns].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">CEO Planning</p>
        <Link href="/productivity/kanban" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">Full board →</Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {sorted.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-48">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">{col.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] font-medium">{col.cards.length}</span>
            </div>
            <div className="space-y-1.5">
              {col.cards.slice(0, 5).map((card) => (
                <div key={card.id} className={`text-xs p-2 rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] border-l-[3px] ${PRIORITY_COLORS[card.priority ?? ""] ?? "border-l-transparent"}`}>
                  <p className="text-[var(--color-text-primary)] line-clamp-2">{card.title}</p>
                  {card.due_date && (
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">{card.due_date}</p>
                  )}
                </div>
              ))}
              {col.cards.length > 5 && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] text-center">+{col.cards.length - 5} more</p>
              )}
              {col.cards.length === 0 && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] text-center py-3">Empty</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
