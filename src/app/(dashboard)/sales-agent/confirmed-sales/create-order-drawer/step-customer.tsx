"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import type { CustomerLite } from "./types";

type Props = {
  selected: CustomerLite | null;
  onSelect: (c: CustomerLite | null) => void;
};

export function StepCustomer({ selected, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(false);
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
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between"
              >
                <span>
                  <span className="font-medium">{c.full_name}</span>
                  <span className="text-gray-500 text-xs ml-2">
                    {c.phone ?? c.email ?? ""}
                  </span>
                </span>
                {c.total_orders_cached != null && (
                  <span className="text-xs text-gray-400">{c.total_orders_cached} orders</span>
                )}
              </button>
            </li>
          ))}
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
            <select
              className="input"
              value={form.region_code}
              onChange={(e) => {
                const code = e.target.value;
                const r = regions.find((x) => x.code === code);
                setForm((s) => ({
                  ...s,
                  region_code: code,
                  region_text: r?.name ?? "",
                  // Reset city + barangay when region changes
                  city_code: "",
                  city_text: "",
                  barangay_code: "",
                  postal_code: "",
                }));
              }}
            >
              <option value="">Region…</option>
              {phLoading.regions && <option disabled>Loading…</option>}
              {regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.short_code ? `${r.short_code} · ${r.name}` : r.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={form.city_code}
              onChange={(e) => {
                const code = e.target.value;
                const c = cities.find((x) => x.code === code);
                setForm((s) => ({
                  ...s,
                  city_code: code,
                  city_text: c?.name ?? "",
                  barangay_code: "",
                  postal_code: "",
                }));
              }}
              disabled={!form.region_code}
            >
              <option value="">{form.region_code ? "City / Municipality…" : "Pick region first"}</option>
              {phLoading.cities && <option disabled>Loading…</option>}
              {cities.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={form.barangay_code}
              onChange={(e) => {
                const code = e.target.value;
                const b = barangays.find((x) => x.code === code);
                setForm((s) => ({
                  ...s,
                  barangay_code: code,
                  // Auto-fill postal code when barangay has one. Agent can still
                  // override below if PSGC's postal data is missing/wrong.
                  postal_code: b?.postal_code ?? s.postal_code,
                }));
              }}
              disabled={!form.city_code}
            >
              <option value="">{form.city_code ? "Barangay…" : "Pick city first"}</option>
              {phLoading.barangays && <option disabled>Loading…</option>}
              {barangays.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
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
