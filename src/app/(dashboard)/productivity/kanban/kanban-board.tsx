"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast, Toast } from "@/components/ui/toast";
import { KanbanCard } from "./kanban-card";

const PRIORITY_COLORS = {
  low: "border-l-gray-300",
  medium: "border-l-blue-400",
  high: "border-l-amber-400",
  urgent: "border-l-red-500",
};

const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  textarea: "Long Text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  multi_select: "Multi-Select",
  checkbox: "Checkbox",
  person: "Person",
  url: "URL",
  email: "Email",
};

type FieldType = "text" | "textarea" | "number" | "date" | "dropdown" | "multi_select" | "checkbox" | "person" | "url" | "email";

type FieldOption = { id: string; label: string; color: string };

type FieldDefinition = {
  id: string;
  board_id: string;
  name: string;
  field_type: FieldType;
  description: string | null;
  is_required: boolean;
  options: FieldOption[] | null;
  default_value: unknown;
  sort_order: number;
};

type FieldValue = {
  id: string;
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_boolean: boolean | null;
  value_json: unknown;
};

type Member = { id: string; first_name: string; last_name: string; avatar_url?: string | null };

type Assignee = {
  id: string;
  user_id: string;
  profile: Member | null;
};

type Card = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  sort_order: number;
  color: string | null;
  assignees?: Assignee[];
  created_by_profile: { first_name: string; last_name: string } | null;
  field_values?: FieldValue[];
};

type Column = {
  id: string;
  name: string;
  sort_order: number;
  color: string | null;
  is_default: boolean;
  kanban_cards: Card[];
};

type BoardScope = "global" | "team" | "personal";

type Board = {
  id: string;
  name: string;
  scope: BoardScope;
  owner_id: string | null;
} | null;

type Props = {
  board: Board;
  initialColumns: Column[];
  members: Member[];
  allUsers: Member[];
  departmentId: string | null;
  canManage: boolean;
  canManageGlobal: boolean;
  currentUserId: string;
  initialFieldDefinitions: FieldDefinition[];
  compact?: boolean;
};

const COLUMN_COLORS = [
  "#6b7280", // gray
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

const CARD_COLORS = [
  null, // no color
  "#fecaca", // red (stronger)
  "#fed7aa", // orange (stronger)
  "#fef08a", // yellow (stronger)
  "#bbf7d0", // green (stronger)
  "#99f6e4", // teal (stronger)
  "#bfdbfe", // blue (stronger)
  "#ddd6fe", // violet (stronger)
  "#fbcfe8", // pink (stronger)
];

// ─── ASSIGNEE AVATAR ──────────────────────────────────────────────────────────
function AssigneeAvatar({ name, avatarUrl, size = "sm" }: { name: string; avatarUrl?: string | null; size?: "sm" | "md" }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const sizeClass = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-[var(--color-border-primary)] flex items-center justify-center font-medium text-[var(--color-text-secondary)] shrink-0`}>
      {initials}
    </div>
  );
}

// ─── ASSIGNEE CHIPS DISPLAY ───────────────────────────────────────────────────
function AssigneeChips({
  assignees,
  maxShow = 2,
  onClick,
}: {
  assignees: Assignee[];
  maxShow?: number;
  onClick?: () => void;
}) {
  if (assignees.length === 0) {
    return <span className="text-xs text-[var(--color-text-tertiary)]">Unassigned</span>;
  }

  const shown = assignees.slice(0, maxShow);
  const extra = assignees.length - maxShow;
  const firstName = shown[0]?.profile?.first_name ?? "?";

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
    >
      <div className="flex -space-x-1.5">
        {shown.map((a) => (
          <AssigneeAvatar
            key={a.id}
            name={a.profile ? `${a.profile.first_name} ${a.profile.last_name}` : "?"}
            avatarUrl={a.profile?.avatar_url}
          />
        ))}
      </div>
      <span className="text-xs text-[var(--color-text-secondary)] ml-1">
        {firstName}{extra > 0 && ` +${extra}`}
      </span>
    </button>
  );
}

// ─── MULTI-SELECT ASSIGNEE PICKER ─────────────────────────────────────────────
function AssigneePicker({
  allUsers,
  selected,
  onChange,
}: {
  allUsers: Member[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = allUsers.filter((u) => {
    const name = `${u.first_name} ${u.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {selected.length === 0 ? (
          <span className="text-sm text-[var(--color-text-tertiary)]">Select assignees...</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selected.map((id) => {
              const user = allUsers.find((u) => u.id === id);
              if (!user) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] px-2 py-1 rounded-full"
                >
                  <AssigneeAvatar name={`${user.first_name} ${user.last_name}`} avatarUrl={user.avatar_url} size="sm" />
                  {user.first_name} {user.last_name}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] ml-0.5"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg shadow-[var(--shadow-lg)] max-h-60 overflow-hidden">
          <div className="p-2 border-b border-[var(--color-border-secondary)]">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm px-2 py-1 border border-[var(--color-border-primary)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              autoFocus
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)] p-3 text-center">No users found</p>
            ) : (
              filtered.map((user) => (
                <button
                  key={user.id}
                  onClick={() => toggle(user.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-hover)] ${
                    selected.includes(user.id) ? "bg-[var(--color-bg-secondary)]" : ""
                  }`}
                >
                  <AssigneeAvatar name={`${user.first_name} ${user.last_name}`} avatarUrl={user.avatar_url} />
                  <span className="flex-1">{user.first_name} {user.last_name}</span>
                  {selected.includes(user.id) && (
                    <span className="text-green-500">✓</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COLOR PICKER ─────────────────────────────────────────────────────────────
function ColorPicker({
  colors,
  selected,
  onChange,
  label,
}: {
  colors: (string | null)[];
  selected: string | null;
  onChange: (color: string | null) => void;
  label: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-text-secondary)] mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color, i) => (
          <button
            key={i}
            onClick={() => onChange(color)}
            className={`w-7 h-7 rounded-md border-2 transition-all flex items-center justify-center ${
              selected === color
                ? "border-[var(--color-text-primary)] ring-2 ring-gray-400 ring-offset-1"
                : "border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)] hover:scale-105"
            }`}
            style={{ backgroundColor: color ?? "#ffffff" }}
            title={color ?? "None"}
          >
            {selected === color && color !== null && (
              <span className="text-[var(--color-text-primary)] text-sm font-bold">✓</span>
            )}
            {color === null && (
              <span className={`text-sm ${selected === color ? "text-[var(--color-text-primary)] font-bold" : "text-[var(--color-text-tertiary)]"}`}>
                {selected === color ? "✓" : "∅"}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
  allUsers,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  onChange: (val: Partial<FieldValue>) => void;
  allUsers: Member[];
}) {
  const baseClass = "w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]";

  switch (field.field_type) {
    case "text":
      return (
        <input
          type="text"
          value={value?.value_text ?? ""}
          onChange={(e) => onChange({ value_text: e.target.value })}
          className={baseClass}
          placeholder={field.description || field.name}
        />
      );
    case "textarea":
      return (
        <textarea
          rows={2}
          value={value?.value_text ?? ""}
          onChange={(e) => onChange({ value_text: e.target.value })}
          className={`${baseClass} resize-none`}
          placeholder={field.description || field.name}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={value?.value_number ?? ""}
          onChange={(e) => onChange({ value_number: e.target.value ? Number(e.target.value) : null })}
          className={baseClass}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={value?.value_date ?? ""}
          onChange={(e) => onChange({ value_date: e.target.value || null })}
          className={baseClass}
        />
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value?.value_boolean ?? false}
            onChange={(e) => onChange({ value_boolean: e.target.checked })}
            className="w-4 h-4 rounded border-[var(--color-border-primary)]"
          />
          <span className="text-sm text-[var(--color-text-secondary)]">{field.description || "Yes"}</span>
        </label>
      );
    case "dropdown":
      return (
        <select
          value={(value?.value_json as { option_id?: string })?.option_id ?? ""}
          onChange={(e) => onChange({ value_json: e.target.value ? { option_id: e.target.value } : null })}
          className={baseClass}
        >
          <option value="">Select...</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      );
    case "multi_select": {
      const selected = (value?.value_json as { option_ids?: string[] })?.option_ids ?? [];
      return (
        <div className="flex flex-wrap gap-1">
          {(field.options ?? []).map((opt) => {
            const isSelected = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  const newIds = isSelected
                    ? selected.filter((id) => id !== opt.id)
                    : [...selected, opt.id];
                  onChange({ value_json: newIds.length ? { option_ids: newIds } : null });
                }}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  isSelected
                    ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] border-[var(--color-text-primary)]"
                    : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "person": {
      const selectedIds = (value?.value_json as { user_ids?: string[] })?.user_ids ?? [];
      return (
        <select
          value={selectedIds[0] ?? ""}
          onChange={(e) => onChange({ value_json: e.target.value ? { user_ids: [e.target.value] } : null })}
          className={baseClass}
        >
          <option value="">Select person...</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
          ))}
        </select>
      );
    }
    case "url":
      return (
        <input
          type="url"
          value={value?.value_text ?? ""}
          onChange={(e) => onChange({ value_text: e.target.value })}
          className={baseClass}
          placeholder="https://..."
        />
      );
    case "email":
      return (
        <input
          type="email"
          value={value?.value_text ?? ""}
          onChange={(e) => onChange({ value_text: e.target.value })}
          className={baseClass}
          placeholder="email@example.com"
        />
      );
    default:
      return null;
  }
}

function CardModal({
  card,
  allUsers,
  fieldDefinitions,
  onSave,
  onClose,
  onDelete,
}: {
  card: Partial<Card> & { column_id?: string };
  allUsers: Member[];
  fieldDefinitions: FieldDefinition[];
  onSave: (data: Record<string, unknown>, fieldValues: Record<string, Partial<FieldValue>>, assigneeIds: string[]) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState({
    title: card.title ?? "",
    description: card.description ?? "",
    start_date: card.start_date ?? "",
    due_date: card.due_date ?? "",
    priority: card.priority ?? "medium",
    color: card.color ?? null,
  });

  // Multi-assignee
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    () => (card.assignees ?? []).map((a) => a.user_id)
  );

  // Initialize field values from card
  const [fieldValues, setFieldValues] = useState<Record<string, Partial<FieldValue>>>(() => {
    const vals: Record<string, Partial<FieldValue>> = {};
    for (const fv of card.field_values ?? []) {
      vals[fv.field_definition_id] = fv;
    }
    return vals;
  });

  const updateFieldValue = (fieldId: string, update: Partial<FieldValue>) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], field_definition_id: fieldId, ...update },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
          {card.id ? "Edit Card" : "New Card"}
        </h2>
        <div className="space-y-3">
          <input
            autoFocus
            type="text"
            placeholder="Card title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          <textarea
            rows={3}
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Card["priority"] }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Start date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Due date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Assignees</label>
            <AssigneePicker
              allUsers={allUsers}
              selected={assigneeIds}
              onChange={setAssigneeIds}
            />
          </div>
          <ColorPicker
            colors={CARD_COLORS}
            selected={form.color}
            onChange={(c) => setForm((f) => ({ ...f, color: c }))}
            label="Card color"
          />

          {/* Custom Fields */}
          {fieldDefinitions.length > 0 && (
            <div className="pt-3 border-t border-[var(--color-border-secondary)] space-y-3">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">Custom Fields</p>
              {fieldDefinitions.map((field) => (
                <div key={field.id}>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                    {field.name}
                    {field.is_required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <CustomFieldInput
                    field={field}
                    value={fieldValues[field.id] as FieldValue | undefined}
                    onChange={(val) => updateFieldValue(field.id, val)}
                    allUsers={allUsers}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          {onDelete && (
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-[var(--color-error)] mr-auto">
              Delete
            </button>
          )}
          <button onClick={onClose} className="text-sm px-4 py-2 border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-surface-hover)]">
            Cancel
          </button>
          <button
            onClick={() => onSave({
              ...form,
              description: form.description || null,
              start_date: form.start_date || null,
              due_date: form.due_date || null,
              color: form.color,
            }, fieldValues, assigneeIds)}
            disabled={!form.title.trim()}
            className="text-sm px-4 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

type SortField = "title" | "priority" | "due_date" | "assigned_to" | "status";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export function KanbanBoard({ board, initialColumns, members, allUsers, departmentId, canManage, canManageGlobal, currentUserId, initialFieldDefinitions, compact = false }: Props) {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [boardState, setBoardState] = useState<Board>(board);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>(initialFieldDefinitions);
  const [modal, setModal] = useState<(Partial<Card> & { column_id?: string }) | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [showSettings, setShowSettings] = useState(false);
  const [listSort, setListSort] = useState<{ field: SortField; dir: SortDir }>({ field: "due_date", dir: "asc" });
  const [listFilter, setListFilter] = useState<{ priority: string; assigned: string; status: string }>({
    priority: "", assigned: "", status: "",
  });
  const dragCard = useRef<{ cardId: string; sourceColId: string } | null>(null);

  // Debounced board refetch for realtime updates
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchBoard = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      if (!boardState?.id) return;
      fetch(`/api/kanban?board_id=${boardState.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.columns) setColumns(data.columns);
          if (data.fieldDefinitions) setFieldDefinitions(data.fieldDefinitions);
        });
    }, 500);
  }, [boardState?.id]);

  // Real-time subscription for live updates
  useEffect(() => {
    if (!boardState?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`board-${boardState.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_cards" },
        () => refetchBoard()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_card_field_values" },
        () => refetchBoard()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_columns" },
        () => refetchBoard()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardState?.id, refetchBoard]);

  // Flat list of all cards with their column name (status)
  const allCards = useMemo(() => {
    return columns.flatMap((col) =>
      col.kanban_cards.map((card) => ({ ...card, columnId: col.id, columnName: col.name }))
    );
  }, [columns]);

  const filteredSortedCards = useMemo(() => {
    let cards = allCards;
    if (listFilter.priority) cards = cards.filter((c) => c.priority === listFilter.priority);
    if (listFilter.assigned) cards = cards.filter((c) => c.assignees?.some((a) => a.profile?.id === listFilter.assigned));
    if (listFilter.status) cards = cards.filter((c) => c.columnId === listFilter.status);

    return [...cards].sort((a, b) => {
      let cmp = 0;
      switch (listSort.field) {
        case "title":    cmp = a.title.localeCompare(b.title); break;
        case "priority": cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]; break;
        case "due_date": {
          const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          cmp = da - db; break;
        }
        case "assigned_to": {
          const firstA = a.assignees?.[0]?.profile;
          const firstB = b.assignees?.[0]?.profile;
          const na = firstA ? `${firstA.first_name} ${firstA.last_name}` : "zzz";
          const nb = firstB ? `${firstB.first_name} ${firstB.last_name}` : "zzz";
          cmp = na.localeCompare(nb); break;
        }
        case "status": cmp = a.columnName.localeCompare(b.columnName); break;
      }
      return listSort.dir === "asc" ? cmp : -cmp;
    });
  }, [allCards, listFilter, listSort]);

  const toggleSort = (field: SortField) => {
    setListSort((s) => s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" });
  };

  // Auto-create board if not exists
  const ensureBoard = useCallback(async () => {
    if (boardState) return boardState;
    // boardState is null here, fall back to department_id for team board auto-create
    const res = await fetch(`/api/kanban?department_id=${departmentId}`);
    const data = await res.json();
    if (data.board) {
      setBoardState(data.board);
      setColumns(data.columns);
      return data.board;
    }
    return null;
  }, [boardState, departmentId]);

  const handleDragStart = (cardId: string, sourceColId: string) => {
    dragCard.current = { cardId, sourceColId };
  };

  const handleDrop = useCallback(async (targetColId: string) => {
    if (!dragCard.current) return;
    const { cardId, sourceColId } = dragCard.current;
    dragCard.current = null;
    if (sourceColId === targetColId) return;

    // Optimistic update
    setColumns((cols) => {
      const next = cols.map((col) => ({ ...col, kanban_cards: [...col.kanban_cards] }));
      const srcCol = next.find((c) => c.id === sourceColId);
      const dstCol = next.find((c) => c.id === targetColId);
      if (!srcCol || !dstCol) return cols;
      const cardIdx = srcCol.kanban_cards.findIndex((c) => c.id === cardId);
      if (cardIdx === -1) return cols;
      const [card] = srcCol.kanban_cards.splice(cardIdx, 1);
      dstCol.kanban_cards.unshift(card);
      return next;
    });

    await fetch("/api/kanban/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cardId, column_id: targetColId, sort_order: 0 }),
    });

    // Sync linked request status when card moves columns
    try {
      const supabase = createClient();
      const { data: req } = await supabase
        .from("ad_requests")
        .select("id, status")
        .eq("linked_card_id", cardId)
        .maybeSingle();

      if (req) {
        // Determine status based on column position
        // Use current columns state at the time of drop
        setColumns((cols) => {
          const colIndex = cols.findIndex((c) => c.id === targetColId);
          const lastIdx = cols.length - 1;
          let newStatus = "in_progress";
          if (colIndex === lastIdx) newStatus = "approved";
          else if (colIndex === lastIdx - 1) newStatus = "review";

          if (newStatus !== req.status) {
            fetch(`/api/ad-ops/requests?id=${req.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: newStatus }),
            }).catch(() => {});
          }
          return cols;
        });
      }
    } catch {
      // Status sync is best-effort
    }
  }, []);

  const handleSaveCard = useCallback(async (data: Record<string, unknown>, fieldValues: Record<string, Partial<FieldValue>>, assigneeIds: string[]) => {
    const b = await ensureBoard();
    if (!b && !boardState) return;

    if (modal?.id) {
      // Update card
      await fetch("/api/kanban/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modal.id, ...data }),
      });

      // Save field values
      const values = Object.values(fieldValues).filter((v) => v.field_definition_id);
      if (values.length > 0) {
        await fetch(`/api/kanban/cards/${modal.id}/values`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        });
      }

      // Save assignees
      await fetch(`/api/kanban/cards/${modal.id}/assignees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: assigneeIds }),
      });

      // Build assignees for optimistic update
      const newAssignees: Assignee[] = assigneeIds.map((uid) => {
        const user = allUsers.find((u) => u.id === uid);
        return { id: uid, user_id: uid, profile: user ?? null };
      });

      setColumns((cols) =>
        cols.map((col) => ({
          ...col,
          kanban_cards: col.kanban_cards.map((c) =>
            c.id === modal.id
              ? {
                  ...c,
                  ...data,
                  assignees: newAssignees,
                  field_values: Object.values(fieldValues) as FieldValue[],
                }
              : c
          ),
        }))
      );
    } else {
      // Create card
      const res = await fetch("/api/kanban/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_id: modal?.column_id, ...data }),
      });
      if (res.ok) {
        const { id } = await res.json();

        // Save field values for new card
        const values = Object.values(fieldValues).filter((v) => v.field_definition_id);
        if (values.length > 0) {
          await fetch(`/api/kanban/cards/${id}/values`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values }),
          });
        }

        // Save assignees for new card
        if (assigneeIds.length > 0) {
          await fetch(`/api/kanban/cards/${id}/assignees`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_ids: assigneeIds }),
          });
        }

        // Build assignees for optimistic update
        const newAssignees: Assignee[] = assigneeIds.map((uid) => {
          const user = allUsers.find((u) => u.id === uid);
          return { id: uid, user_id: uid, profile: user ?? null };
        });

        const newCard: Card = {
          id,
          title: data.title as string,
          description: (data.description as string) || null,
          priority: (data.priority as Card["priority"]) ?? "medium",
          start_date: (data.start_date as string) || null,
          due_date: (data.due_date as string) || null,
          completed_at: null,
          color: (data.color as string) || null,
          sort_order: 0,
          assignees: newAssignees,
          created_by_profile: null,
          field_values: Object.values(fieldValues) as FieldValue[],
        };
        setColumns((cols) =>
          cols.map((col) =>
            col.id === modal?.column_id
              ? { ...col, kanban_cards: [newCard, ...col.kanban_cards] }
              : col
          )
        );
      }
    }
    setModal(null);
  }, [modal, allUsers, ensureBoard, boardState]);

  const handleDeleteCard = useCallback(async () => {
    if (!modal?.id) return;
    await fetch(`/api/kanban/cards?id=${modal.id}`, { method: "DELETE" });
    setColumns((cols) =>
      cols.map((col) => ({
        ...col,
        kanban_cards: col.kanban_cards.filter((c) => c.id !== modal.id),
      }))
    );
    setModal(null);
  }, [modal]);

  const handleAddColumn = useCallback(async () => {
    if (!newColName.trim()) return;
    const b = await ensureBoard();
    if (!b) return;

    const res = await fetch("/api/kanban/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board_id: b.id, name: newColName.trim(), sort_order: columns.length }),
    });
    if (res.ok) {
      // Refetch the full board to get the authoritative state (avoids race with realtime)
      const boardRes = await fetch(`/api/kanban?board_id=${b.id}`);
      const data = await boardRes.json();
      if (data.columns) setColumns(data.columns);
    }
    setNewColName("");
    setAddingColumn(false);
  }, [newColName, columns.length, ensureBoard]);

  const handleDeleteColumn = useCallback(async (colId: string, colName: string) => {
    if (!confirm(`Delete column "${colName}" and all its cards?`)) return;
    await fetch(`/api/kanban/columns?id=${colId}`, { method: "DELETE" });
    // Refetch authoritative state
    if (boardState?.id) {
      const boardRes = await fetch(`/api/kanban?board_id=${boardState.id}`);
      const data = await boardRes.json();
      if (data.columns) setColumns(data.columns);
      else setColumns((cols) => cols.filter((c) => c.id !== colId));
    } else {
      setColumns((cols) => cols.filter((c) => c.id !== colId));
    }
  }, [boardState?.id]);

  const isOverdue = (due: string | null) => due && new Date(due) < new Date();

  const SortIcon = ({ field }: { field: SortField }) => {
    if (listSort.field !== field) return <span className="text-[var(--color-text-tertiary)] ml-1">↕</span>;
    return <span className="text-[var(--color-text-primary)] ml-1">{listSort.dir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="h-full flex flex-col">
      <div className={`${compact ? "mb-2" : "mb-6"} flex items-center justify-between gap-4 shrink-0`}>
        <div>
          {!compact && <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Kanban</h1>}
          <p className="text-xs text-[var(--color-text-secondary)]">{allCards.length} card{allCards.length !== 1 ? "s" : ""} &middot; {columns.length} column{columns.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Settings button (managers only) */}
          {canManage && (
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs px-3 py-1.5 border border-[var(--color-border-primary)] rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-primary)]"
            >
              Settings
            </button>
          )}
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-0.5">
            <button
              onClick={() => setView("board")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                view === "board" ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
              view === "list" ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            List
          </button>
          </div>
        </div>
      </div>

      {/* ── LIST VIEW ───────────────────────────────────────────── */}
      {view === "list" && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center shrink-0">
            <select
              value={listFilter.status}
              onChange={(e) => setListFilter((f) => ({ ...f, status: e.target.value }))}
              className="text-sm border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="">All columns</option>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={listFilter.priority}
              onChange={(e) => setListFilter((f) => ({ ...f, priority: e.target.value }))}
              className="text-sm border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="">All priorities</option>
              {Object.keys(PRIORITY_LABELS).map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p as Card["priority"]]}</option>
              ))}
            </select>

            {/* Assignee filter — scope-aware */}
            {boardState?.scope !== "personal" && (
              <ListAssigneeFilter
                users={boardState?.scope === "team" ? members : allUsers}
                selected={listFilter.assigned}
                onChange={(id) => setListFilter((f) => ({ ...f, assigned: id }))}
                scope={boardState?.scope ?? "team"}
              />
            )}

            {(listFilter.status || listFilter.priority || listFilter.assigned) && (
              <button
                onClick={() => setListFilter({ priority: "", assigned: "", status: "" })}
                className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">{filteredSortedCards.length} card{filteredSortedCards.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                  <th
                    className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3 cursor-pointer hover:text-[var(--color-text-primary)] select-none"
                    onClick={() => toggleSort("title")}
                  >
                    Title <SortIcon field="title" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3 cursor-pointer hover:text-[var(--color-text-primary)] select-none w-28"
                    onClick={() => toggleSort("status")}
                  >
                    Status <SortIcon field="status" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3 cursor-pointer hover:text-[var(--color-text-primary)] select-none w-24"
                    onClick={() => toggleSort("priority")}
                  >
                    Priority <SortIcon field="priority" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3 cursor-pointer hover:text-[var(--color-text-primary)] select-none w-36"
                    onClick={() => toggleSort("assigned_to")}
                  >
                    Assigned to <SortIcon field="assigned_to" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3 cursor-pointer hover:text-[var(--color-text-primary)] select-none w-28"
                    onClick={() => toggleSort("due_date")}
                  >
                    Due <SortIcon field="due_date" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-secondary)]">
                {filteredSortedCards.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-sm text-[var(--color-text-tertiary)]">
                      No cards found
                    </td>
                  </tr>
                ) : (
                  filteredSortedCards.map((card) => (
                    <tr
                      key={card.id}
                      onClick={() => setModal({ ...card, column_id: card.columnId })}
                      className="hover:bg-[var(--color-surface-hover)] cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                            card.priority === "urgent" ? "bg-[var(--color-error)]" :
                            card.priority === "high"   ? "bg-amber-400" :
                            card.priority === "medium" ? "bg-blue-400" : "bg-[var(--color-border-primary)]"
                          }`} />
                          <div>
                            <p className="font-medium text-[var(--color-text-primary)]">{card.title}</p>
                            {card.description && (
                              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 line-clamp-1">{card.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]">
                          {card.columnName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${
                          card.priority === "urgent" ? "text-[var(--color-error)]" :
                          card.priority === "high"   ? "text-[var(--color-warning)]" :
                          card.priority === "medium" ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
                        }`}>
                          {PRIORITY_LABELS[card.priority]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {card.assignees && card.assignees.length > 0
                          ? <AssigneeChips assignees={card.assignees} />
                          : <span className="text-[var(--color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {card.due_date ? (
                          <span className={`text-xs ${isOverdue(card.due_date) ? "text-[var(--color-error)] font-medium" : "text-[var(--color-text-secondary)]"}`}>
                            {format(new Date(card.due_date), "d MMM yyyy")}
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-tertiary)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BOARD VIEW ──────────────────────────────────────────── */}
      {view === "board" && <div className="flex gap-3 overflow-x-auto pb-4 flex-1 items-start min-h-[400px]">
        {columns.map((col) => (
          <div
            key={col.id}
            className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-3 w-[280px] flex-shrink-0 flex flex-col gap-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.id)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {col.name}
                </h3>
                {col.is_default && (
                  <Lock className="w-3 h-3 text-zinc-400" />
                )}
                <span className="text-xs font-normal text-[var(--color-text-tertiary)]">
                  {col.kanban_cards.length}
                </span>
              </div>
              {canManage && !col.is_default && (
                <button
                  onClick={() => handleDeleteColumn(col.id, col.name)}
                  className="text-[var(--color-text-tertiary)] hover:text-red-400 text-xs"
                >
                  ×
                </button>
              )}
            </div>

            {/* Cards */}
            {col.kanban_cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                onDragStart={() => handleDragStart(card.id, col.id)}
                onClick={() => setModal({ ...card, column_id: col.id })}
              />
            ))}

            {/* Add card */}
            <button
              onClick={() => setModal({ column_id: col.id })}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-active)] rounded-lg py-1.5 px-2 text-left transition-colors"
            >
              + Add card
            </button>
          </div>
        ))}

        {/* Add column */}
        {canManage && (
          <div className="w-72 shrink-0">
            {addingColumn ? (
              <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-3 flex gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Column name"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddColumn();
                    if (e.key === "Escape") setAddingColumn(false);
                  }}
                  className="flex-1 border border-[var(--color-border-primary)] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <button
                  onClick={handleAddColumn}
                  className="text-sm px-3 py-1.5 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-lg hover:bg-[var(--color-text-secondary)]"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="w-full text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-active)] rounded-[var(--radius-lg)] py-3 px-4 text-left transition-colors border-2 border-dashed border-[var(--color-border-primary)]"
              >
                + Add column
              </button>
            )}
          </div>
        )}
      </div>}

      {/* Card modal */}
      {modal && (
        <CardModal
          card={modal}
          allUsers={allUsers}
          fieldDefinitions={fieldDefinitions}
          onSave={handleSaveCard}
          onClose={() => setModal(null)}
          onDelete={modal.id ? handleDeleteCard : undefined}
        />
      )}

      {/* Settings panel */}
      {showSettings && boardState && (
        <SettingsPanel
          boardId={boardState.id}
          fieldDefinitions={fieldDefinitions}
          onUpdate={(fields) => setFieldDefinitions(fields)}
          onClose={() => setShowSettings(false)}
          canManage={canManage}
          departmentId={departmentId}
          columns={columns}
        />
      )}
    </div>
  );
}

// ─── SETTINGS PANEL (WRAPPER WITH TABS) ──────────────────────────────────────
function SettingsPanel({
  boardId,
  fieldDefinitions,
  onUpdate,
  onClose,
  canManage,
  departmentId,
  columns,
}: {
  boardId: string;
  fieldDefinitions: FieldDefinition[];
  onUpdate: (fields: FieldDefinition[]) => void;
  onClose: () => void;
  canManage: boolean;
  departmentId: string | null;
  columns: Column[];
}) {
  const [tab, setTab] = useState<"fields" | "overview">("fields");

  // Compute stats from columns data
  const allCards = columns.flatMap((c) => c.kanban_cards);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const completedCards = allCards.filter((c) => c.completed_at);
  const overdueCards = allCards.filter((c) => !c.completed_at && c.due_date && new Date(c.due_date) < now);
  const completedThisWeek = completedCards.filter((c) => new Date(c.completed_at!) >= weekAgo);
  const dueSoonCards = allCards.filter((c) => {
    if (c.completed_at || !c.due_date) return false;
    const d = new Date(c.due_date);
    return d >= now && d <= new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  });

  // Workload by assignee
  const workloadMap = new Map<string, { name: string; open: number; overdue: number }>();
  for (const card of allCards) {
    if (card.completed_at) continue;
    const isOverdue = card.due_date && new Date(card.due_date) < now;
    for (const a of card.assignees ?? []) {
      if (!a.profile) continue;
      const key = a.profile.id;
      const name = `${a.profile.first_name} ${a.profile.last_name}`;
      const existing = workloadMap.get(key) ?? { name, open: 0, overdue: 0 };
      existing.open++;
      if (isOverdue) existing.overdue++;
      workloadMap.set(key, existing);
    }
  }
  const workload = Array.from(workloadMap.values()).sort((a, b) => b.overdue - a.overdue);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] w-96 h-full shadow-xl overflow-y-auto z-50">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Settings</h2>
            <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] text-xl">&times;</button>
          </div>

          {/* Tabs */}
          {canManage && (
            <div className="flex gap-1 mb-6 bg-[var(--color-bg-tertiary)] rounded-lg p-0.5">
              <button
                onClick={() => setTab("fields")}
                className={`flex-1 text-xs py-2 rounded-md transition-colors ${
                  tab === "fields" ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                Custom Fields
              </button>
              <button
                onClick={() => setTab("overview")}
                className={`flex-1 text-xs py-2 rounded-md transition-colors ${
                  tab === "overview" ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                Team Overview
              </button>
            </div>
          )}

          {tab === "fields" ? (
            <FieldSettingsContent
              boardId={boardId}
              fieldDefinitions={fieldDefinitions}
              onUpdate={onUpdate}
            />
          ) : (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3">
                  <p className="text-2xl font-bold text-[var(--color-text-primary)]">{allCards.length}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">Total tasks</p>
                </div>
                <div className="bg-[var(--color-success-light)] rounded-lg p-3">
                  <p className="text-2xl font-bold text-[var(--color-success)]">{completedThisWeek.length}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">Done this week</p>
                </div>
                <div className="bg-[var(--color-error-light)] rounded-lg p-3">
                  <p className="text-2xl font-bold text-[var(--color-error)]">{overdueCards.length}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">Overdue</p>
                </div>
                <div className="bg-[var(--color-warning-light)] rounded-lg p-3">
                  <p className="text-2xl font-bold text-[var(--color-warning)]">{dueSoonCards.length}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">Due soon</p>
                </div>
              </div>

              {/* Workload */}
              {workload.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">Workload</h3>
                  <div className="space-y-2">
                    {workload.map((w) => (
                      <div key={w.name} className="flex items-center justify-between p-2 bg-[var(--color-bg-secondary)] rounded-lg">
                        <span className="text-sm text-[var(--color-text-primary)]">{w.name}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[var(--color-text-secondary)]">{w.open} open</span>
                          {w.overdue > 0 && (
                            <span className="text-[var(--color-error)] font-medium">{w.overdue} overdue</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overdue cards */}
              {overdueCards.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">Overdue Tasks</h3>
                  <div className="space-y-2">
                    {overdueCards.slice(0, 10).map((card) => (
                      <div key={card.id} className="p-2 bg-[var(--color-error-light)] rounded-lg border border-red-100">
                        <p className="text-sm text-[var(--color-text-primary)] font-medium">{card.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[var(--color-error)]">
                            Due {format(new Date(card.due_date!), "d MMM")}
                          </span>
                          {card.assignees && card.assignees.length > 0 && (
                            <span className="text-xs text-[var(--color-text-secondary)]">
                              {card.assignees.map((a) => a.profile?.first_name).filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {overdueCards.length === 0 && workload.length === 0 && (
                <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">No tasks to show yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FIELD SETTINGS CONTENT ──────────────────────────────────────────────────
function FieldSettingsContent({
  boardId,
  fieldDefinitions,
  onUpdate,
}: {
  boardId: string;
  fieldDefinitions: FieldDefinition[];
  onUpdate: (fields: FieldDefinition[]) => void;
}) {
  // NOTE: the old onClose prop was removed — SettingsPanel handles close now
  const [fields, setFields] = useState<FieldDefinition[]>(fieldDefinitions);
  const { toast, setToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [newField, setNewField] = useState({
    name: "",
    field_type: "text" as FieldType,
    description: "",
    is_required: false,
    options: [] as FieldOption[],
  });
  const [saving, setSaving] = useState(false);

  const handleAddField = async () => {
    if (!newField.name.trim()) return;
    setSaving(true);

    const body: Record<string, unknown> = {
      board_id: boardId,
      name: newField.name.trim(),
      field_type: newField.field_type,
      description: newField.description || null,
      is_required: newField.is_required,
    };

    if (["dropdown", "multi_select"].includes(newField.field_type) && newField.options.length > 0) {
      body.options = newField.options;
    }

    const res = await fetch("/api/kanban/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const created = await res.json();
      const updated = [...fields, created];
      setFields(updated);
      onUpdate(updated);
      setNewField({ name: "", field_type: "text", description: "", is_required: false, options: [] });
      setAdding(false);
    }
    setSaving(false);
  };

  const handleDeleteField = async (id: string) => {
    if (!confirm("Delete this field? All card values for this field will be lost.")) return;

    const res = await fetch(`/api/kanban/fields/${id}`, { method: "DELETE" });
    if (res.ok) {
      const updated = fields.filter((f) => f.id !== id);
      setFields(updated);
      onUpdate(updated);
    } else {
      const err = await res.json();
      setToast({ message: err.error || "Failed to delete field", type: "error" });
    }
  };

  const addOption = () => {
    setNewField((f) => ({
      ...f,
      options: [...f.options, { id: crypto.randomUUID(), label: "", color: "#6b7280" }],
    }));
  };

  const updateOption = (idx: number, label: string) => {
    setNewField((f) => ({
      ...f,
      options: f.options.map((o, i) => (i === idx ? { ...o, label } : o)),
    }));
  };

  const removeOption = (idx: number) => {
    setNewField((f) => ({
      ...f,
      options: f.options.filter((_, i) => i !== idx),
    }));
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">Custom Fields</h3>
      <p className="text-xs text-[var(--color-text-secondary)] mb-4">
        Add fields to track extra data on cards.
      </p>

            {/* Existing fields */}
            <div className="space-y-2 mb-4">
              {fields.length === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)] py-4 text-center">No custom fields yet</p>
              ) : (
                fields.map((field) => (
                  <div key={field.id} className="flex items-center justify-between p-3 bg-[var(--color-bg-secondary)] rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {field.name}
                        {field.is_required && <span className="text-red-400 ml-1">*</span>}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{FIELD_TYPE_LABELS[field.field_type]}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteField(field.id)}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-error)]"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add field form */}
            {adding ? (
              <div className="border border-[var(--color-border-primary)] rounded-lg p-4 space-y-3">
                <input
                  type="text"
                  placeholder="Field name"
                  value={newField.name}
                  onChange={(e) => setNewField((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm"
                  autoFocus
                />
                <select
                  value={newField.field_type}
                  onChange={(e) => setNewField((f) => ({ ...f, field_type: e.target.value as FieldType, options: [] }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm"
                >
                  {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newField.description}
                  onChange={(e) => setNewField((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={newField.is_required}
                    onChange={(e) => setNewField((f) => ({ ...f, is_required: e.target.checked }))}
                    className="rounded border-[var(--color-border-primary)]"
                  />
                  Required field
                </label>

                {/* Options for dropdown/multi_select */}
                {["dropdown", "multi_select"].includes(newField.field_type) && (
                  <div className="pt-2 border-t border-[var(--color-border-secondary)]">
                    <p className="text-xs text-[var(--color-text-secondary)] mb-2">Options</p>
                    {newField.options.map((opt, idx) => (
                      <div key={opt.id} className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          placeholder={`Option ${idx + 1}`}
                          value={opt.label}
                          onChange={(e) => updateOption(idx, e.target.value)}
                          className="flex-1 border border-[var(--color-border-primary)] rounded px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => removeOption(idx)}
                          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] text-sm"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addOption}
                      className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                      + Add option
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setAdding(false)}
                    className="flex-1 text-sm px-3 py-2 border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-surface-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddField}
                    disabled={!newField.name.trim() || saving}
                    className="flex-1 text-sm px-3 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                  >
                    {saving ? "..." : "Add Field"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="w-full text-sm px-4 py-2 border border-dashed border-[var(--color-border-primary)] rounded-lg text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)] hover:text-[var(--color-text-primary)]"
              >
                + Add Custom Field
              </button>
            )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

// ─── LIST VIEW ASSIGNEE FILTER (searchable, chip-based) ─────────────────────
function ListAssigneeFilter({
  users,
  selected,
  onChange,
  scope,
}: {
  users: Member[];
  selected: string;
  onChange: (id: string) => void;
  scope: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = users.filter((u) => {
    const name = `${u.first_name} ${u.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const selectedUser = users.find((u) => u.id === selected);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="text-sm border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] flex items-center gap-2 min-w-[140px]"
      >
        {selectedUser ? (
          <span className="flex items-center gap-1.5">
            <AssigneeAvatar
              name={`${selectedUser.first_name} ${selectedUser.last_name}`}
              avatarUrl={selectedUser.avatar_url}
              size="sm"
            />
            <span className="truncate">{selectedUser.first_name} {selectedUser.last_name}</span>
            <span
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] ml-1"
              onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
            >
              &times;
            </span>
          </span>
        ) : (
          <span className="text-[var(--color-text-tertiary)]">
            {scope === "global" ? "All people" : "All members"}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg shadow-[var(--shadow-lg)] max-h-60 overflow-hidden">
          <div className="p-2 border-b border-[var(--color-border-secondary)]">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm px-2 py-1 border border-[var(--color-border-primary)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              autoFocus
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            <button
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-hover)] ${
                !selected ? "bg-[var(--color-bg-secondary)] font-medium" : ""
              }`}
            >
              {scope === "global" ? "All people" : "All members"}
            </button>
            {filtered.map((user) => (
              <button
                key={user.id}
                onClick={() => { onChange(user.id); setOpen(false); setSearch(""); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-hover)] ${
                  selected === user.id ? "bg-[var(--color-bg-secondary)]" : ""
                }`}
              >
                <AssigneeAvatar
                  name={`${user.first_name} ${user.last_name}`}
                  avatarUrl={user.avatar_url}
                  size="sm"
                />
                <span className="flex-1">{user.first_name} {user.last_name}</span>
                {selected === user.id && <span className="text-green-500">&#10003;</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-[var(--color-text-tertiary)] p-3 text-center">No one found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
