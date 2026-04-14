"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

type CatalogItem = {
  id: string;
  sku: string;
  product_name: string | null;
  color: string | null;
  size: string | null;
  product_family: string | null;
  collection: string | null;
  supplier_ref: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const EMPTY_FORM = {
  sku: "",
  product_name: "",
  color: "",
  size: "",
  product_family: "",
  collection: "",
  supplier_ref: "",
};

function ItemModal({
  onSave,
  onClose,
  initial,
}: {
  onSave: (data: Record<string, string>) => void;
  onClose: () => void;
  initial?: CatalogItem;
}) {
  const [form, setForm] = useState(
    initial
      ? {
          sku: initial.sku,
          product_name: initial.product_name ?? "",
          color: initial.color ?? "",
          size: initial.size ?? "",
          product_family: initial.product_family ?? "",
          collection: initial.collection ?? "",
          supplier_ref: initial.supplier_ref ?? "",
        }
      : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.product_name.trim()) return;
    setSaving(true);
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {initial ? "Edit Catalog Item" : "New Catalog Item"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKU *</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                required
                disabled={!!initial}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Product Name *</label>
              <input
                type="text"
                value={form.product_name}
                onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Color</label>
              <input
                type="text"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Size</label>
              <input
                type="text"
                value={form.size}
                onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Product Family</label>
              <input
                type="text"
                value={form.product_family}
                onChange={(e) => setForm((f) => ({ ...f, product_family: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Collection</label>
              <input
                type="text"
                value={form.collection}
                onChange={(e) => setForm((f) => ({ ...f, collection: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Supplier Ref</label>
            <input
              type="text"
              value={form.supplier_ref}
              onChange={(e) => setForm((f) => ({ ...f, supplier_ref: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.sku.trim() || !form.product_name.trim()}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : initial ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CatalogView({
  items,
  isOps,
}: {
  items: CatalogItem[];
  isOps: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const families = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.product_family) set.add(i.product_family);
    });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!showInactive && !item.is_active) return false;
      if (familyFilter && item.product_family !== familyFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = item.product_name?.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        if (!matchName && !matchSku) return false;
      }
      return true;
    });
  }, [items, search, familyFilter, showInactive]);

  const handleCreate = useCallback(
    async (data: Record<string, string>) => {
      const res = await fetch("/api/operations/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setModalOpen(false);
        router.refresh();
      }
    },
    [router]
  );

  const handleUpdate = useCallback(
    async (data: Record<string, string>) => {
      if (!editItem) return;
      const res = await fetch("/api/operations/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editItem.id, ...data }),
      });
      if (res.ok) {
        setEditItem(null);
        router.refresh();
      }
    },
    [editItem, router]
  );

  const handleToggleActive = useCallback(
    async (item: CatalogItem) => {
      await fetch("/api/operations/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
      });
      router.refresh();
    },
    [router]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Are you sure you want to delete this catalog item? This cannot be undone.")) return;
      setDeleting(id);
      const res = await fetch(`/api/operations/catalog?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      }
      setDeleting(null);
    },
    [router]
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Catalog</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          + New Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <select
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Families</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                  SKU
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Product Name
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Color
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Size
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Family
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Collection
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                  Active
                </th>
                {isOps && (
                  <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={isOps ? 8 : 7}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    No catalog items found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setEditItem(item)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                      !item.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {item.sku}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {item.product_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.color ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{item.size ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.product_family ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.collection ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(item);
                        }}
                        className={`inline-block w-9 h-5 rounded-full relative transition-colors ${
                          item.is_active ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                            item.is_active ? "translate-x-4" : ""
                          }`}
                        />
                      </button>
                    </td>
                    {isOps && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                          disabled={deleting === item.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                        >
                          {deleting === item.id ? "..." : "Delete"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <ItemModal onSave={handleCreate} onClose={() => setModalOpen(false)} />
      )}

      {/* Edit Modal */}
      {editItem && (
        <ItemModal
          initial={editItem}
          onSave={handleUpdate}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}
