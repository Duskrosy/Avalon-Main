"use client";

import { useState, useMemo, useCallback } from "react";
import { useToast, Toast } from "@/components/ui/toast";

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
      <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
          {initial ? "Edit Catalog Item" : "New Catalog Item"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">SKU *</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                required
                disabled={!!initial}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Product Name *</label>
              <input
                type="text"
                value={form.product_name}
                onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Color</label>
              <input
                type="text"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Size</label>
              <input
                type="text"
                value={form.size}
                onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Product Family</label>
              <input
                type="text"
                value={form.product_family}
                onChange={(e) => setForm((f) => ({ ...f, product_family: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Collection</label>
              <input
                type="text"
                value={form.collection}
                onChange={(e) => setForm((f) => ({ ...f, collection: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Supplier Ref</label>
            <input
              type="text"
              value={form.supplier_ref}
              onChange={(e) => setForm((f) => ({ ...f, supplier_ref: e.target.value }))}
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.sku.trim() || !form.product_name.trim()}
              className="px-4 py-2 text-sm bg-[var(--color-text-primary)] text-white rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
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
  items: initialItems,
  isOps,
}: {
  items: CatalogItem[];
  isOps: boolean;
}) {
  const { toast, setToast } = useToast();
  const [items, setItems] = useState<CatalogItem[]>(initialItems);
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
        const created = await res.json();
        setItems(prev => [created, ...prev]);
        setModalOpen(false);
        setToast({ message: "Catalog item created", type: "success" });
      } else {
        setToast({ message: "Failed to create catalog item", type: "error" });
      }
    },
    [setToast]
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
        setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, ...data } as CatalogItem : i));
        setEditItem(null);
        setToast({ message: "Catalog item updated", type: "success" });
      } else {
        setToast({ message: "Failed to update catalog item", type: "error" });
      }
    },
    [editItem, setToast]
  );

  const handleToggleActive = useCallback(
    async (item: CatalogItem) => {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
      const res = await fetch("/api/operations/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
      });
      if (res.ok) {
        setToast({ message: item.is_active ? "Item deactivated" : "Item activated", type: "success" });
      } else {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: item.is_active } : i));
        setToast({ message: "Failed to toggle item status", type: "error" });
      }
    },
    [setToast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Are you sure you want to delete this catalog item? This cannot be undone.")) return;
      setDeleting(id);
      const res = await fetch(`/api/operations/catalog?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
        setToast({ message: "Catalog item deleted", type: "success" });
      } else {
        setToast({ message: "Failed to delete catalog item", type: "error" });
      }
      setDeleting(null);
    },
    [setToast]
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Catalog</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 text-sm bg-[var(--color-text-primary)] text-white rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
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
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <select
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Families</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-[var(--color-border-primary)]"
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/60">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
                  SKU
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
                  Product Name
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
                  Color
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
                  Size
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
                  Family
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
                  Collection
                </th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
                  Active
                </th>
                {isOps && (
                  <th className="text-center px-4 py-3 font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-secondary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={isOps ? 8 : 7}
                    className="px-4 py-12 text-center text-[var(--color-text-tertiary)]"
                  >
                    No catalog items found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setEditItem(item)}
                    className={`hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors ${
                      !item.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-primary)]">
                      {item.sku}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-primary)] font-medium">
                      {item.product_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{item.color ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{item.size ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {item.product_family ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {item.collection ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(item);
                        }}
                        className={`inline-block w-9 h-5 rounded-full relative transition-colors ${
                          item.is_active ? "bg-[var(--color-success-light)]0" : "bg-[var(--color-border-primary)]"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-[var(--color-bg-primary)] rounded-full transition-transform ${
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
                          className="text-xs text-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50 transition-colors"
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
