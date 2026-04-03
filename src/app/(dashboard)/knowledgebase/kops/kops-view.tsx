"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

type Dept = { id: string; name: string; slug: string };
type Kop = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  current_version: number;
  created_at: string;
  updated_at: string;
  department: Dept | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type Props = {
  kops: Kop[];
  departments: Dept[];
  canManage: boolean;
};

export function KopsView({ kops: initial, departments, canManage }: Props) {
  const [kops, setKops] = useState<Kop[]>(initial);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", category: "", department_id: "", change_notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const filtered = kops.filter((k) => {
    const matchSearch = [k.title, k.description, k.category]
      .some((s) => s?.toLowerCase().includes(search.toLowerCase()));
    const matchDept = deptFilter === "all"
      ? true
      : deptFilter === "global"
      ? k.department === null
      : k.department?.id === deptFilter;
    return matchSearch && matchDept;
  });

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setCreating(true);
    const fd = new FormData();
    fd.append("title", form.title);
    if (form.description) fd.append("description", form.description);
    if (form.category) fd.append("category", form.category);
    if (form.department_id) fd.append("department_id", form.department_id);
    if (form.change_notes) fd.append("change_notes", form.change_notes);
    fd.append("file", file);

    const res = await fetch("/api/kops", { method: "POST", body: fd });
    if (res.ok) {
      const refreshed = await fetch("/api/kops");
      setKops(await refreshed.json());
      setShowCreate(false);
      setForm({ title: "", description: "", category: "", department_id: "", change_notes: "" });
      setFile(null);
    }
    setCreating(false);
  }, [form, file]);

  const categories = [...new Set(kops.map((k) => k.category).filter(Boolean))] as string[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">KOP Library</h1>
          <p className="text-sm text-gray-500 mt-1">Key Operating Procedures</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Upload KOP
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search KOPs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="all">All departments</option>
          <option value="global">Global</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* KOP grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No KOPs found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((kop) => (
            <Link
              key={kop.id}
              href={`/knowledgebase/kops/${kop.id}`}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700 line-clamp-2">
                  {kop.title}
                </h3>
                <span className="text-xs text-gray-400 shrink-0">v{kop.current_version}</span>
              </div>
              {kop.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{kop.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {kop.department ? (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {kop.department.name}
                  </span>
                ) : (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                    Global
                  </span>
                )}
                {kop.category && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {kop.category}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload KOP</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    list="category-options"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <datalist id="category-options">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Global</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">File *</label>
                <input
                  required
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp4,.mov"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Version notes</label>
                <input
                  type="text"
                  placeholder="e.g. Initial upload"
                  value={form.change_notes}
                  onChange={(e) => setForm((f) => ({ ...f, change_notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {creating ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
