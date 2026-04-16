"use client";

import { useState } from "react";
import { KanbanBoard } from "./kanban-board";
import { useToast, Toast } from "@/components/ui/toast";

type BoardScope = "global" | "team" | "personal";

type BoardData = {
  id: string;
  name: string;
  scope: BoardScope;
  owner_id: string | null;
  department_id: string | null;
  columns: Array<{
    id: string;
    name: string;
    sort_order: number;
    color: string | null;
    is_default: boolean;
    kanban_cards: Array<unknown>;
  }>;
  fieldDefinitions: Array<unknown>;
} | null;

type Member = { id: string; first_name: string; last_name: string; avatar_url?: string | null };

type Props = {
  teamBoard: BoardData;
  personalBoard: BoardData;
  globalBoard: BoardData;
  allUsers: Member[];
  departmentId: string | null;
  canManageTeam: boolean;
  canManageGlobal: boolean;
  currentUserId: string;
};

const SCOPE_INFO = {
  team: {
    title: "Team Board",
    description: "Shared with your department",
    icon: "👥",
    color: "bg-[var(--color-accent-light)] border-[var(--color-accent)]",
    headerColor: "bg-[var(--color-accent-light)]",
  },
  personal: {
    title: "My Board",
    description: "Private to you",
    icon: "👤",
    color: "bg-purple-50 border-purple-200",
    headerColor: "bg-purple-100",
  },
  global: {
    title: "Global Board",
    description: "Visible to everyone",
    icon: "🌐",
    color: "bg-emerald-50 border-emerald-200",
    headerColor: "bg-emerald-100",
  },
};

export function KanbanMultiBoard({
  teamBoard: initialTeamBoard,
  personalBoard: initialPersonalBoard,
  globalBoard: initialGlobalBoard,
  allUsers,
  departmentId,
  canManageTeam,
  canManageGlobal,
  currentUserId,
}: Props) {
  const [boards, setBoards] = useState<Record<BoardScope, BoardData>>({
    team: initialTeamBoard,
    personal: initialPersonalBoard,
    global: initialGlobalBoard,
  });
  const { toast, setToast } = useToast();

  // Track which sections are expanded — team open by default, others collapsed
  const [expanded, setExpanded] = useState<Record<BoardScope, boolean>>({
    team: true,
    personal: false,
    global: false,
  });

  const handleBoardCreated = (scope: BoardScope, board: BoardData) => {
    setBoards((prev) => ({ ...prev, [scope]: board }));
    setToast({ message: `${SCOPE_INFO[scope].title} created`, type: "success" });
  };

  const toggleSection = (scope: BoardScope) => {
    setExpanded((prev) => ({ ...prev, [scope]: !prev[scope] }));
  };

  const renderBoardSection = (
    board: BoardData,
    scope: BoardScope,
    canManage: boolean
  ) => {
    const info = SCOPE_INFO[scope];
    const isExpanded = expanded[scope];

    return (
      <div key={scope} className={`rounded-[var(--radius-lg)] border-2 ${info.color} overflow-hidden`}>
        {/* Section Header */}
        <button
          onClick={() => toggleSection(scope)}
          className={`w-full flex items-center justify-between px-4 py-3 ${info.headerColor} hover:opacity-90 transition-opacity`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{info.icon}</span>
            <div className="text-left">
              <h2 className="font-semibold text-[var(--color-text-primary)]">{info.title}</h2>
              <p className="text-xs text-[var(--color-text-secondary)]">{info.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {board && (
              <span className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)]/60 px-2 py-1 rounded">
                {board.columns?.reduce((sum, col) => sum + (col.kanban_cards?.length ?? 0), 0) ?? 0} tasks
              </span>
            )}
            <span className={`transform transition-transform ${isExpanded ? "rotate-180" : ""}`}>
              ▼
            </span>
          </div>
        </button>

        {/* Board Content */}
        {isExpanded && (
          <div className="p-3">
            {board ? (
              <KanbanBoard
                board={{
                  id: board.id,
                  name: board.name,
                  scope: board.scope,
                  owner_id: board.owner_id,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                initialColumns={board.columns as any}
                members={allUsers}
                allUsers={allUsers}
                departmentId={departmentId}
                canManage={canManage}
                canManageGlobal={canManageGlobal}
                currentUserId={currentUserId}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                initialFieldDefinitions={board.fieldDefinitions as any}
                compact
              />
            ) : (
              <EmptyBoardState scope={scope} canCreate={canManage} departmentId={departmentId} currentUserId={currentUserId} onCreated={(board) => handleBoardCreated(scope, board)} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Kanban Boards</h1>
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <button
            onClick={() => setExpanded({ team: true, personal: true, global: true })}
            className="hover:text-[var(--color-text-primary)]"
          >
            Expand All
          </button>
          <span>|</span>
          <button
            onClick={() => setExpanded({ team: false, personal: false, global: false })}
            className="hover:text-[var(--color-text-primary)]"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Board Sections - Team at top, Personal middle, Global bottom */}
      {renderBoardSection(boards.team, "team", canManageTeam)}
      {renderBoardSection(boards.personal, "personal", true)}
      {renderBoardSection(boards.global, "global", canManageGlobal)}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function EmptyBoardState({
  scope,
  canCreate,
  departmentId,
  currentUserId,
  onCreated,
}: {
  scope: BoardScope;
  canCreate: boolean;
  departmentId: string | null;
  currentUserId: string;
  onCreated: (board: BoardData) => void;
}) {
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: scope === "team" ? "Team Board" : scope === "personal" ? "My Board" : "Global Board",
        scope,
      };

      if (scope === "team" && departmentId) {
        body.department_id = departmentId;
      }
      if (scope === "personal") {
        body.owner_id = currentUserId;
      }

      const res = await fetch("/api/kanban/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const created = await res.json();
        // Ensure the board has the expected shape for the parent
        onCreated({
          ...created,
          columns: created.columns ?? [],
          fieldDefinitions: created.fieldDefinitions ?? [],
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const info = SCOPE_INFO[scope];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-3">{info.icon}</span>
      <p className="text-[var(--color-text-secondary)] mb-4 text-sm">
        {scope === "team" && "No team board yet."}
        {scope === "personal" && "Set up your personal board to track your own tasks."}
        {scope === "global" && "No company-wide board yet."}
      </p>
      {canCreate && (
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50 text-sm"
        >
          {creating ? "Creating..." : `Create ${info.title}`}
        </button>
      )}
      {!canCreate && (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {scope === "team" && "Ask your manager to set this up."}
          {scope === "global" && "Ask OPS to set this up."}
        </p>
      )}
    </div>
  );
}
