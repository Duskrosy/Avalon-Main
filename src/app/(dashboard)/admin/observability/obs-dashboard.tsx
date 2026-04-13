"use client";

import { useState } from "react";
import { UsageTab } from "./tabs/usage-tab";
import { ErrorsTab } from "./tabs/errors-tab";
import { AuditTab } from "./tabs/audit-tab";
import { AlertsTab } from "./tabs/alerts-tab";
import { JobsTab } from "./tabs/jobs-tab";
import { PulseTab } from "./tabs/pulse-tab";

const TABS = [
  { id: "pulse",  label: "Pulse" },
  { id: "usage",  label: "Usage" },
  { id: "errors", label: "Errors" },
  { id: "audit",  label: "Audit" },
  { id: "alerts", label: "Alerts" },
  { id: "jobs",   label: "Jobs" },
] as const;

type TabId = typeof TABS[number]["id"];

export function ObsDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("pulse");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Observability</h1>
        <p className="text-sm text-gray-500 mt-1">Platform health, usage analytics, and audit trail — OPS only</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? "text-gray-900 border-b-2 border-gray-900 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "pulse"  && <PulseTab />}
      {activeTab === "usage"  && <UsageTab />}
      {activeTab === "errors" && <ErrorsTab />}
      {activeTab === "audit"  && <AuditTab />}
      {activeTab === "alerts" && <AlertsTab />}
      {activeTab === "jobs"   && <JobsTab />}
    </div>
  );
}
