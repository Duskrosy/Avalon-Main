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

// City picker that switches modes by whether a region is set:
//   - region set → client-side filter on the already-loaded city list
//   - no region  → server-side global search across all cities + sub-munis
// Picking a row hands a structured payload to the parent so it can fill
// region / city / sub-muni in one go.
type CityPickItem = {
  code: string;
  name: string;
  region_code?: string;
  parent_city_code?: string | null;
  parent_city_name?: string | null;
};
type CityPickerProps = {
  /** Cities loaded for the currently-picked region. Used when regionCode set. */
  regionCities: Array<CityPickItem & { has_submunicipalities?: boolean }>;
  regionCode: string;
  pickedCityCode: string;
  pickedCityLabel: string;
  /** Region lookup so each row can show its region (e.g. "R-V") on the right. */
  regionLookup: Map<string, { short_code?: string; name: string }>;
  loading?: boolean;
  onPick: (item: CityPickItem) => void;
};

function CityPicker({
  regionCities,
  regionCode,
  pickedCityCode,
  pickedCityLabel,
  regionLookup,
  loading,
  onPick,
}: CityPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<CityPickItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Global server-side search runs only when no region is locked in.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (regionCode) {
      setRemoteResults([]);
      return;
    }
    if (query.trim().length < 2) {
      setRemoteResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setRemoteLoading(true);
      try {
        const res = await fetch(
          `/api/sales/ph-address?level=city&q=${encodeURIComponent(query.trim())}`,
        );
        if (res.ok) {
          const json = await res.json();
          setRemoteResults((json.items ?? []) as CityPickItem[]);
        }
      } finally {
        setRemoteLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, regionCode]);

  const list: CityPickItem[] = useMemo(() => {
    if (regionCode) {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? regionCities.filter((c) => c.name.toLowerCase().includes(q))
        : regionCities;
      return filtered.slice(0, 200);
    }
    return remoteResults;
  }, [regionCode, regionCities, query, remoteResults]);

  const placeholder = regionCode
    ? "City / Municipality… (type to filter)"
    : "Type a city, sub-municipality, or municipality";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 text-left"
      >
        <span className={pickedCityLabel ? "" : "text-gray-400"}>
          {pickedCityLabel ||
            (regionCode ? "City / Municipality…" : "Search any city…")}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>
      {open && (
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
              placeholder={placeholder}
              autoFocus
              className="w-full pl-7 pr-2 py-1.5 text-xs focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-auto text-sm">
            {(loading || remoteLoading) && (
              <li className="px-3 py-2 text-xs text-gray-500">Loading…</li>
            )}
            {!loading && !remoteLoading && list.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-500">
                {!regionCode && query.trim().length < 2
                  ? "Type 2+ characters to search…"
                  : "No matches"}
              </li>
            )}
            {list.map((c) => {
              const isSubMuniGlobal = !regionCode && !!c.parent_city_code;
              // Region label on the right — only shown for global search,
              // since region-scoped picks are already inside one region.
              const regionInfo =
                !regionCode && c.region_code
                  ? regionLookup.get(c.region_code)
                  : null;
              const regionLabel = regionInfo
                ? (regionInfo.short_code ?? regionInfo.name)
                : null;
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(c);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center justify-between gap-2 ${
                      c.code === pickedCityCode ? "bg-blue-50 text-blue-900" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{c.name}</span>
                      {isSubMuniGlobal && c.parent_city_name && (
                        <span className="text-gray-500 ml-1.5 text-xs">
                          in {c.parent_city_name}
                        </span>
                      )}
                    </span>
                    {regionLabel && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                        {regionLabel}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
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
  const [saving, setSaving] = useState(false);
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
    // Sub-municipality (Manila districts: Sampaloc, Tondo I, Binondo …).
    // When set, this is the level the courier cares about — it overrides
    // city_text on save so customers.city_text reads "Sampaloc", and the
    // saved customers.city_code is the sub-muni's PSGC code (which is
    // also the parent of the chosen barangay in ph_barangays).
    sub_municipality_code: "",
    barangay_code: "",
  });
  // Snapshot of the form at pick-time, used to compute the "dirty" badge
  // and to know when to show "Save changes" vs hide the button.
  const [pristine, setPristine] = useState(form);
  // Track which selected.id we've already filled the form from, so a stale
  // form doesn't get clobbered after the user starts editing.
  const filledFromIdRef = useRef<string | null>(null);
  type PhItem = {
    code: string;
    name: string;
    short_code?: string;
    postal_code?: string | null;
    /** True when this city has folded sub-munis (Manila → Sampaloc, …). */
    has_submunicipalities?: boolean;
    region_code?: string;
    parent_city_code?: string | null;
    parent_city_name?: string | null;
  };
  const [regions, setRegions] = useState<PhItem[]>([]);
  const [cities, setCities] = useState<PhItem[]>([]);
  const [subMunis, setSubMunis] = useState<PhItem[]>([]);
  const [barangays, setBarangays] = useState<PhItem[]>([]);
  const [phLoading, setPhLoading] = useState({
    regions: false,
    cities: false,
    subMunis: false,
    barangays: false,
  });

  // Fetch regions on mount — the form is always visible now, so we always
  // need the region list ready.
  useEffect(() => {
    if (regions.length > 0) return;
    setPhLoading((p) => ({ ...p, regions: true }));
    fetch("/api/sales/ph-address?level=region")
      .then((r) => r.json())
      .then((j) => setRegions(j.items ?? []))
      .finally(() => setPhLoading((p) => ({ ...p, regions: false })));
  }, [regions.length]);

  // When `selected` changes (parent picked a customer, or it was cleared),
  // fill the form with that customer's fields. We also snapshot the values
  // into `pristine` so we can detect dirty edits below. We only re-fill on
  // id change so an active edit doesn't get clobbered.
  useEffect(() => {
    if (!selected) {
      // Cleared — reset form to blanks and stop tracking a fill source.
      filledFromIdRef.current = null;
      const blank = {
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
        sub_municipality_code: "",
        barangay_code: "",
      };
      setForm(blank);
      setPristine(blank);
      return;
    }
    if (filledFromIdRef.current === selected.id) return;
    filledFromIdRef.current = selected.id;
    const next = {
      first_name: selected.first_name ?? "",
      last_name: selected.last_name ?? "",
      email: selected.email ?? "",
      phone: selected.phone ?? "",
      address_line_1: selected.address_line_1 ?? "",
      city_text: selected.city_text ?? "",
      region_text: selected.region_text ?? "",
      postal_code: selected.postal_code ?? "",
      region_code: selected.region_code ?? "",
      // For now we only re-fill the cascade with what's stored on the
      // customer. If their saved city_code is actually a sub-muni (e.g.
      // Sampaloc), the city slot will look empty in the picker until they
      // re-pick — but the saved text fields (city_text/region_text) keep
      // the order's address correct in the meantime.
      city_code: selected.city_code ?? "",
      sub_municipality_code: "",
      barangay_code: selected.barangay_code ?? "",
    };
    setForm(next);
    setPristine(next);
  }, [selected]);

  // Fetch cities (top-level only) when region changes.
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

  // Fetch sub-munis when the picked city has them (Manila → Sampaloc, …).
  // Cleared whenever the city changes.
  const pickedCity = cities.find((c) => c.code === form.city_code);
  const cityHasSubMunis = pickedCity?.has_submunicipalities === true;
  useEffect(() => {
    if (!form.city_code || !cityHasSubMunis) {
      setSubMunis([]);
      return;
    }
    setPhLoading((p) => ({ ...p, subMunis: true }));
    fetch(
      `/api/sales/ph-address?level=submunicipality&parent=${form.city_code}`,
    )
      .then((r) => r.json())
      .then((j) => setSubMunis(j.items ?? []))
      .finally(() => setPhLoading((p) => ({ ...p, subMunis: false })));
  }, [form.city_code, cityHasSubMunis]);

  // Fetch barangays. Parent is the sub-muni when the picked city has one
  // and the agent has chosen it; otherwise it's the city itself. (Manila's
  // barangays sit under sub-munis, not under "City of Manila".)
  const barangayParent = cityHasSubMunis
    ? form.sub_municipality_code
    : form.city_code;
  useEffect(() => {
    if (!barangayParent) {
      setBarangays([]);
      return;
    }
    setPhLoading((p) => ({ ...p, barangays: true }));
    fetch(`/api/sales/ph-address?level=barangay&parent=${barangayParent}`)
      .then((r) => r.json())
      .then((j) => setBarangays(j.items ?? []))
      .finally(() => setPhLoading((p) => ({ ...p, barangays: false })));
  }, [barangayParent]);
  const [createError, setCreateError] = useState<string | null>(null);
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
  }, [query]);

  // Picking a search result. For local rows we just hand the row to the
  // parent. For Shopify-only rows (id null, _source "shopify") we POST a
  // mirror to /api/sales/customers passing the existing shopify_customer_id
  // so we don't double-create on Shopify, then hand the resulting local row
  // to the parent.
  const handlePickResult = async (c: CustomerSearchRow) => {
    if (c.id) {
      onSelect(c as CustomerLite);
      setQuery("");
      setResults([]);
      return;
    }
    if (!c.shopify_customer_id) return;
    const key = `shopify:${c.shopify_customer_id}`;
    setImporting(key);
    try {
      // Carry the address fields forward when claiming a Shopify-only
      // customer so the local mirror starts populated.
      const res = await fetch("/api/sales/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: c.first_name || "Customer",
          last_name: c.last_name || "(Shopify)",
          email: c.email,
          phone: c.phone,
          address_line_1: c.address_line_1 ?? null,
          city_text: c.city_text ?? null,
          region_text: c.region_text ?? null,
          postal_code: c.postal_code ?? null,
          full_address: c.full_address ?? null,
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
      // For Shopify-only imports, fold Shopify's orders_count into the
      // returned local row so the UI reflects lifetime orders right away
      // (the local total_orders_cached defaults to 0 and isn't backfilled).
      const enriched: CustomerLite = {
        ...json.customer,
        total_orders_cached:
          c.total_orders_cached ?? json.customer.total_orders_cached ?? null,
      };
      onSelect(enriched);
      setQuery("");
      setResults([]);
    } finally {
      setImporting(null);
    }
  };

  // Unified save:
  //   - selected (existing customer) → PATCH /api/sales/customers/[id]
  //   - no selected → POST /api/sales/customers (create)
  const submitForm = async () => {
    setCreateError(null);
    if (!form.first_name || !form.last_name) {
      setCreateError("First and last name required");
      return;
    }
    setSaving(true);
    try {
      // When a sub-muni is picked, store the sub-muni's code as city_code
      // and the sub-muni's name as city_text — that's the level couriers
      // address to ("Sampaloc, Manila"). The chartered city's identity is
      // recoverable from ph_cities.parent_city_code if ever needed.
      const effectiveCityCode =
        form.sub_municipality_code || form.city_code || null;
      const effectiveCityText = form.sub_municipality_code
        ? (subMunis.find((s) => s.code === form.sub_municipality_code)?.name ??
          form.city_text)
        : form.city_text;
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        phone: form.phone || null,
        address_line_1: form.address_line_1 || null,
        city_text: effectiveCityText || null,
        region_text: form.region_text || null,
        postal_code: form.postal_code || null,
        region_code: form.region_code || null,
        city_code: effectiveCityCode,
        barangay_code: form.barangay_code || null,
      };
      const res = selected?.id
        ? await fetch(`/api/sales/customers/${selected.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/sales/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (res.status === 409) {
        setCreateError(
          `Possible duplicate: ${json.duplicates?.map((d: CustomerLite) => d.full_name).join(", ")}`,
        );
        return;
      }
      if (!res.ok) {
        setCreateError(json.error ?? "Save failed");
        return;
      }
      // Preserve orders_count if the server response doesn't include one
      // (PATCH response carries total_orders_cached; create leaves it 0).
      const next: CustomerLite = {
        ...json.customer,
        total_orders_cached:
          json.customer.total_orders_cached ??
          selected?.total_orders_cached ??
          null,
      };
      onSelect(next);
      // Snapshot fresh values so dirty state resets.
      setPristine({
        first_name: next.first_name ?? "",
        last_name: next.last_name ?? "",
        email: next.email ?? "",
        phone: next.phone ?? "",
        address_line_1: next.address_line_1 ?? "",
        city_text: next.city_text ?? "",
        region_text: next.region_text ?? "",
        postal_code: next.postal_code ?? "",
        region_code: next.region_code ?? "",
        city_code: next.city_code ?? "",
        // sub_municipality_code is a UI-only step — it gets folded into
        // city_code at save time, so the pristine snapshot stays empty.
        sub_municipality_code: "",
        barangay_code: next.barangay_code ?? "",
      });
      filledFromIdRef.current = next.id;
    } finally {
      setSaving(false);
    }
  };

  const isDirty = (
    Object.keys(form) as Array<keyof typeof form>
  ).some((k) => form[k] !== pristine[k]);

  // Map region code → { short_code, name } so the city picker can show the
  // region of each global-search result (e.g. "Dolores · CAR" vs
  // "Dolores · R-IV-A") when several cities share the same name.
  const regionLookup = useMemo(() => {
    const m = new Map<string, { short_code?: string; name: string }>();
    for (const r of regions) {
      m.set(r.code, { short_code: r.short_code, name: r.name });
    }
    return m;
  }, [regions]);

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

      {selected && (
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-emerald-900">
              Editing: {selected.full_name}
            </span>
            {selected.total_orders_cached != null &&
              selected.total_orders_cached > 0 && (
                <span className="text-emerald-700/80">
                  · {selected.total_orders_cached} prior order
                  {selected.total_orders_cached === 1 ? "" : "s"}
                </span>
              )}
            {isDirty && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                Unsaved changes
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-emerald-700/70 hover:text-emerald-900"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading && <div className="text-xs text-gray-500">Searching…</div>}

      {results.length > 0 && (
        <ul className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-60 overflow-auto">
          {results.map((c) => {
            const key = c.id ?? `shopify:${c.shopify_customer_id}`;
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
                    {c.total_orders_cached != null &&
                      c.total_orders_cached > 0 && (
                        <span className="text-xs text-gray-400">
                          {c.total_orders_cached} order
                          {c.total_orders_cached === 1 ? "" : "s"}
                        </span>
                      )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 flex items-center gap-1.5">
          <UserPlus size={11} />
          {selected ? "Customer details" : "New customer details"}
        </div>
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
          <div className="grid grid-cols-2 gap-2">
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
                  sub_municipality_code: "",
                  barangay_code: "",
                  postal_code: "",
                }))
              }
            />
            <CityPicker
              regionCities={cities}
              regionCode={form.region_code}
              regionLookup={regionLookup}
              pickedCityCode={form.city_code}
              pickedCityLabel={
                form.city_code
                  ? (cities.find((c) => c.code === form.city_code)?.name ??
                    form.city_text ??
                    "")
                  : ""
              }
              loading={phLoading.cities}
              onPick={(item) => {
                // Sub-muni picked from global search → fold up to its parent
                // city for the city slot, set the sub-muni code separately.
                if (!form.region_code && item.parent_city_code) {
                  const r = regions.find((x) => x.code === item.region_code);
                  setForm((s) => ({
                    ...s,
                    region_code: item.region_code ?? "",
                    region_text: r?.name ?? s.region_text,
                    city_code: item.parent_city_code ?? "",
                    city_text: item.parent_city_name ?? "",
                    sub_municipality_code: item.code,
                    barangay_code: "",
                    postal_code: "",
                  }));
                  return;
                }
                // Top-level city picked (either globally or from the
                // region-scoped list).
                if (!form.region_code && item.region_code) {
                  const r = regions.find((x) => x.code === item.region_code);
                  setForm((s) => ({
                    ...s,
                    region_code: item.region_code ?? "",
                    region_text: r?.name ?? s.region_text,
                    city_code: item.code,
                    city_text: item.name,
                    sub_municipality_code: "",
                    barangay_code: "",
                    postal_code: "",
                  }));
                  return;
                }
                setForm((s) => ({
                  ...s,
                  city_code: item.code,
                  city_text: item.name,
                  sub_municipality_code: "",
                  barangay_code: "",
                  postal_code: "",
                }));
              }}
            />
          </div>
          {cityHasSubMunis && (
            <SearchableSelect
              items={subMunis}
              value={form.sub_municipality_code}
              loading={phLoading.subMunis}
              placeholder={`Sub-municipality of ${pickedCity?.name ?? "city"}…`}
              onChange={(code, item) =>
                setForm((s) => ({
                  ...s,
                  sub_municipality_code: code,
                  // Sub-muni name overrides city_text — that's the level
                  // couriers address to.
                  city_text: item?.name ?? s.city_text,
                  barangay_code: "",
                  postal_code: "",
                }))
              }
            />
          )}
          <SearchableSelect
            items={barangays}
            value={form.barangay_code}
            loading={phLoading.barangays}
            disabled={
              cityHasSubMunis
                ? !form.sub_municipality_code
                : !form.city_code
            }
            placeholder={
              cityHasSubMunis
                ? form.sub_municipality_code
                  ? "Barangay…"
                  : "Pick sub-municipality first"
                : form.city_code
                  ? "Barangay…"
                  : "Pick city first"
            }
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
          <input
            placeholder="Postal code (auto-filled when barangay is picked)"
            className="input w-full"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
          {createError && <div className="text-xs text-rose-600">{createError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            {!selected && (
              <button
                type="button"
                disabled={saving || !form.first_name || !form.last_name}
                onClick={submitForm}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Creating…" : "Create customer"}
              </button>
            )}
            {selected && isDirty && (
              <button
                type="button"
                disabled={saving}
                onClick={submitForm}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            )}
          </div>
        </div>

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
