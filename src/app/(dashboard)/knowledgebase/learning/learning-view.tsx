"use client";

import { useState, useCallback } from "react";

type Dept = { id: string; name: string; slug: string };
type Material = {
  id: string;
  title: string;
  description: string | null;
  material_type: "video" | "pdf" | "presentation" | "document" | "link";
  file_url: string | null;
  external_link: string | null;
  signed_url: string | null;
  sort_order: number;
  created_at: string;
  completed: boolean;
  department: Dept | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type Props = {
  materials: Material[];
  departments: Dept[];
  canManage: boolean;
};

const TYPE_ICONS: Record<string, string> = {
  pdf: "📄",
  video: "🎬",
  presentation: "📊",
  document: "📝",
  link: "🔗",
};

const TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  video: "Video",
  presentation: "Presentation",
  document: "Document",
  link: "Link",
};

function MaterialViewer({ material, onClose }: { material: Material; onClose: () => void }) {
  const url = material.signed_url ?? material.external_link;

  return (
    <div className="fixed inset-0 bg-black/80 flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{material.title}</h2>
          {material.department && (
            <p className="text-xs text-gray-400">{material.department.name}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-hidden bg-gray-100">
        {!url ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-white text-sm">File unavailable.</p>
          </div>
        ) : material.material_type === "video" ? (
          <div className="flex items-center justify-center h-full p-4">
            <video controls className="max-h-full max-w-full rounded-lg" autoPlay>
              <source src={url} />
            </video>
          </div>
        ) : material.material_type === "link" ? (
          <iframe src={url} className="w-full h-full border-0" title={material.title} />
        ) : ["presentation", "document"].includes(material.material_type) ? (
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
            className="w-full h-full border-0"
            title={material.title}
          />
        ) : (
          // pdf
          <iframe src={url} className="w-full h-full border-0" title={material.title} />
        )}
      </div>
    </div>
  );
}

export function LearningView({ materials: initial, departments, canManage }: Props) {
  const [materials, setMaterials] = useState<Material[]>(initial);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<Material | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", material_type: "pdf",
    department_id: "", external_link: "", sort_order: "0",
  });
  const [file, setFile] = useState<File | null>(null);

  const filtered = materials.filter((m) => {
    const matchSearch = [m.title, m.description]
      .some((s) => s?.toLowerCase().includes(search.toLowerCase()));
    const matchDept = deptFilter === "all"
      ? true
      : deptFilter === "global"
      ? m.department === null
      : m.department?.id === deptFilter;
    const matchType = typeFilter === "all" || m.material_type === typeFilter;
    return matchSearch && matchDept && matchType;
  });

  const toggleComplete = useCallback(async (material: Material) => {
    const next = !material.completed;
    setMaterials((ms) => ms.map((m) => m.id === material.id ? { ...m, completed: next } : m));
    await fetch("/api/learning/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id: material.id, completed: next }),
    });
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const fd = new FormData();
    fd.append("title", form.title);
    if (form.description) fd.append("description", form.description);
    fd.append("material_type", form.material_type);
    if (form.department_id) fd.append("department_id", form.department_id);
    if (form.external_link) fd.append("external_link", form.external_link);
    fd.append("sort_order", form.sort_order);
    if (file) fd.append("file", file);

    const res = await fetch("/api/learning", { method: "POST", body: fd });
    if (res.ok) {
      const refreshed = await fetch("/api/learning");
      setMaterials(await refreshed.json());
      setShowCreate(false);
      setForm({ title: "", description: "", material_type: "pdf", department_id: "", external_link: "", sort_order: "0" });
      setFile(null);
    }
    setCreating(false);
  }, [form, file]);

  const handleDelete = useCallback(async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    const res = await fetch(`/api/learning/${id}`, { method: "DELETE" });
    if (res.ok) setMaterials((ms) => ms.filter((m) => m.id !== id));
  }, []);

  const completedCount = materials.filter((m) => m.completed).length;
  const progress = materials.length > 0 ? Math.round((completedCount / materials.length) * 100) : 0;

  return (
    <div>
      {selected && (
        <MaterialViewer material={selected} onClose={() => setSelected(null)} />
      )}

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Learning Materials</h1>
          <p className="text-sm text-gray-500 mt-1">
            {completedCount}/{materials.length} completed
            {materials.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">({progress}%)</span>
            )}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Add Material
          </button>
        )}
      </div>

      {/* Overall progress bar */}
      {materials.length > 0 && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search materials..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="all">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
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

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No materials found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div
              key={m.id}
              className={`bg-white border rounded-xl p-4 flex items-center gap-4 transition-colors ${
                m.completed ? "border-green-200 bg-green-50/30" : "border-gray-200"
              }`}
            >
              <div className="text-2xl shrink-0">{TYPE_ICONS[m.material_type] ?? "📄"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-gray-900 truncate">{m.title}</h3>
                  <span className="text-xs text-gray-400 shrink-0">{TYPE_LABELS[m.material_type]}</span>
                </div>
                {m.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{m.description}</p>
                )}
                {m.department && (
                  <p className="text-xs text-gray-400 mt-0.5">{m.department.name}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setSelected(m)}
                  disabled={!m.signed_url && !m.external_link}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  View
                </button>
                <button
                  onClick={() => toggleComplete(m)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                    m.completed
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "border border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {m.completed ? "✓ Done" : "Mark done"}
                </button>
                {canManage && (
                  <button
                    onClick={() => handleDelete(m.id, m.title)}
                    className="text-xs text-red-400 hover:text-red-600 p-1.5"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Learning Material</h2>
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    required
                    value={form.material_type}
                    onChange={(e) => setForm((f) => ({ ...f, material_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="pdf">PDF</option>
                    <option value="video">Video</option>
                    <option value="presentation">Presentation</option>
                    <option value="document">Document</option>
                    <option value="link">Link</option>
                  </select>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {form.material_type === "link" ? "URL *" : "File"}
                </label>
                {form.material_type === "link" ? (
                  <input
                    required
                    type="url"
                    placeholder="https://..."
                    value={form.external_link}
                    onChange={(e) => setForm((f) => ({ ...f, external_link: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                ) : (
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.webm"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-600"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sort order</label>
                <input
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
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
                  {creating ? "Adding..." : "Add Material"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
