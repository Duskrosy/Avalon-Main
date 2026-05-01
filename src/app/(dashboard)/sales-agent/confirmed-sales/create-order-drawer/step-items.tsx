"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trash2, Calculator, Edit3, Loader2 } from "lucide-react";
import type { DrawerLineItem } from "./types";

type Family = { product_name: string; sku_count: number };

// Module-level cache for /api/sales/products/families. 5-minute TTL — Shopify
// product list doesn't change minute-to-minute, and cold-start cost on
// repeated drawer opens is the actual pain.
type FamilyCacheEntry = { at: number; data: Family[] };
const FAMILIES_CACHE = new Map<string, FamilyCacheEntry>();
const FAMILIES_TTL_MS = 5 * 60_000;
type SizeOption = { value: string; stock: number };
type ColorOption = { value: string; stock: number };
type Variant = {
  variant_id: string;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  price: number;
  image_url: string | null;
  stock: number;
};
type VariantsResponse = {
  sizes: SizeOption[];
  colors: ColorOption[];
  variantsByCombo: Record<string, Variant>;
};

type Props = {
  items: DrawerLineItem[];
  onAdd: (item: DrawerLineItem) => void;
  onRemove: (idx: number) => void;
  onUpdateQty: (idx: number, qty: number) => void;
  onSplitBundle: () => void;
};

export function StepItems({
  items,
  onAdd,
  onRemove,
  onUpdateQty,
  onSplitBundle,
}: Props) {
  // ── Family search ──────────────────────────────────────────────
  const [familyQuery, setFamilyQuery] = useState("");
  const [families, setFamilies] = useState<Family[]>([]);
  const [pickedFamily, setPickedFamily] = useState<string | null>(null);
  const [loadingFamilies, setLoadingFamilies] = useState(false);

  useEffect(() => {
    // Cache hit — instant render, no spinner.
    const cached = FAMILIES_CACHE.get(familyQuery);
    if (cached && Date.now() - cached.at < FAMILIES_TTL_MS) {
      setFamilies(cached.data);
      setLoadingFamilies(false);
      return;
    }
    setLoadingFamilies(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (familyQuery) params.set("q", familyQuery);
      fetch(`/api/sales/products/families?${params.toString()}`)
        .then((r) => r.json())
        .then((j) => {
          const list = (j.families ?? []) as Family[];
          FAMILIES_CACHE.set(familyQuery, { at: Date.now(), data: list });
          setFamilies(list);
        })
        .catch(() => setFamilies([]))
        .finally(() => setLoadingFamilies(false));
    }, 200);
    return () => clearTimeout(t);
  }, [familyQuery]);

  // ── Variants for the picked family ────────────────────────────
  const [variants, setVariants] = useState<VariantsResponse | null>(null);
  useEffect(() => {
    if (!pickedFamily) {
      setVariants(null);
      return;
    }
    fetch(`/api/sales/products/variants?product_name=${encodeURIComponent(pickedFamily)}`)
      .then((r) => r.json())
      .then((j) => setVariants(j as VariantsResponse))
      .catch(() => setVariants(null));
  }, [pickedFamily]);

  // ── Picker selection state ────────────────────────────────────
  const [pickedSize, setPickedSize] = useState<string | null>(null);
  const [pickedColor, setPickedColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const pickedVariant: Variant | null = useMemo(() => {
    if (!variants || !pickedSize || !pickedColor) return null;
    return variants.variantsByCombo[`${pickedSize}|${pickedColor}`] ?? null;
  }, [variants, pickedSize, pickedColor]);

  const handleAdd = useCallback(() => {
    if (!pickedFamily || !pickedVariant) return;
    onAdd({
      product_variant_id: null,
      shopify_product_id: pickedVariant.shopify_product_id,
      shopify_variant_id: pickedVariant.shopify_variant_id,
      product_name: pickedFamily,
      variant_name: `${pickedSize} / ${pickedColor}`,
      image_url: pickedVariant.image_url,
      size: pickedSize,
      color: pickedColor,
      quantity: qty,
      unit_price_amount: pickedVariant.price,
      adjusted_unit_price_amount: null,
      line_total_amount: pickedVariant.price * qty,
      available_stock: pickedVariant.stock,
    });
    // Reset for next add — keep the picked family.
    setPickedSize(null);
    setPickedColor(null);
    setQty(1);
  }, [pickedFamily, pickedVariant, pickedSize, pickedColor, qty, onAdd]);

  return (
    <div className="space-y-4">
      {/* Family search */}
      {!pickedFamily ? (
        <div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              type="search"
              value={familyQuery}
              onChange={(e) => setFamilyQuery(e.target.value)}
              placeholder={familyQuery ? "Searching…" : "Search families…"}
              className="w-full pl-9 px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
            />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto border border-[var(--color-border-secondary)] rounded-md">
            {loadingFamilies && families.length === 0 && (
              <div className="p-2 text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                Searching…
              </div>
            )}
            {!loadingFamilies && families.length === 0 && (
              <div className="p-2 text-xs text-[var(--color-text-tertiary)]">
                {familyQuery ? "No families match" : "No families yet"}
              </div>
            )}
            {families.map((f) => (
              <button
                type="button"
                key={f.product_name}
                onClick={() => setPickedFamily(f.product_name)}
                className="w-full text-left px-2 py-1.5 hover:bg-[var(--color-surface-hover)] text-xs"
              >
                <span className="font-medium">{f.product_name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-md">
            <span className="text-xs">Picked:</span>
            <span className="text-xs font-medium">{pickedFamily}</span>
            <button
              type="button"
              onClick={() => {
                setPickedFamily(null);
                setPickedSize(null);
                setPickedColor(null);
              }}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)]"
            >
              <Edit3 size={11} /> change
            </button>
          </div>

          {!variants ? (
            <div className="text-xs text-[var(--color-text-tertiary)]">Loading sizes…</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {variants.sizes.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">Size</label>
                  <select
                    value={pickedSize ?? ""}
                    onChange={(e) => setPickedSize(e.target.value || null)}
                    className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
                  >
                    <option value="">— Select —</option>
                    {variants.sizes.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.value} ({s.stock})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {variants.colors.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">Color</label>
                  <select
                    value={pickedColor ?? ""}
                    onChange={(e) => setPickedColor(e.target.value || null)}
                    className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
                  >
                    <option value="">— Select —</option>
                    {variants.colors.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.value} ({c.stock})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {pickedVariant?.image_url && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pickedVariant.image_url}
                alt={pickedFamily ?? ""}
                className="w-20 h-14 object-cover rounded border border-[var(--color-border-primary)]"
              />
              <span>{pickedSize} / {pickedColor} · ₱{pickedVariant.price.toFixed(2)}</span>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="w-24">
              <label className="text-xs font-medium text-[var(--color-text-primary)] block mb-1">Qty</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 text-sm border border-[var(--color-border-primary)] rounded-md"
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!pickedVariant}
              className="px-3 py-2 text-xs bg-blue-600 text-[var(--color-text-inverted)] rounded-md disabled:opacity-50"
            >
              + Add to order
            </button>
          </div>
          {pickedSize && pickedColor && !pickedVariant && (
            <div className="text-[11px] text-[var(--color-error)]">
              No variant for size {pickedSize} / {pickedColor}
            </div>
          )}
        </>
      )}

      {/* Order items list */}
      {items.length > 0 && (
        <div className="border-t border-[var(--color-border-secondary)] pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-[var(--color-text-primary)]">In this order</div>
            {items.length >= 2 && (
              <button
                type="button"
                onClick={onSplitBundle}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)]"
              >
                <Calculator size={12} /> Split bundle evenly
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{it.product_name}</div>
                  <div className="text-[var(--color-text-secondary)] truncate">
                    {it.variant_name ?? ""}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) =>
                    onUpdateQty(idx, Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-14 px-2 py-1 text-xs border border-[var(--color-border-primary)] rounded"
                />
                <span className="w-20 text-right tabular-nums">
                  ₱{it.line_total_amount.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-[var(--color-error)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
