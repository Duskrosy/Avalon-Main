"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Trash2, Calculator } from "lucide-react";
import type { DrawerLineItem } from "./types";

type VariantSearchResult = {
  id: string;
  variant_sku: string;
  product_name: string | null;
  product_id: string | null;
  size: string;
  color: string | null;
  available_stock: number;
};

type Props = {
  items: DrawerLineItem[];
  onAdd: (it: DrawerLineItem) => void;
  onRemove: (idx: number) => void;
  onUpdateQty: (idx: number, qty: number) => void;
  onSplitBundle: () => void;
};

export function StepItems({ items, onAdd, onRemove, onUpdateQty, onSplitBundle }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [priceInput, setPriceInput] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/sales/products?q=${encodeURIComponent(query.trim())}`,
        );
        if (res.ok) {
          const json = await res.json();
          setResults(json.variants ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const addVariant = (v: VariantSearchResult) => {
    const priceStr = priceInput[v.id] ?? "";
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      alert("Enter a unit price first");
      return;
    }
    onAdd({
      product_variant_id: v.id,
      shopify_product_id: null,
      shopify_variant_id: null,
      product_name: v.product_name ?? v.variant_sku,
      variant_name: v.variant_sku,
      size: v.size,
      color: v.color,
      quantity: 1,
      unit_price_amount: price,
      adjusted_unit_price_amount: null,
      line_total_amount: price,
      available_stock: v.available_stock,
    });
    setPriceInput({ ...priceInput, [v.id]: "" });
    setQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search variant SKU or size"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading && <div className="text-xs text-gray-500">Searching…</div>}

      {results.length > 0 && (
        <ul className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-60 overflow-auto">
          {results.map((v) => (
            <li key={v.id} className="p-2 flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{v.product_name ?? v.variant_sku}</div>
                <div className="text-xs text-gray-500">
                  {v.variant_sku} · Size {v.size} {v.color ? `· ${v.color}` : ""}
                </div>
                <div className="text-xs">
                  Stock:{" "}
                  <span
                    className={
                      v.available_stock <= 0
                        ? "text-rose-600"
                        : v.available_stock < 5
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }
                  >
                    {v.available_stock}
                  </span>
                </div>
              </div>
              <input
                type="number"
                placeholder="Price"
                step="0.01"
                value={priceInput[v.id] ?? ""}
                onChange={(e) =>
                  setPriceInput({ ...priceInput, [v.id]: e.target.value })
                }
                className="w-20 px-2 py-1 text-xs border border-gray-200 rounded"
              />
              <button
                type="button"
                onClick={() => addVariant(v)}
                disabled={v.available_stock <= 0}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border border-gray-200 rounded-md">
        <div className="flex items-center justify-between p-2 border-b border-gray-100">
          <div className="text-xs font-medium text-gray-700">
            Line Items ({items.length})
          </div>
          {items.length >= 2 && (
            <button
              type="button"
              onClick={onSplitBundle}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              title="Bundle split: distribute total price evenly across all items (B1T1 COD waybill clarity)"
            >
              <Calculator size={12} /> Split bundle evenly
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">
            Add items above. The drawer can&apos;t advance without at least one line.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((it, idx) => (
              <li key={idx} className="p-2 flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{it.product_name}</div>
                  <div className="text-xs text-gray-500">
                    {it.variant_name ?? ""} {it.size ? `· ${it.size}` : ""}{" "}
                    {it.color ? `· ${it.color}` : ""}
                  </div>
                  {it.adjusted_unit_price_amount != null &&
                    it.adjusted_unit_price_amount !== it.unit_price_amount && (
                      <div className="text-[11px] text-amber-700">
                        Adjusted: ₱{it.adjusted_unit_price_amount.toFixed(2)} (was ₱
                        {it.unit_price_amount.toFixed(2)})
                      </div>
                    )}
                </div>
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) =>
                    onUpdateQty(idx, Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-14 px-2 py-1 text-xs border border-gray-200 rounded text-center"
                />
                <span className="w-20 text-right text-xs">
                  ₱{it.line_total_amount.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-gray-400 hover:text-rose-600"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
