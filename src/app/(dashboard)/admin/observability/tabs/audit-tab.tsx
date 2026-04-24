"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { CenterSpinner } from "@/components/ui/center-spinner";

type AuditRow = {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_id: string | null;
};

type AuditResponse = {
  rows: AuditRow[];
  total: number;
};

const ACTION_STYLES: Record<string, string> = {
  INSERT: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  UPDATE: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  DELETE: "bg-[var(--color-error-light)] text-[var(--color-error)]",
};

export function AuditTab() {
  const [data, setData] = useState<AuditResponse>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ table: "", action: "", actor_id: "" });
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const LIMIT = 50;

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (filters.table) params.set("table", filters.table);
    if (filters.action) params.set("action", filters.action);
    if (filters.actor_id) params.set("actor_id", filters.actor_id);

    const res = await fetch(`/api/obs/audit?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [filters, offset]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  function applyFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Table name"
          value={filters.table}
          onChange={(e) => applyFilter("table", e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <select
          value={filters.action}
          onChange={(e) => applyFilter("action", e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All actions</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
        <span className="text-xs text-[var(--color-text-tertiary)] ml-auto">{data.total.toLocaleString()} total entries</span>
      </div>

      {loading ? (
        <CenterSpinner />
      ) : data.rows.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No audit entries match these filters.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] mb-4">
            <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
              <thead className="bg-[var(--color-bg-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">When</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Table</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Record</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
                {data.rows.map((row) => (
                  <>
                    <tr
                      key={row.id}
                      className="hover:bg-[var(--color-surface-hover)] cursor-pointer"
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    >
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary)]">
                        {format(parseISO(row.created_at), "d MMM HH:mm:ss")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-sm text-[var(--color-text-primary)]">{row.actor_name ?? "System"}</span>
                        {row.actor_email && (
                          <span className="text-xs text-[var(--color-text-tertiary)] ml-1">({row.actor_email})</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_STYLES[row.action] ?? ""}`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-primary)]">{row.table_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-tertiary)] truncate max-w-32">
                        {row.record_id ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-[var(--color-text-tertiary)]">
                        {expanded === row.id ? "▲" : "▼"}
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr key={`${row.id}-detail`}>
                        <td colSpan={6} className="px-4 py-3 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-secondary)]">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {row.old_values && (
                              <div>
                                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Before</p>
                                <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] rounded-lg p-2.5 border border-[var(--color-border-secondary)] overflow-x-auto max-h-32">
                                  {JSON.stringify(row.old_values, null, 2)}
                                </pre>
                              </div>
                            )}
                            {row.new_values && (
                              <div>
                                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">After</p>
                                <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] rounded-lg p-2.5 border border-[var(--color-border-secondary)] overflow-x-auto max-h-32">
                                  {JSON.stringify(row.new_values, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-[var(--color-text-tertiary)]">
              Showing {offset + 1}–{Math.min(offset + LIMIT, data.total)} of {data.total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                className="text-xs border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={offset + LIMIT >= data.total}
                onClick={() => setOffset(offset + LIMIT)}
                className="text-xs border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
