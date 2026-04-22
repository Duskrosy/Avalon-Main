"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings, Plus, X } from "lucide-react";
import { PeoplePicker, type PickerUser } from "@/components/ui/people-picker";

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

type OwnerProfile = { id: string; first_name: string; last_name: string } | null;

type CeoPlanningProps = {
  columns: Column[];
  allUsers: PickerUser[];
  featuredUserId: string | null;
  featuredOwner: OwnerProfile;
  currentUserId: string;
  canManage: boolean;
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-l-red-400",
  high:   "border-l-amber-400",
  medium: "border-l-blue-400",
  low:    "border-l-gray-300",
};

export function CeoPlanning({
  columns,
  allUsers,
  featuredUserId,
  featuredOwner,
  currentUserId,
  canManage,
}: CeoPlanningProps) {
  const sorted = [...columns].sort((a, b) => a.sort_order - b.sort_order);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>(featuredUserId ? [featuredUserId] : []);
  const [saving, setSaving] = useState(false);

  const [addingColumnId, setAddingColumnId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const ownerLabel = featuredOwner
    ? featuredOwner.id === currentUserId
      ? "Your board"
      : `${featuredOwner.first_name} ${featuredOwner.last_name}'s board`
    : "No board configured";

  async function saveFeatured() {
    if (!selection[0]) return;
    setSaving(true);
    try {
      const res = await fetch("/api/executive/featured-board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selection[0] }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      setSettingsOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      alert("Failed to save: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function createCard(columnId: string) {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetch("/api/kanban/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_id: columnId, title, priority: "medium" }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      setNewTitle("");
      setAddingColumnId(null);
      startTransition(() => router.refresh());
    } catch (e) {
      alert("Failed to create card: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">CEO Planning</p>
          <span className="text-xs text-[var(--color-text-tertiary)] truncate">· {ownerLabel}</span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setSelection(featuredUserId ? [featuredUserId] : []);
              setSettingsOpen(true);
            }}
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Featured board settings"
            title="Choose whose board to show"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {sorted.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)] py-6">
            {featuredUserId ? "No columns on this board yet." : "No featured board — click the settings icon to choose one."}
          </p>
        )}
        {sorted.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-64">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">{col.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] font-medium">
                {col.cards.length}
              </span>
            </div>
            <div className="space-y-1.5 min-h-[140px]">
              {col.cards.map((card) => (
                <div
                  key={card.id}
                  className={`text-xs p-2 rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] border-l-[3px] ${PRIORITY_COLORS[card.priority ?? ""] ?? "border-l-transparent"}`}
                >
                  <p className="text-[var(--color-text-primary)] line-clamp-2">{card.title}</p>
                  {card.due_date && (
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">{card.due_date}</p>
                  )}
                </div>
              ))}
              {col.cards.length === 0 && addingColumnId !== col.id && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] text-center py-2">Empty</p>
              )}
              {addingColumnId === col.id ? (
                <div className="space-y-1.5">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createCard(col.id);
                      if (e.key === "Escape") { setAddingColumnId(null); setNewTitle(""); }
                    }}
                    placeholder="Card title…"
                    className="w-full text-xs px-2 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-border-focus)]"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={creating || !newTitle.trim()}
                      onClick={() => createCard(col.id)}
                      className="flex-1 text-xs px-2 py-1 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {creating ? "Adding…" : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingColumnId(null); setNewTitle(""); }}
                      className="text-xs px-2 py-1 rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingColumnId(col.id)}
                  className="w-full flex items-center gap-1 text-xs px-2 py-1.5 rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add card
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Featured Planning Board</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
              Choose whose personal kanban board appears on this page. Visible to everyone ops and above.
            </p>
            <PeoplePicker
              value={selection}
              onChange={setSelection}
              allUsers={allUsers}
              single
              placeholder="Search for a person…"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="text-xs px-3 py-1.5 rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveFeatured}
                disabled={saving || selection.length === 0 || selection[0] === featuredUserId}
                className="text-xs px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
