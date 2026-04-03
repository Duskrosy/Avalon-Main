"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

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
  INSERT: "bg-green-50 text-green-700",
  UPDATE: "bg-blue-50 text-blue-600",
  DELETE: "bg-red-50 text-red-500",
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
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <select
          value={filters.action}
          onChange={(e) => applyFilter("action", e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All actions</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
        <span className="text-xs text-gray-400 ml-auto">{data.total.toLocaleString()} total entries</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : data.rows.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No audit entries match these filters.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">When</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Table</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Record</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {data.rows.map((row) => (
                  <>
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    >
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {format(parseISO(row.created_at), "d MMM HH:mm:ss")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-sm text-gray-800">{row.actor_name ?? "System"}</span>
                        {row.actor_email && (
                          <span className="text-xs text-gray-400 ml-1">({row.actor_email})</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_STYLES[row.action] ?? ""}`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{row.table_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate max-w-32">
                        {row.record_id ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-300">
                        {expanded === row.id ? "▲" : "▼"}
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr key={`${row.id}-detail`}>
                        <td colSpan={6} className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {row.old_values && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 mb-1">Before</p>
                                <pre className="text-xs text-gray-600 bg-white rounded-lg p-2.5 border border-gray-100 overflow-x-auto max-h-32">
                                  {JSON.stringify(row.old_values, null, 2)}
                                </pre>
                              </div>
                            )}
                            {row.new_values && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 mb-1">After</p>
                                <pre className="text-xs text-gray-600 bg-white rounded-lg p-2.5 border border-gray-100 overflow-x-auto max-h-32">
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
            <span className="text-xs text-gray-400">
              Showing {offset + 1}–{Math.min(offset + LIMIT, data.total)} of {data.total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={offset + LIMIT >= data.total}
                onClick={() => setOffset(offset + LIMIT)}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40"
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
