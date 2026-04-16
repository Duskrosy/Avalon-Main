"use client";

import { useState, useCallback } from "react";

type Dept = { id: string; name: string; slug: string };
type KpiItem = {
  id: string;
  name: string;
  category: string;
  data_source_status: string;
  is_active: boolean;
  department: Dept | null;
};

export function DevTasklistView({ kpis, departments }: { kpis: KpiItem[]; departments: Dept[] }) {
  const [items, setItems] = useState(kpis);

  const markWired = useCallback(async (id: string) => {
    setItems((prev) => prev.map((k) => k.id === id ? { ...k, data_source_status: "wired" } : k));
    await fetch("/api/kpis/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data_source_status: "wired" }),
    });
  }, []);

  const toWire = items.filter((k) => k.data_source_status === "to_be_wired");
  const wired = items.filter((k) => k.data_source_status === "wired");

  // Group by department
  const grouped = departments
    .map((d) => ({
      dept: d,
      items: toWire.filter((k) => k.department?.id === d.id),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Development</h1>
          {toWire.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning-text)] font-medium">
              {toWire.length} to wire
            </span>
          )}
        </div>

        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">KPIs to Wire</h2>
        {grouped.length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)] py-4">All KPIs are wired or standalone.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.dept.id}>
                <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">{g.dept.name}</p>
                <div className="space-y-1">
                  {g.items.map((k) => (
                    <div key={k.id} className="flex items-center justify-between py-2 px-3 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]">
                      <div>
                        <span className="text-sm text-[var(--color-text-primary)]">{k.name}</span>
                        <span className="text-xs text-[var(--color-text-tertiary)] ml-2">{k.category}</span>
                      </div>
                      <button
                        onClick={() => markWired(k.id)}
                        className="text-xs px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--color-success-light)] text-[var(--color-success)] font-medium hover:bg-green-100"
                      >
                        Mark as Wired
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {wired.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">Recently Wired</h2>
          <div className="space-y-1">
            {wired.map((k) => (
              <div key={k.id} className="flex items-center gap-2 py-2 px-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]">
                <span className="text-[var(--color-success)]">✓</span>
                <span className="text-sm text-[var(--color-text-secondary)]">{k.name}</span>
                <span className="text-xs text-[var(--color-text-tertiary)]">{k.department?.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
