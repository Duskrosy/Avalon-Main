// src/app/(dashboard)/operations/inventory/item-timeline.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

type AuditEntry = {
  id: string;
  actor_id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

type Movement = {
  id: string;
  catalog_item_id: string;
  adjustment_type: string;
  quantity: number;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
};

type Actor = { id: string; first_name: string; last_name: string };

type TimelineEntry = {
  id: string;
  kind: "audit" | "movement";
  created_at: string;
  actor_id: string | null;
  summary: string;
  detail: string | null;
  badge: { label: string; color: string };
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  UPDATE: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  DELETE: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  received: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  dispatched: "bg-orange-100 text-orange-700",
  returned: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  damaged: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  correction: "bg-purple-100 text-purple-700",
  reserved: "bg-yellow-100 text-yellow-800",
  released: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
};

function actorName(actors: Actor[], id: string | null): string {
  if (!id) return "System";
  const a = actors.find((p) => p.id === id);
  return a ? `${a.first_name} ${a.last_name}` : "Unknown";
}

function auditSummary(entry: AuditEntry): { summary: string; detail: string | null } {
  if (entry.action === "INSERT") {
    return { summary: "Record created", detail: null };
  }
  if (entry.action === "DELETE") {
    return { summary: "Record deleted", detail: null };
  }
  if (entry.old_values && entry.new_values) {
    const changes: string[] = [];
    for (const key of Object.keys(entry.new_values)) {
      if (["updated_at", "created_at", "id"].includes(key)) continue;
      if (JSON.stringify(entry.old_values[key]) !== JSON.stringify(entry.new_values[key])) {
        const from = entry.old_values[key] ?? "null";
        const to = entry.new_values[key] ?? "null";
        changes.push(`${key}: ${from} → ${to}`);
      }
    }
    if (changes.length === 0) return { summary: "No visible changes", detail: null };
    return {
      summary: `Updated ${changes.length} field${changes.length > 1 ? "s" : ""}`,
      detail: changes.join("\n"),
    };
  }
  return { summary: entry.action, detail: null };
}

export function ItemTimeline({
  recordId,
  tableName,
  itemLabel,
  onClose,
}: {
  recordId: string;
  tableName: string;
  itemLabel: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/obs/item-timeline?table=${encodeURIComponent(tableName)}&id=${encodeURIComponent(recordId)}`
    );
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setActors(data.actors ?? []);

    const items: TimelineEntry[] = [];

    for (const a of (data.audit ?? []) as AuditEntry[]) {
      const { summary, detail } = auditSummary(a);
      items.push({
        id: a.id,
        kind: "audit",
        created_at: a.created_at,
        actor_id: a.actor_id,
        summary,
        detail,
        badge: { label: a.action, color: ACTION_COLORS[a.action] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]" },
      });
    }

    for (const m of (data.movements ?? []) as Movement[]) {
      const sign = ["received", "returned", "released"].includes(m.adjustment_type) ? "+" : "-";
      items.push({
        id: m.id,
        kind: "movement",
        created_at: m.created_at,
        actor_id: m.performed_by,
        summary: `${m.adjustment_type.charAt(0).toUpperCase() + m.adjustment_type.slice(1)} ${sign}${m.quantity}`,
        detail: m.notes,
        badge: {
          label: m.adjustment_type,
          color: ACTION_COLORS[m.adjustment_type] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
        },
      });
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEntries(items);
    setLoading(false);
  }, [recordId, tableName]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh] overflow-y-auto">
      <div
        className="w-full max-w-lg rounded-2xl bg-[var(--color-bg-primary)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Item History</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{itemLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] text-lg"
          >
            &times;
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-[var(--color-text-tertiary)]">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-sm text-[var(--color-text-tertiary)]">
            No history found for this item.
          </div>
        ) : (
          <div className="space-y-0 max-h-[60vh] overflow-y-auto">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 py-3 border-b border-[var(--color-border-secondary)] last:border-b-0"
              >
                <span className="text-xs text-[var(--color-text-tertiary)] w-20 shrink-0 pt-0.5">
                  {format(parseISO(entry.created_at), "d MMM HH:mm")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${entry.badge.color}`}>
                      {entry.badge.label}
                    </span>
                    <span className="text-sm text-[var(--color-text-primary)]">{entry.summary}</span>
                  </div>
                  {entry.detail && (
                    <pre className="text-xs text-[var(--color-text-tertiary)] mt-1 whitespace-pre-wrap font-mono">
                      {entry.detail}
                    </pre>
                  )}
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    {actorName(actors, entry.actor_id)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
