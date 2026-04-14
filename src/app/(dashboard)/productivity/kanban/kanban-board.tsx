"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";

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

type Member = { id: string; first_name: string; last_name: string };

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
  "#fef2f2", // red light
  "#fff7ed", // orange light
  "#fefce8", // yellow light
  "#f0fdf4", // green light
  "#f0fdfa", // teal light
  "#eff6ff", // blue light
  "#f5f3ff", // violet light
  "#fdf2f8", // pink light
];

// ─── ASSIGNEE AVATAR ──────────────────────────────────────────────────────────
function AssigneeAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const sizeClass = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";
  return (
    <div className={`${sizeClass} rounded-full bg-gray-200 flex items-center justify-center font-medium text-gray-600 shrink-0`}>
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
    return <span className="text-xs text-gray-400">Unassigned</span>;
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
          <AssigneeAvatar key={a.id} name={a.profile ? `${a.profile.first_name} ${a.profile.last_name}` : "?"} />
        ))}
      </div>
      <span className="text-xs text-gray-600 ml-1">
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
    <div className="relative">
      <div
        className="border border-gray-200 rounded-lg px-3 py-2 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {selected.length === 0 ? (
          <span className="text-sm text-gray-400">Select assignees...</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selected.map((id) => {
              const user = allUsers.find((u) => u.id === id);
              if (!user) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full"
                >
                  {user.first_name} {user.last_name}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    className="text-gray-400 hover:text-gray-600"
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
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
              autoFocus
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 p-3 text-center">No users found</p>
            ) : (
              filtered.map((user) => (
                <button
                  key={user.id}
                  onClick={() => toggle(user.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    selected.includes(user.id) ? "bg-gray-50" : ""
                  }`}
                >
                  <AssigneeAvatar name={`${user.first_name} ${user.last_name}`} />
                  <span className="flex-1">{user.first_name} {user.last_name}</span>
                  {selected.includes(user.id) && (
                    <span className="text-green-500">✓</span>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-gray-100">
            <button
              onClick={() => setOpen(false)}
              className="w-full text-xs text-gray-500 hover:text-gray-700"
            >
              Done
            </button>
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
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1">
        {colors.map((color, i) => (
          <button
            key={i}
            onClick={() => onChange(color)}
            className={`w-6 h-6 rounded border-2 transition-all ${
              selected === color ? "border-gray-900 scale-110" : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: color ?? "#ffffff" }}
            title={color ?? "None"}
          >
            {color === null && <span className="text-xs text-gray-300">∅</span>}
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
  const baseClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900";

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
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-600">{field.description || "Yes"}</span>
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
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {card.id ? "Edit Card" : "New Card"}
        </h2>
        <div className="space-y-3">
          <input
            autoFocus
            type="text"
            placeholder="Card title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <textarea
            rows={3}
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Card["priority"] }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Due date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Assignees</label>
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
            <div className="pt-3 border-t border-gray-100 space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Custom Fields</p>
              {fieldDefinitions.map((field) => (
                <div key={field.id}>
                  <label className="block text-xs text-gray-500 mb-1">
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
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 mr-auto">
              Delete
            </button>
          )}
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
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
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
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

export function KanbanBoard({ board, initialColumns, members, allUsers, departmentId, canManage, canManageGlobal, currentUserId, initialFieldDefinitions }: Props) {
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

  // Real-time subscription for live updates
  useEffect(() => {
    if (!boardState?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`board-${boardState.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_cards" },
        () => {
          // Refetch on any card change
          fetch(`/api/kanban?department_id=${departmentId}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.columns) setColumns(data.columns);
              if (data.fieldDefinitions) setFieldDefinitions(data.fieldDefinitions);
            });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_card_field_values" },
        () => {
          fetch(`/api/kanban?department_id=${departmentId}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.columns) setColumns(data.columns);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardState?.id, departmentId]);

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
      const { id } = await res.json();
      setColumns((cols) => [...cols, { id, name: newColName.trim(), sort_order: cols.length, color: "#6b7280", kanban_cards: [] }]);
    }
    setNewColName("");
    setAddingColumn(false);
  }, [newColName, columns.length, ensureBoard]);

  const handleDeleteColumn = useCallback(async (colId: string, colName: string) => {
    if (!confirm(`Delete column "${colName}" and all its cards?`)) return;
    await fetch(`/api/kanban/columns?id=${colId}`, { method: "DELETE" });
    setColumns((cols) => cols.filter((c) => c.id !== colId));
  }, []);

  const isOverdue = (due: string | null) => due && new Date(due) < new Date();

  const SortIcon = ({ field }: { field: SortField }) => {
    if (listSort.field !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-gray-900 ml-1">{listSort.dir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Task Board</h1>
          <p className="text-sm text-gray-500 mt-1">{allCards.length} card{allCards.length !== 1 ? "s" : ""} across {columns.length} column{columns.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Settings button (managers only) */}
          {canManage && (
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Settings
            </button>
          )}
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView("board")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                view === "board" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
              view === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
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
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All columns</option>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={listFilter.priority}
              onChange={(e) => setListFilter((f) => ({ ...f, priority: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All priorities</option>
              {Object.keys(PRIORITY_LABELS).map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p as Card["priority"]]}</option>
              ))}
            </select>
            <select
              value={listFilter.assigned}
              onChange={(e) => setListFilter((f) => ({ ...f, assigned: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
              ))}
            </select>
            {(listFilter.status || listFilter.priority || listFilter.assigned) && (
              <button
                onClick={() => setListFilter({ priority: "", assigned: "", status: "" })}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-gray-400">{filteredSortedCards.length} card{filteredSortedCards.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th
                    className="text-left text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => toggleSort("title")}
                  >
                    Title <SortIcon field="title" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-900 select-none w-28"
                    onClick={() => toggleSort("status")}
                  >
                    Status <SortIcon field="status" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-900 select-none w-24"
                    onClick={() => toggleSort("priority")}
                  >
                    Priority <SortIcon field="priority" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-900 select-none w-36"
                    onClick={() => toggleSort("assigned_to")}
                  >
                    Assigned to <SortIcon field="assigned_to" />
                  </th>
                  <th
                    className="text-left text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer hover:text-gray-900 select-none w-28"
                    onClick={() => toggleSort("due_date")}
                  >
                    Due <SortIcon field="due_date" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredSortedCards.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-sm text-gray-400">
                      No cards found
                    </td>
                  </tr>
                ) : (
                  filteredSortedCards.map((card) => (
                    <tr
                      key={card.id}
                      onClick={() => setModal({ ...card, column_id: card.columnId })}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                            card.priority === "urgent" ? "bg-red-500" :
                            card.priority === "high"   ? "bg-amber-400" :
                            card.priority === "medium" ? "bg-blue-400" : "bg-gray-300"
                          }`} />
                          <div>
                            <p className="font-medium text-gray-900">{card.title}</p>
                            {card.description && (
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{card.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                          {card.columnName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${
                          card.priority === "urgent" ? "text-red-600" :
                          card.priority === "high"   ? "text-amber-600" :
                          card.priority === "medium" ? "text-blue-600" : "text-gray-400"
                        }`}>
                          {PRIORITY_LABELS[card.priority]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {card.assignees && card.assignees.length > 0
                          ? <AssigneeChips assignees={card.assignees} />
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {card.due_date ? (
                          <span className={`text-xs ${isOverdue(card.due_date) ? "text-red-500 font-medium" : "text-gray-500"}`}>
                            {format(new Date(card.due_date), "d MMM yyyy")}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
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
      {view === "board" && <div className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start">
        {columns.map((col) => (
          <div
            key={col.id}
            className="bg-gray-50 rounded-xl p-3 w-72 shrink-0 flex flex-col gap-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.id)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-700">
                {col.name}
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  {col.kanban_cards.length}
                </span>
              </h3>
              {canManage && (
                <button
                  onClick={() => handleDeleteColumn(col.id, col.name)}
                  className="text-gray-300 hover:text-red-400 text-xs"
                >
                  ×
                </button>
              )}
            </div>

            {/* Cards */}
            {col.kanban_cards.map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => handleDragStart(card.id, col.id)}
                onClick={() => setModal({ ...card, column_id: col.id })}
                className={`bg-white border border-l-4 border-gray-200 ${
                  PRIORITY_COLORS[card.priority]
                } rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow`}
              >
                <p className="text-sm text-gray-900 font-medium leading-snug mb-1">{card.title}</p>
                {card.description && (
                  <p className="text-xs text-gray-400 mb-2 line-clamp-2">{card.description}</p>
                )}
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  {card.assignees && card.assignees.length > 0 && (
                    <AssigneeChips assignees={card.assignees} maxShow={2} />
                  )}
                  {card.due_date && (
                    <span
                      className={`text-xs ${
                        isOverdue(card.due_date)
                          ? "text-red-500 font-medium"
                          : "text-gray-400"
                      }`}
                    >
                      {format(new Date(card.due_date), "d MMM")}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Add card */}
            <button
              onClick={() => setModal({ column_id: col.id })}
              className="text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg py-1.5 px-2 text-left transition-colors"
            >
              + Add card
            </button>
          </div>
        ))}

        {/* Add column */}
        {canManage && (
          <div className="w-72 shrink-0">
            {addingColumn ? (
              <div className="bg-gray-50 rounded-xl p-3 flex gap-2">
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
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  onClick={handleAddColumn}
                  className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="w-full text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl py-3 px-4 text-left transition-colors border-2 border-dashed border-gray-200"
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
        <FieldSettingsPanel
          boardId={boardState.id}
          fieldDefinitions={fieldDefinitions}
          onUpdate={(fields) => setFieldDefinitions(fields)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ─── FIELD SETTINGS PANEL ─────────────────────────────────────────────────────
function FieldSettingsPanel({
  boardId,
  fieldDefinitions,
  onUpdate,
  onClose,
}: {
  boardId: string;
  fieldDefinitions: FieldDefinition[];
  onUpdate: (fields: FieldDefinition[]) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<FieldDefinition[]>(fieldDefinitions);
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
      alert(err.error || "Failed to delete field");
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white w-96 h-full shadow-xl overflow-y-auto z-50">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Board Settings</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Custom Fields</h3>
            <p className="text-xs text-gray-500 mb-4">
              Add custom fields to track additional data on cards. All team members can fill in field values.
            </p>

            {/* Existing fields */}
            <div className="space-y-2 mb-4">
              {fields.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No custom fields yet</p>
              ) : (
                fields.map((field) => (
                  <div key={field.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {field.name}
                        {field.is_required && <span className="text-red-400 ml-1">*</span>}
                      </p>
                      <p className="text-xs text-gray-500">{FIELD_TYPE_LABELS[field.field_type]}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteField(field.id)}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add field form */}
            {adding ? (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <input
                  type="text"
                  placeholder="Field name"
                  value={newField.name}
                  onChange={(e) => setNewField((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  autoFocus
                />
                <select
                  value={newField.field_type}
                  onChange={(e) => setNewField((f) => ({ ...f, field_type: e.target.value as FieldType, options: [] }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={newField.is_required}
                    onChange={(e) => setNewField((f) => ({ ...f, is_required: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  Required field
                </label>

                {/* Options for dropdown/multi_select */}
                {["dropdown", "multi_select"].includes(newField.field_type) && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2">Options</p>
                    {newField.options.map((opt, idx) => (
                      <div key={opt.id} className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          placeholder={`Option ${idx + 1}`}
                          value={opt.label}
                          onChange={(e) => updateOption(idx, e.target.value)}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => removeOption(idx)}
                          className="text-gray-400 hover:text-red-500 text-sm"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addOption}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      + Add option
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setAdding(false)}
                    className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddField}
                    disabled={!newField.name.trim() || saving}
                    className="flex-1 text-sm px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                  >
                    {saving ? "..." : "Add Field"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="w-full text-sm px-4 py-2 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-700"
              >
                + Add Custom Field
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
