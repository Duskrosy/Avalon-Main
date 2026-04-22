"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type InventoryLocation = {
  id: string;
  location_code: string;
  location_name: string;
  location_type: "source" | "platform" | "onhand" | "store";
  is_source: boolean;
  sort_order: number;
};

export type VariantSearchResult = {
  id: string;
  variant_sku: string;
  size_code: string;
  size_label: string;
  color: { id: string; color_code: string; color_name: string };
  product: { id: string; parent_sku: string; name: string; product_family: string | null };
};

export type LocationBalance = {
  on_hand: number;
  reserved: number;
  available: number;
  row_version: number;
};

export type InventoryRow = {
  variant_id: string;
  variant_sku: string;
  size_code: string;
  size_label: string;
  color_code: string;
  color_name: string;
  product_id: string;
  parent_sku: string;
  product_name: string;
  product_family: string | null;
  balances: Record<string, LocationBalance>;
};

export type WorkflowConfig = {
  title: string;
  description: string;
  movementType:
    | "initial_stock"
    | "allocate"
    | "return_pending"
    | "return_verified"
    | "restock_source"
    | "reallocate"
    | "adjustment"
    | "manual_correction"
    | "damage_writeoff";
  requireFrom: boolean;
  requireTo: boolean;
  fromFilter?: (loc: InventoryLocation) => boolean;
  toFilter?: (loc: InventoryLocation) => boolean;
  defaultFromCode?: string;
  defaultToCode?: string;
  reasonOptions?: Array<{ value: string; label: string }>;
  submitLabel: string;
};

type Props = {
  config: WorkflowConfig;
  locations: InventoryLocation[];
  onSuccess?: (movementId: string) => void;
};

export function GuidedMovementWorkflow({ config, locations, onSuccess }: Props) {
  const [step, setStep] = useState(1);
  const [variantQuery, setVariantQuery] = useState("");
  const [variantResults, setVariantResults] = useState<VariantSearchResult[]>([]);
  const [variant, setVariant] = useState<VariantSearchResult | null>(null);
  const [variantBalances, setVariantBalances] = useState<Record<string, LocationBalance>>({});

  const defaultFromId = useMemo(
    () => locations.find((l) => l.location_code === config.defaultFromCode)?.id ?? "",
    [locations, config.defaultFromCode]
  );
  const defaultToId = useMemo(
    () => locations.find((l) => l.location_code === config.defaultToCode)?.id ?? "",
    [locations, config.defaultToCode]
  );
  const [fromId, setFromId] = useState(defaultFromId);
  const [toId, setToId] = useState(defaultToId);
  useEffect(() => setFromId(defaultFromId), [defaultFromId]);
  useEffect(() => setToId(defaultToId), [defaultToId]);

  const [quantity, setQuantity] = useState<string>("");
  const [reasonCode, setReasonCode] = useState<string>(
    config.reasonOptions?.[0]?.value ?? ""
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // Typeahead: debounced variant search.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (variant) return;
    if (variantQuery.trim().length < 2) {
      setVariantResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(
        `/api/inventory/variants?q=${encodeURIComponent(variantQuery.trim())}`
      );
      if (!res.ok) return;
      const json = (await res.json()) as { data: VariantSearchResult[] };
      setVariantResults(json.data);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [variantQuery, variant]);

  // Pull the chosen variant's per-location balances for the preview.
  useEffect(() => {
    if (!variant) {
      setVariantBalances({});
      return;
    }
    (async () => {
      const res = await fetch(`/api/inventory?variant_id=${variant.id}`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: InventoryRow[] };
      setVariantBalances(json.data[0]?.balances ?? {});
    })();
  }, [variant]);

  const fromOptions = useMemo(
    () =>
      locations
        .filter((l) => (config.fromFilter ? config.fromFilter(l) : true))
        .sort((a, b) => a.sort_order - b.sort_order),
    [locations, config.fromFilter]
  );
  const toOptions = useMemo(
    () =>
      locations
        .filter((l) => (config.toFilter ? config.toFilter(l) : true))
        .sort((a, b) => a.sort_order - b.sort_order),
    [locations, config.toFilter]
  );

  const canSubmit =
    !!variant &&
    Number(quantity) > 0 &&
    (!config.requireFrom || !!fromId) &&
    (!config.requireTo || !!toId);

  const submit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    const fromCode = locations.find((l) => l.id === fromId)?.location_code;
    const toCode = locations.find((l) => l.id === toId)?.location_code;
    const fromBal = fromCode ? variantBalances[fromCode] : undefined;
    const toBal = toCode ? variantBalances[toCode] : undefined;

    const payload = {
      product_variant_id: variant!.id,
      from_location_id: config.requireFrom ? fromId : null,
      to_location_id: config.requireTo ? toId : null,
      movement_type: config.movementType,
      quantity: Number(quantity),
      reason_code: reasonCode || null,
      notes: notes.trim() || null,
      expected_from_version: fromBal?.row_version ?? null,
      expected_to_version: toBal?.row_version ?? null,
    };

    const res = await fetch("/api/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as { data?: string; error?: string };
    if (!res.ok || !json.data) {
      setError(json.error ?? "Submission failed");
      setSubmitting(false);
      return;
    }

    setSuccessId(json.data);
    setSubmitting(false);
    onSuccess?.(json.data);
  }, [
    canSubmit,
    submitting,
    variant,
    fromId,
    toId,
    variantBalances,
    locations,
    config,
    quantity,
    reasonCode,
    notes,
    onSuccess,
  ]);

  const reset = () => {
    setStep(1);
    setVariant(null);
    setVariantQuery("");
    setVariantResults([]);
    setVariantBalances({});
    setQuantity("");
    setReasonCode(config.reasonOptions?.[0]?.value ?? "");
    setNotes("");
    setError(null);
    setSuccessId(null);
    setFromId(defaultFromId);
    setToId(defaultToId);
  };

  if (successId) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="rounded-md border border-green-300 bg-green-50 p-4">
          <h2 className="font-semibold text-green-800">Movement recorded</h2>
          <p className="text-sm text-green-700 mt-1">
            ID: <code className="font-mono text-xs">{successId}</code>
          </p>
        </div>
        <button
          onClick={reset}
          className="rounded-md bg-black text-white px-4 py-2 text-sm"
        >
          Record another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{config.title}</h1>
        <p className="text-sm text-neutral-600">{config.description}</p>
      </header>

      <ol className="flex gap-2 text-xs">
        {[1, 2, 3].map((n) => (
          <li
            key={n}
            className={`flex-1 h-1 rounded ${
              step >= n ? "bg-black" : "bg-neutral-200"
            }`}
          />
        ))}
      </ol>

      {/* Step 1: pick a variant */}
      {step === 1 && (
        <section className="space-y-3">
          <label className="block text-sm font-medium">Find variant (SKU or name)</label>
          <input
            autoFocus
            value={variantQuery}
            onChange={(e) => {
              setVariantQuery(e.target.value);
              setVariant(null);
            }}
            placeholder="e.g. VEST-NAVY-M"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          {variantResults.length > 0 && !variant && (
            <ul className="border border-neutral-200 rounded-md divide-y max-h-72 overflow-auto">
              {variantResults.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => {
                      setVariant(v);
                      setVariantQuery(v.variant_sku);
                      setVariantResults([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-sm"
                  >
                    <div className="font-mono">{v.variant_sku}</div>
                    <div className="text-xs text-neutral-500">
                      {v.product.name} · {v.color.color_name} · {v.size_label}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {variant && (
            <div className="rounded-md border border-neutral-200 p-3 text-sm bg-neutral-50">
              <div className="font-mono">{variant.variant_sku}</div>
              <div className="text-xs text-neutral-600 mt-1">
                {variant.product.name} · {variant.color.color_name} · {variant.size_label}
              </div>
              {Object.keys(variantBalances).length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(variantBalances).map(([code, b]) => (
                    <div
                      key={code}
                      className="rounded border border-neutral-200 bg-white px-2 py-1"
                    >
                      <div className="font-medium">{code}</div>
                      <div className="text-neutral-600">avail {b.available}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <button
              disabled={!variant}
              onClick={() => setStep(2)}
              className="rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </section>
      )}

      {/* Step 2: quantity + locations + reason + notes */}
      {step === 2 && variant && (
        <section className="space-y-4">
          {config.requireFrom && (
            <div>
              <label className="block text-sm font-medium mb-1">From location</label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {fromOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.location_code} · {l.location_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {config.requireTo && (
            <div>
              <label className="block text-sm font-medium mb-1">To location</label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {toOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.location_code} · {l.location_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          {config.reasonOptions && config.reasonOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Reason</label>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                {config.reasonOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
            >
              Back
            </button>
            <button
              disabled={!canSubmit}
              onClick={() => setStep(3)}
              className="rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-40"
            >
              Review
            </button>
          </div>
        </section>
      )}

      {/* Step 3: review + submit */}
      {step === 3 && variant && (
        <section className="space-y-4">
          <dl className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm grid grid-cols-[120px_1fr] gap-y-2">
            <dt className="text-neutral-500">Variant</dt>
            <dd className="font-mono">{variant.variant_sku}</dd>
            <dt className="text-neutral-500">Movement</dt>
            <dd>{config.movementType}</dd>
            {config.requireFrom && (
              <>
                <dt className="text-neutral-500">From</dt>
                <dd>
                  {locations.find((l) => l.id === fromId)?.location_code ?? "—"}
                </dd>
              </>
            )}
            {config.requireTo && (
              <>
                <dt className="text-neutral-500">To</dt>
                <dd>{locations.find((l) => l.id === toId)?.location_code ?? "—"}</dd>
              </>
            )}
            <dt className="text-neutral-500">Quantity</dt>
            <dd>{quantity}</dd>
            {reasonCode && (
              <>
                <dt className="text-neutral-500">Reason</dt>
                <dd>{reasonCode}</dd>
              </>
            )}
            {notes && (
              <>
                <dt className="text-neutral-500">Notes</dt>
                <dd className="whitespace-pre-wrap">{notes}</dd>
              </>
            )}
          </dl>

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              disabled={submitting}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-40"
            >
              {submitting ? "Submitting…" : config.submitLabel}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
