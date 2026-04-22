"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  InventoryLocation,
  InventoryRow,
} from "@/components/inventory/guided-movement-workflow";

export default function InventoryView({
  locations,
}: {
  locations: InventoryLocation[];
}) {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/inventory");
      if (!res.ok) {
        setError((await res.json()).error ?? "Failed to load");
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { data: InventoryRow[] };
      setRows(json.data);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.variant_sku.toLowerCase().includes(q) ||
        r.parent_sku.toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q) ||
        r.color_name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => a.sort_order - b.sort_order),
    [locations]
  );

  const totalOnHand = useMemo(
    () =>
      filtered.reduce(
        (sum, r) =>
          sum + Object.values(r.balances).reduce((s, b) => s + b.on_hand, 0),
        0
      ),
    [filtered]
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-neutral-600">
            Stock truth across {sortedLocations.length} locations. Read-only —
            all changes go through stock-action workflows.
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU, name, color…"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm w-72"
        />
      </header>

      <div className="flex gap-4 text-sm">
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
          <span className="text-neutral-500">Variants:</span>{" "}
          <span className="font-medium">{filtered.length}</span>
        </div>
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
          <span className="text-neutral-500">Total on hand:</span>{" "}
          <span className="font-medium">{totalOnHand.toLocaleString()}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto border border-neutral-200 rounded-md">
        <table className="min-w-full text-xs">
          <thead className="bg-neutral-50 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium">SKU</th>
              <th className="text-left px-3 py-2 font-medium">Product</th>
              <th className="text-left px-3 py-2 font-medium">Color</th>
              <th className="text-left px-3 py-2 font-medium">Size</th>
              {sortedLocations.map((l) => (
                <th
                  key={l.id}
                  className={`text-right px-2 py-2 font-medium ${
                    l.is_source ? "bg-amber-50" : ""
                  }`}
                  title={l.location_name}
                >
                  {l.location_code}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td
                  colSpan={5 + sortedLocations.length}
                  className="text-center py-8 text-neutral-500"
                >
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5 + sortedLocations.length}
                  className="text-center py-8 text-neutral-500"
                >
                  No variants with stock yet.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const total = Object.values(r.balances).reduce(
                  (s, b) => s + b.on_hand,
                  0
                );
                return (
                  <tr key={r.variant_id} className="hover:bg-neutral-50">
                    <td className="px-3 py-1.5 font-mono">{r.variant_sku}</td>
                    <td className="px-3 py-1.5">{r.product_name}</td>
                    <td className="px-3 py-1.5">{r.color_name}</td>
                    <td className="px-3 py-1.5">{r.size_label}</td>
                    {sortedLocations.map((l) => {
                      const b = r.balances[l.location_code];
                      return (
                        <td
                          key={l.id}
                          className={`text-right px-2 py-1.5 tabular-nums ${
                            l.is_source ? "bg-amber-50/50" : ""
                          } ${!b || b.on_hand === 0 ? "text-neutral-300" : ""}`}
                        >
                          {b?.on_hand ?? 0}
                          {b && b.reserved > 0 && (
                            <span className="text-[10px] text-neutral-500 ml-1">
                              ({b.reserved}r)
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-right px-3 py-1.5 tabular-nums font-medium">
                      {total}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
