"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { RefreshCw, Search, Users, X } from "lucide-react";

// Customers index. Searchable, sortable list of every customer the
// sales team has touched (via Avalon-side create or import-on-pick).
// Each row links to /sales-agent/customers/[id] for the detail page.

type Row = {
  id: string;
  shopify_customer_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  full_address: string | null;
  order_count: number;
  completed_count: number;
  total_gross: number;
  total_net: number;
  last_order_at: string | null;
  created_at: string;
};

const SORTS = [
  { value: "recent", label: "Recent activity" },
  { value: "spend", label: "Lifetime spend" },
  { value: "orders", label: "Order count" },
  { value: "name", label: "Name (A→Z)" },
];

const PAGE_SIZE = 50;

export function CustomersListView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState("recent");
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(query.trim()), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Reset offset when query / sort changes — pagination is per-filter-set.
  useEffect(() => {
    setOffset(0);
  }, [debounced, sort]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (debounced.length >= 2) params.set("q", debounced);
      const res = await fetch(`/api/sales/customers/list?${params.toString()}`);
      if (!res.ok) return;
      const j = await res.json();
      setRows((j.customers ?? []) as Row[]);
      setTotal(j.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [debounced, sort, offset]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users size={18} className="text-gray-500" />
            Customers
          </h1>
          <p className="text-xs text-gray-500">
            Every customer the sales team has touched. Click a row for
            lifetime stats and order history.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <div className="relative flex-1 min-w-[220px] max-w-[420px]">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, or email"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded text-xs"
          aria-label="Sort"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void fetchPage()}
          className="ml-auto p-1.5 text-gray-400 hover:text-gray-700"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Contact</th>
              <th className="px-3 py-2 text-right">Orders</th>
              <th className="px-3 py-2 text-right">Lifetime gross</th>
              <th className="px-3 py-2 text-right">Net collected</th>
              <th className="px-3 py-2 text-left">Last order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-xs text-gray-400"
                >
                  {debounced.length >= 2
                    ? "No customers match this search."
                    : "No customers yet."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link
                    href={`/sales-agent/customers/${r.id}`}
                    className="hover:underline decoration-gray-300 underline-offset-2"
                  >
                    <div className="font-medium">
                      {r.full_name || "(unnamed)"}
                    </div>
                    {r.full_address && (
                      <div className="text-[11px] text-gray-500 truncate max-w-[260px]">
                        {r.full_address}
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  <div>{r.phone ?? "—"}</div>
                  <div className="text-[11px] text-gray-500">
                    {r.email ?? ""}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.order_count}
                  {r.completed_count > 0 && (
                    <span className="text-[11px] text-gray-500 ml-1">
                      ({r.completed_count} done)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.total_gross > 0
                    ? `₱${r.total_gross.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {r.total_net > 0
                    ? `₱${r.total_net.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {r.last_order_at
                    ? format(parseISO(r.last_order_at), "MMM d, yyyy")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
          <span>
            Showing {rows.length === 0 ? 0 : offset + 1}–
            {offset + rows.length} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() =>
                setOffset(Math.max(0, offset - PAGE_SIZE))
              }
              className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
