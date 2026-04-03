"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";

type Dept = { id: string; name: string; slug: string };
type Memo = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  department: Dept | null;
  created_by_profile: { first_name: string; last_name: string } | null;
  memo_signatures: { user_id: string }[];
};

type Props = {
  memos: Memo[];
  departments: Dept[];
  currentUserId: string;
  canManage: boolean;
};

export function MemosView({ memos: initial, departments, currentUserId, canManage }: Props) {
  const [memos, setMemos] = useState<Memo[]>(initial);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", department_id: "" });

  const filtered = memos.filter((m) => {
    const matchSearch = [m.title, m.content]
      .some((s) => s?.toLowerCase().includes(search.toLowerCase()));
    const matchDept = deptFilter === "all"
      ? true
      : deptFilter === "global"
      ? m.department === null
      : m.department?.id === deptFilter;
    return matchSearch && matchDept;
  });

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/memos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        content: form.content,
        department_id: form.department_id || null,
      }),
    });
    if (res.ok) {
      const refreshed = await fetch("/api/memos");
      setMemos(await refreshed.json());
      setShowCreate(false);
      setForm({ title: "", content: "", department_id: "" });
    }
    setCreating(false);
  }, [form]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Memos</h1>
          <p className="text-sm text-gray-500 mt-1">Company and department notices</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + New Memo
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search memos..."
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

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No memos found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((memo) => {
            const signed = memo.memo_signatures.some((s) => s.user_id === currentUserId);
            const sigCount = memo.memo_signatures.length;
            return (
              <Link
                key={memo.id}
                href={`/knowledgebase/memos/${memo.id}`}
                className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{memo.title}</h3>
                    <p className="text-xs text-gray-500 line-clamp-2">{memo.content}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5">
                      {signed ? (
                        <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                          Signed
                        </span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">
                          Unsigned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{sigCount} signature{sigCount !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                  {memo.department ? (
                    <span>{memo.department.name}</span>
                  ) : (
                    <span className="text-blue-500">Global</span>
                  )}
                  <span>·</span>
                  <span>{format(new Date(memo.created_at), "d MMM yyyy")}</span>
                  {memo.created_by_profile && (
                    <>
                      <span>·</span>
                      <span>{memo.created_by_profile.first_name} {memo.created_by_profile.last_name}</span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Memo</h2>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Content *</label>
                <textarea
                  required
                  rows={6}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={form.department_id}
                  onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Global (all staff)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
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
                  {creating ? "Posting..." : "Post Memo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
