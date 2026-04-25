"use client";

import { useEffect, useState } from "react";
import { Check, Edit2, MapPin, Star, X } from "lucide-react";

// ─── AddressBookModal ────────────────────────────────────────────────────────
//
// Modal for browsing every saved Shopify address on a customer. Three
// per-card actions:
//   - Use this for the order  →  fills the parent form, closes the modal
//   - Edit                    →  inline editor, PATCHes Shopify
//   - Set as default          →  POSTs Shopify default; the chip on the
//                                card flips to "Default" on the next reload
//
// "Selected" (the one the agent will use for this order) is tracked in
// local state until they hit Use this — that picks it for the order. The
// default address gets a star + "Default" pill so it's visually distinct
// from the selected indicator (a check + "Selected" pill).

export type AddressBookEntry = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  phone?: string | null;
  country?: string | null;
  default?: boolean;
};

export type AddressFormFill = {
  address_line_1: string;
  address_line_2: string;
  city_text: string;
  postal_code: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  customerId: string;
  /** Called when the agent picks an address to use for the current order. */
  onSelect: (a: AddressFormFill) => void;
};

export function AddressBookModal({
  open,
  onClose,
  customerId,
  onSelect,
}: Props) {
  const [addresses, setAddresses] = useState<AddressBookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    address1: string;
    address2: string;
    city: string;
    zip: string;
  }>({ address1: "", address2: "", city: "", zip: "" });

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sales/customers/${customerId}/addresses`,
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load addresses");
        return;
      }
      const list = (json.addresses ?? []) as AddressBookEntry[];
      setAddresses(list);
      // Default selection: prefer the existing default, else the first.
      const def = list.find((a) => a.default) ?? list[0];
      setSelectedId(def?.id ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId]);

  if (!open) return null;

  const startEdit = (a: AddressBookEntry) => {
    setEditingId(a.id);
    setEditForm({
      address1: a.address1 ?? "",
      address2: a.address2 ?? "",
      city: a.city ?? "",
      zip: a.zip ?? "",
    });
  };

  const submitEdit = async (a: AddressBookEntry) => {
    setBusyId(a.id);
    try {
      const res = await fetch(
        `/api/sales/customers/${customerId}/addresses/${a.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        },
      );
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Edit failed");
        return;
      }
      setEditingId(null);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const setDefault = async (a: AddressBookEntry) => {
    if (a.default) return;
    setBusyId(a.id);
    try {
      const res = await fetch(
        `/api/sales/customers/${customerId}/addresses/${a.id}/default`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Set-default failed");
        return;
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const useForOrder = (a: AddressBookEntry) => {
    onSelect({
      address_line_1: a.address1 ?? "",
      address_line_2: a.address2 ?? "",
      city_text: a.city ?? "",
      postal_code: a.zip ?? "",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <MapPin size={14} />
            Saved Addresses
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && (
            <div className="text-xs text-gray-500 text-center py-6">
              Loading…
            </div>
          )}
          {error && (
            <div className="text-xs text-rose-600 px-2 py-1.5 bg-rose-50 rounded">
              {error}
            </div>
          )}
          {!loading && !error && addresses.length === 0 && (
            <div className="text-xs text-gray-500 text-center py-6">
              No saved addresses on Shopify.
            </div>
          )}
          {addresses.map((a) => {
            const isSelected = selectedId === a.id;
            const isEditing = editingId === a.id;
            const isBusy = busyId === a.id;
            return (
              <div
                key={a.id}
                className={`border rounded-md p-3 text-sm ${
                  isSelected
                    ? "border-blue-400 bg-blue-50/40"
                    : "border-gray-200"
                }`}
              >
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() => setSelectedId(a.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {!isEditing ? (
                        <>
                          <div className="font-medium text-gray-900 truncate">
                            {a.address1 || "—"}
                          </div>
                          {a.address2 && (
                            <div className="text-xs text-gray-600 truncate">
                              {a.address2}
                            </div>
                          )}
                          <div className="text-xs text-gray-600 mt-0.5">
                            {[a.city, a.zip].filter(Boolean).join(" · ")}
                          </div>
                        </>
                      ) : (
                        <div
                          className="space-y-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            value={editForm.address1}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                address1: e.target.value,
                              })
                            }
                            placeholder="Street address"
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                          />
                          <input
                            value={editForm.address2}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                address2: e.target.value,
                              })
                            }
                            placeholder="Address line 2"
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              value={editForm.city}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  city: e.target.value,
                                })
                              }
                              placeholder="City"
                              className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                            />
                            <input
                              value={editForm.zip}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  zip: e.target.value,
                                })
                              }
                              placeholder="Zip"
                              className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {a.default && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
                          <Star size={9} fill="currentColor" />
                          Default
                        </span>
                      )}
                      {isSelected && !isEditing && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 flex items-center gap-1">
                          <Check size={10} />
                          Selected
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {!isEditing ? (
                  <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-gray-100">
                    {!a.default && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setDefault(a)}
                        className="text-[11px] px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-50"
                      >
                        {isBusy ? "…" : "Set as default"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => startEdit(a)}
                      className="text-[11px] px-2 py-1 text-gray-600 hover:text-gray-900 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Edit2 size={10} />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => useForOrder(a)}
                      className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Use for order
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-[11px] px-2 py-1 text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => submitEdit(a)}
                      className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isBusy ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
