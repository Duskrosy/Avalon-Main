"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, UserPlus, X } from "lucide-react";
import type { CustomerLite } from "./types";

type Props = {
  selected: CustomerLite | null;
  onSelect: (c: CustomerLite | null) => void;
};

// Search-result row coming back from /api/sales/customers. Local matches have
// a real `id`; Shopify-only matches arrive with `id: null` and `_source:
// "shopify"` — picking one of those triggers a POST to mirror them locally.
type CustomerSearchRow = Omit<CustomerLite, "id"> & {
  id: string | null;
  _source?: "shopify";
};

// Inline searchable combobox used for region/city/barangay. Native <select>
// has no filter, and these lists run hundreds of items long (1,650 cities,
// up to 1,500 barangays per region) — typing to narrow is non-negotiable.
type SearchableSelectProps = {
  items: Array<{ code: string; name: string; short_code?: string }>;
  value: string;
  onChange: (code: string, item: { code: string; name: string } | null) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
};

function SearchableSelect({
  items,
  value,
  onChange,
  placeholder,
  disabled,
  loading,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside closes the popover so it doesn't trap the layout.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectedLabel = useMemo(() => {
    const found = items.find((i) => i.code === value);
    if (!found) return "";
    return found.short_code
      ? `${found.short_code} · ${found.name}`
      : found.name;
  }, [items, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 200);
    return items
      .filter((i) => {
        const hay = `${i.name} ${i.short_code ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 200);
  }, [items, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setQuery("");
        }}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-left"
      >
        <span className={selectedLabel ? "" : "text-gray-400"}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>
      {open && !disabled && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
          <div className="relative border-b border-gray-100">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              autoFocus
              className="w-full pl-7 pr-2 py-1.5 text-xs focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-auto text-sm">
            {loading && (
              <li className="px-3 py-2 text-xs text-gray-500">Loading…</li>
            )}
            {!loading && filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-500">No matches</li>
            )}
            {filtered.map((i) => (
              <li key={i.code}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(i.code, i);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 ${
                    i.code === value ? "bg-blue-50 text-blue-900" : ""
                  }`}
                >
                  {i.short_code ? (
                    <>
                      <span className="font-medium">{i.short_code}</span>
                      <span className="text-gray-500 ml-1.5">{i.name}</span>
                    </>
                  ) : (
                    i.name
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function StepCustomer({ selected, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address_line_1: "",
    city_text: "",
    region_text: "",
    postal_code: "",
    region_code: "",
    city_code: "",
    barangay_code: "",
  });
  type PhItem = { code: string; name: string; short_code?: string; postal_code?: string | null };
  const [regions, setRegions] = useState<PhItem[]>([]);
  const [cities, setCities] = useState<PhItem[]>([]);
  const [barangays, setBarangays] = useState<PhItem[]>([]);
  const [phLoading, setPhLoading] = useState({ regions: false, cities: false, barangays: false });

  // Fetch regions on first render of the create form.
  useEffect(() => {
    if (!showCreate || regions.length > 0) return;
    setPhLoading((p) => ({ ...p, regions: true }));
    fetch("/api/sales/ph-address?level=region")
      .then((r) => r.json())
      .then((j) => setRegions(j.items ?? []))
      .finally(() => setPhLoading((p) => ({ ...p, regions: false })));
  }, [showCreate, regions.length]);

  // Fetch cities when region changes.
  useEffect(() => {
    if (!form.region_code) {
      setCities([]);
      return;
    }
    setPhLoading((p) => ({ ...p, cities: true }));
    fetch(`/api/sales/ph-address?level=city&parent=${form.region_code}`)
      .then((r) => r.json())
      .then((j) => setCities(j.items ?? []))
      .finally(() => setPhLoading((p) => ({ ...p, cities: false })));
  }, [form.region_code]);

  // Fetch barangays when city changes.
  useEffect(() => {
    if (!form.city_code) {
      setBarangays([]);
      return;
    }
    setPhLoading((p) => ({ ...p, barangays: true }));
    fetch(`/api/sales/ph-address?level=barangay&parent=${form.city_code}`)
      .then((r) => r.json())
      .then((j) => setBarangays(j.items ?? []))
      .finally(() => setPhLoading((p) => ({ ...p, barangays: false })));
  }, [form.city_code]);
  const [createError, setCreateError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (selected) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/sales/customers?search=${encodeURIComponent(query.trim())}`,
        );
        if (res.ok) {
          const json = await res.json();
          setResults(json.customers ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  // Picking a search result. For local rows we just hand the row to the
  // parent. For Shopify-only rows (id null, _source "shopify") we POST a
  // mirror to /api/sales/customers passing the existing shopify_customer_id
  // so we don't double-create on Shopify, then hand the resulting local row
  // to the parent.
  const handlePickResult = async (c: CustomerSearchRow) => {
    if (c.id) {
      onSelect(c as CustomerLite);
      return;
    }
    if (!c.shopify_customer_id) return;
    const key = `shopify:${c.shopify_customer_id}`;
    setImporting(key);
    try {
      const res = await fetch("/api/sales/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: c.first_name || "Customer",
          last_name: c.last_name || "(Shopify)",
          email: c.email,
          phone: c.phone,
          shopify_customer_id: c.shopify_customer_id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.customer) {
        // Surface the failure inline; reuse the existing search-loading row
        // by clearing — user can retry by re-typing.
        setResults([]);
        setQuery("");
        return;
      }
      onSelect(json.customer);
    } finally {
      setImporting(null);
    }
  };

  const submitCreate = async () => {
    setCreateError(null);
    if (!form.first_name || !form.last_name) {
      setCreateError("First and last name required");
      return;
    }
    const res = await fetch("/api/sales/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        phone: form.phone || null,
        address_line_1: form.address_line_1 || null,
        city_text: form.city_text || null,
        region_text: form.region_text || null,
        postal_code: form.postal_code || null,
        region_code: form.region_code || null,
        city_code: form.city_code || null,
        barangay_code: form.barangay_code || null,
      }),
    });
    const json = await res.json();
    if (res.status === 409) {
      setCreateError(
        `Possible duplicate: ${json.duplicates?.map((d: CustomerLite) => d.full_name).join(", ")}`,
      );
      return;
    }
    if (!res.ok) {
      setCreateError(json.error ?? "Create failed");
      return;
    }
    onSelect(json.customer);
    setShowCreate(false);
  };

  if (selected) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium text-emerald-900">{selected.full_name}</div>
            <div className="text-xs text-emerald-700/80 mt-0.5">
              {selected.phone ?? "—"} · {selected.email ?? "—"}
            </div>
            {selected.full_address && (
              <div className="text-xs text-emerald-700/70 mt-1">{selected.full_address}</div>
            )}
            {selected.total_orders_cached != null && (
              <div className="text-xs text-emerald-700/70 mt-0.5">
                {selected.total_orders_cached} prior orders
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-emerald-700/70 hover:text-emerald-900"
            aria-label="Clear selection"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, or email"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      </div>

      {loading && <div className="text-xs text-gray-500">Searching…</div>}

      {results.length > 0 && (
        <ul className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-60 overflow-auto">
          {results.map((c) => {
            const key = c.id ?? `shopify:${c.shopify_customer_id}`;
            const isShopifyOnly = c._source === "shopify";
            const isImporting = importing === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => handlePickResult(c)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-60 text-sm flex items-center justify-between"
                >
                  <span>
                    <span className="font-medium">{c.full_name}</span>
                    <span className="text-gray-500 text-xs ml-2">
                      {c.phone ?? c.email ?? ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {isShopifyOnly && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        {isImporting ? "Importing…" : "Shopify"}
                      </span>
                    )}
                    {c.total_orders_cached != null && (
                      <span className="text-xs text-gray-400">
                        {c.total_orders_cached} orders
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!showCreate ? (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 text-sm border border-dashed border-gray-300 rounded-md py-2 text-gray-600 hover:bg-gray-50"
        >
          <UserPlus size={14} /> Create new customer
        </button>
      ) : (
        <div className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="First name"
              className="input"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
            <input
              placeholder="Last name"
              className="input"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
          <input
            placeholder="Email"
            type="email"
            className="input w-full"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            placeholder="Phone (e.g. 0917 123 4567)"
            className="input w-full"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            placeholder="Street address"
            className="input w-full"
            value={form.address_line_1}
            onChange={(e) => setForm({ ...form, address_line_1: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <SearchableSelect
              items={regions}
              value={form.region_code}
              loading={phLoading.regions}
              placeholder="Region…"
              onChange={(code, item) =>
                setForm((s) => ({
                  ...s,
                  region_code: code,
                  region_text: item?.name ?? "",
                  city_code: "",
                  city_text: "",
                  barangay_code: "",
                  postal_code: "",
                }))
              }
            />
            <SearchableSelect
              items={cities}
              value={form.city_code}
              loading={phLoading.cities}
              disabled={!form.region_code}
              placeholder={
                form.region_code ? "City / Municipality…" : "Pick region first"
              }
              onChange={(code, item) =>
                setForm((s) => ({
                  ...s,
                  city_code: code,
                  city_text: item?.name ?? "",
                  barangay_code: "",
                  postal_code: "",
                }))
              }
            />
            <SearchableSelect
              items={barangays}
              value={form.barangay_code}
              loading={phLoading.barangays}
              disabled={!form.city_code}
              placeholder={form.city_code ? "Barangay…" : "Pick city first"}
              onChange={(code) => {
                const b = barangays.find((x) => x.code === code);
                setForm((s) => ({
                  ...s,
                  barangay_code: code,
                  // Auto-fill postal code when barangay has one. Agent can still
                  // override below if PSGC's postal data is missing/wrong.
                  postal_code: b?.postal_code ?? s.postal_code,
                }));
              }}
            />
          </div>
          <input
            placeholder="Postal code (auto-filled when barangay is picked)"
            className="input w-full"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
          {createError && <div className="text-xs text-rose-600">{createError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCreate}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .input {
          padding: 0.4rem 0.6rem;
          font-size: 0.8125rem;
          border: 1px solid rgb(229 231 235);
          border-radius: 0.375rem;
          background: white;
        }
        .input:focus {
          outline: 2px solid rgb(59 130 246);
          outline-offset: -1px;
        }
      `}</style>
    </div>
  );
}
