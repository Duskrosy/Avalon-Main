"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { format } from "date-fns";

const PRIORITY_COLORS = {
  low: "border-l-gray-300",
  medium: "border-l-blue-400",
  high: "border-l-amber-400",
  urgent: "border-l-red-500",
};

const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

type Member = { id: string; first_name: string; last_name: string };
type Card = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  sort_order: number;
  assigned_to_profile: Member | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};
type Column = { id: string; name: string; sort_order: number; kanban_cards: Card[] };
type Board = { id: string; name: string } | null;

type Props = {
  board: Board;
  initialColumns: Column[];
  members: Member[];
  departmentId: string | null;
  canManage: boolean;
};

function CardModal({
  card,
  members,
  onSave,
  onClose,
  onDelete,
}: {
  card: Partial<Card> & { column_id?: string };
  members: Member[];
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState({
    title: card.title ?? "",
    description: card.description ?? "",
    assigned_to: card.assigned_to_profile?.id ?? "",
    due_date: card.due_date ?? "",
    priority: card.priority ?? "medium",
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
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
              <label className="block text-xs text-gray-500 mb-1">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Assign to</label>
            <select
              value={form.assigned_to}
              onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
              ))}
            </select>
          </div>
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
              assigned_to: form.assigned_to || null,
              due_date: form.due_date || null,
            })}
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

export function KanbanBoard({ board, initialColumns, members, departmentId, canManage }: Props) {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [boardState, setBoardState] = useState<Board>(board);
  const [modal, setModal] = useState<(Partial<Card> & { column_id?: string }) | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [listSort, setListSort] = useState<{ field: SortField; dir: SortDir }>({ field: "due_date", dir: "asc" });
  const [listFilter, setListFilter] = useState<{ priority: string; assigned: string; status: string }>({
    priority: "", assigned: "", status: "",
  });
  const dragCard = useRef<{ cardId: string; sourceColId: string } | null>(null);

  // Flat list of all cards with their column name (status)
  const allCards = useMemo(() => {
    return columns.flatMap((col) =>
      col.kanban_cards.map((card) => ({ ...card, columnId: col.id, columnName: col.name }))
    );
  }, [columns]);

  const filteredSortedCards = useMemo(() => {
    let cards = allCards;
    if (listFilter.priority) cards = cards.filter((c) => c.priority === listFilter.priority);
    if (listFilter.assigned) cards = cards.filter((c) => c.assigned_to_profile?.id === listFilter.assigned);
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
          const na = a.assigned_to_profile ? `${a.assigned_to_profile.first_name} ${a.assigned_to_profile.last_name}` : "zzz";
          const nb = b.assigned_to_profile ? `${b.assigned_to_profile.first_name} ${b.assigned_to_profile.last_name}` : "zzz";
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

  const handleSaveCard = useCallback(async (data: Record<string, unknown>) => {
    const b = await ensureBoard();
    if (!b && !boardState) return;

    if (modal?.id) {
      // Update
      await fetch("/api/kanban/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modal.id, ...data }),
      });
      setColumns((cols) =>
        cols.map((col) => ({
          ...col,
          kanban_cards: col.kanban_cards.map((c) =>
            c.id === modal.id
              ? {
                  ...c,
                  ...data,
                  assigned_to_profile: data.assigned_to
                    ? (members.find((m) => m.id === data.assigned_to) ?? null)
                    : null,
                }
              : c
          ),
        }))
      );
    } else {
      // Create
      const res = await fetch("/api/kanban/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_id: modal?.column_id, ...data }),
      });
      if (res.ok) {
        const { id } = await res.json();
        const newCard: Card = {
          id,
          title: data.title as string,
          description: (data.description as string) || null,
          priority: (data.priority as Card["priority"]) ?? "medium",
          due_date: (data.due_date as string) || null,
          sort_order: 0,
          assigned_to_profile: data.assigned_to
            ? (members.find((m) => m.id === data.assigned_to) ?? null)
            : null,
          created_by_profile: null,
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
  }, [modal, members, ensureBoard, boardState]);

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
      setColumns((cols) => [...cols, { id, name: newColName.trim(), sort_order: cols.length, kanban_cards: [] }]);
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
                        {card.assigned_to_profile
                          ? `${card.assigned_to_profile.first_name} ${card.assigned_to_profile.last_name}`
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
                  {card.assigned_to_profile && (
                    <span className="text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded-full">
                      {card.assigned_to_profile.first_name}
                    </span>
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
          members={members}
          onSave={handleSaveCard}
          onClose={() => setModal(null)}
          onDelete={modal.id ? handleDeleteCard : undefined}
        />
      )}
    </div>
  );
}
