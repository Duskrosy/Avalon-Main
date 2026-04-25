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
  });
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
            <input
              placeholder="Region"
              className="input"
              value={form.region_text}
              onChange={(e) => setForm({ ...form, region_text: e.target.value })}
            />
            <input
              placeholder="City"
              className="input"
              value={form.city_text}
              onChange={(e) => setForm({ ...form, city_text: e.target.value })}
            />
            <input
              placeholder="Postal"
              className="input"
              value={form.postal_code}
              onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
            />
          </div>
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
