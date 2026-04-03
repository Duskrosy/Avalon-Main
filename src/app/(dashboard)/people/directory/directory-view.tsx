"use client";

import { useState } from "react";

type Department = { id: string; name: string; slug: string };
type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  department: Department | null;
  role: { name: string; tier: number } | null;
};

type Props = {
  profiles: Profile[];
  departments: Department[];
};

export function DirectoryView({ profiles, departments }: Props) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  const filtered = profiles.filter((p) => {
    const matchesSearch =
      `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase());
    const matchesDept = !deptFilter || p.department?.id === deptFilter;
    return matchesSearch && matchesDept;
  });

  // Group by department
  const grouped = filtered.reduce<Record<string, Profile[]>>((acc, p) => {
    const key = p.department?.name ?? "No Department";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Employee Directory</h1>
        <p className="text-sm text-gray-500 mt-1">{profiles.length} people</p>
      </div>

      <div className="flex gap-3 mb-6">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          No people found
        </div>
      ) : deptFilter ? (
        // Flat view when filtering by dept
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => <PersonCard key={p.id} person={p} />)}
        </div>
      ) : (
        // Grouped view
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([dept, people]) => (
            <div key={dept}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{dept}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {people.map((p) => <PersonCard key={p.id} person={p} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({ person }: { person: Profile }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium shrink-0">
        {person.first_name[0]}{person.last_name[0]}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {person.first_name} {person.last_name}
        </p>
        <p className="text-xs text-gray-500 truncate">{person.email}</p>
        {person.role && (
          <p className="text-xs text-gray-400 mt-0.5">{person.role.name}</p>
        )}
        {person.phone && (
          <p className="text-xs text-gray-400">{person.phone}</p>
        )}
      </div>
    </div>
  );
}
