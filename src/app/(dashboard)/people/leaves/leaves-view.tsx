"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileLeaveTab }    from "./file-leave-tab";
import { LeaveHistoryTab } from "./leave-history-tab";
import { TeamLeavesTab }   from "./team-leaves-tab";
import { ApprovalsTab }    from "./approvals-tab";

type Dept = { id: string; name: string; slug: string };

type Props = {
  currentUserId: string;
  isOps: boolean;
  isManager: boolean;
  departments: Dept[];
};

type TabId = "file" | "history" | "team" | "approvals";

export function LeavesView({ currentUserId, isOps, isManager, departments }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("file");
  // Used to trigger a history refresh after a new submission
  const [historyKey, setHistoryKey] = useState(0);

  const canManage = isManager || isOps;

  const tabs: { id: TabId; label: string; show: boolean; managerSide?: boolean }[] = [
    { id: "file",      label: "File a Leave",   show: true },
    { id: "history",   label: "Leave History",  show: true },
    { id: "team",      label: "Team Leaves",    show: canManage, managerSide: true },
    { id: "approvals", label: "Approvals",      show: canManage, managerSide: true },
  ];

  const visibleTabs = tabs.filter((t) => t.show);
  const employeeTabs = visibleTabs.filter((t) => !t.managerSide);
  const managerTabs  = visibleTabs.filter((t) => t.managerSide);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Leaves & Absences</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage leave requests, balances, and approvals.</p>
      </div>

      {/* Tab bar — employee tabs left, manager tabs right */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] mb-6">
        <div className="flex">
          {employeeTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === t.id
                  ? "border-[var(--color-text-primary)] text-[var(--color-text-primary)]"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {managerTabs.length > 0 && (
          <div className="flex">
            {managerTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === t.id
                    ? "border-[var(--color-text-primary)] text-[var(--color-text-primary)]"
                    : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === "file" && (
        <FileLeaveTab
          onSubmitted={() => {
            setHistoryKey((k) => k + 1);
            setActiveTab("history");
          }}
        />
      )}

      {activeTab === "history" && (
        <LeaveHistoryTab
          key={historyKey}
          currentUserId={currentUserId}
          isManager={isManager}
          isOps={isOps}
        />
      )}

      {activeTab === "team" && canManage && (
        <TeamLeavesTab
          isOps={isOps}
          departments={departments}
        />
      )}

      {activeTab === "approvals" && canManage && (
        <ApprovalsTab
          isOps={isOps}
          isManager={isManager}
        />
      )}
    </div>
  );
}
