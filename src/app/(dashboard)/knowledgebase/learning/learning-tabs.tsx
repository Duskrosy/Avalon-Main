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
};

export function LearningPageTabs({ materials, departments, canManage, isOps }: Props) {
  const [tab, setTab] = useState<"materials" | "progress">("materials");

  return (
    <div>
      {/* Only show tabs if user is a manager (can see team progress) */}
      {canManage && (
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          <button
            onClick={() => setTab("materials")}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === "materials"
                ? "text-gray-900 border-b-2 border-gray-900 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Materials
          </button>
          <button
            onClick={() => setTab("progress")}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === "progress"
                ? "text-gray-900 border-b-2 border-gray-900 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Team Progress
          </button>
        </div>
      )}

      {tab === "materials" && (
        <LearningView materials={materials} departments={departments} canManage={canManage} />
      )}

      {tab === "progress" && canManage && (
        <TeamProgress isOps={isOps} departments={departments} />
      )}
    </div>
  );
}
