"use client";

import { useState } from "react";
import { LearningView } from "./learning-view";
import { TeamProgress } from "./team-progress";

type Dept = { id: string; name: string; slug: string };

type Props = {
  materials: Parameters<typeof LearningView>[0]["materials"];
  departments: Dept[];
  canManage: boolean;
  isOps: boolean;
  userDeptId: string | null;
};

export function LearningPageTabs({ materials, departments, canManage, isOps, userDeptId }: Props) {
  const [tab, setTab] = useState<"materials" | "progress">("materials");

  return (
    <div>
      {/* Only show tabs if user is a manager (can see team progress) */}
      {canManage && (
        <div className="flex gap-1 border-b border-[var(--color-border-primary)] mb-6">
          <button
            onClick={() => setTab("materials")}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === "materials"
                ? "text-[var(--color-text-primary)] border-b-2 border-[var(--color-text-primary)] -mb-px"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Materials
          </button>
          <button
            onClick={() => setTab("progress")}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === "progress"
                ? "text-[var(--color-text-primary)] border-b-2 border-[var(--color-text-primary)] -mb-px"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Team Progress
          </button>
        </div>
      )}

      {tab === "materials" && (
        <LearningView materials={materials} departments={departments} canManage={canManage} isOps={isOps} userDeptId={userDeptId} />
      )}

      {tab === "progress" && canManage && (
        <TeamProgress isOps={isOps} departments={departments} />
      )}
    </div>
  );
}
