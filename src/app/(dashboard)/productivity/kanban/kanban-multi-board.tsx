"use client";

import { useState } from "react";
import { KanbanBoard } from "./kanban-board";

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
    color: "bg-blue-50 border-blue-200",
    headerColor: "bg-blue-100",
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
  teamBoard,
  personalBoard,
  globalBoard,
  allUsers,
  departmentId,
  canManageTeam,
  canManageGlobal,
  currentUserId,
}: Props) {
  // Track which sections are expanded
  const [expanded, setExpanded] = useState<Record<BoardScope, boolean>>({
    team: true,
    personal: true,
    global: true,
  });

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
      <div key={scope} className={`rounded-xl border-2 ${info.color} overflow-hidden`}>
        {/* Section Header */}
        <button
          onClick={() => toggleSection(scope)}
          className={`w-full flex items-center justify-between px-4 py-3 ${info.headerColor} hover:opacity-90 transition-opacity`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{info.icon}</span>
            <div className="text-left">
              <h2 className="font-semibold text-gray-900">{info.title}</h2>
              <p className="text-xs text-gray-600">{info.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {board && (
              <span className="text-xs text-gray-500 bg-white/60 px-2 py-1 rounded">
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
          <div className="p-2">
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
              <EmptyBoardState scope={scope} canCreate={canManage} departmentId={departmentId} currentUserId={currentUserId} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kanban Boards</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button
            onClick={() => setExpanded({ team: true, personal: true, global: true })}
            className="hover:text-gray-700"
          >
            Expand All
          </button>
          <span>|</span>
          <button
            onClick={() => setExpanded({ team: false, personal: false, global: false })}
            className="hover:text-gray-700"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Board Sections - Team at top, Personal middle, Global bottom */}
      {renderBoardSection(teamBoard, "team", canManageTeam)}
      {renderBoardSection(personalBoard, "personal", true)}
      {renderBoardSection(globalBoard, "global", canManageGlobal)}
    </div>
  );
}

function EmptyBoardState({
  scope,
  canCreate,
  departmentId,
  currentUserId,
}: {
  scope: BoardScope;
  canCreate: boolean;
  departmentId: string | null;
  currentUserId: string;
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
        window.location.reload();
      }
    } finally {
      setCreating(false);
    }
  };

  const info = SCOPE_INFO[scope];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-3">{info.icon}</span>
      <p className="text-gray-500 mb-4 text-sm">
        {scope === "team" && "No team board yet."}
        {scope === "personal" && "Set up your personal board to track your own tasks."}
        {scope === "global" && "No company-wide board yet."}
      </p>
      {canCreate && (
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm"
        >
          {creating ? "Creating..." : `Create ${info.title}`}
        </button>
      )}
      {!canCreate && (
        <p className="text-xs text-gray-400">
          {scope === "team" && "Ask your manager to set this up."}
          {scope === "global" && "Ask OPS to set this up."}
        </p>
      )}
    </div>
  );
}
