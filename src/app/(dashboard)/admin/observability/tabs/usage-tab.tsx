"use client";

import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";
import { format, parseISO } from "date-fns";

type UsageData = {
  dau: { day: string; unique_users: number }[];
  modules: { module: string; count: number; unique_users: number }[];
  events: { event_name: string; count: number; unique_users: number; latest: string }[];
  totalEvents: number;
  totalUsers: number;
  days: number;
};

export function UsageTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/obs/usage?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  if (loading) return <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              days === d
                ? "bg-[var(--color-text-primary)] text-white border-gray-900"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-gray-400"
            }`}
          >
            Last {d}d
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total Events</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{data.totalEvents.toLocaleString()}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">last {days} days</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Unique Users</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{data.totalUsers}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">active this period</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Modules Used</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{data.modules.length}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">distinct modules</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Event Types</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{data.events.length}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">distinct event names</p>
        </div>
      </div>

      {/* DAU chart */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Daily Active Users</h2>
        {data.dau.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-tertiary)] text-sm">No event data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.dau}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="day"
                tickFormatter={(v) => format(parseISO(v), "d MMM")}
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => [v, "Unique users"]}
                labelFormatter={(l) => format(parseISO(String(l)), "d MMM yyyy")}
              />
              <Line
                type="monotone"
                dataKey="unique_users"
                stroke="#3A5635"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Module usage */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Module Usage</h2>
        {data.modules.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-tertiary)] text-sm">No module data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, data.modules.length * 32)}>
            <BarChart data={data.modules} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="module" tick={{ fontSize: 11 }} width={100} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => [v, "Events"]}
              />
              <Bar dataKey="count" fill="#3A5635" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top events table */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Top Events</h2>
        </div>
        {data.events.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-tertiary)] text-sm">No events yet</div>
        ) : (
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Event</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Count</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Users</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase">Last seen</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg-primary)] divide-y divide-gray-50">
              {data.events.map((ev) => (
                <tr key={ev.event_name} className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-primary)]">{ev.event_name}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-text-primary)]">{ev.count.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-text-primary)]">{ev.unique_users}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-text-tertiary)] text-xs">
                    {format(parseISO(ev.latest), "d MMM HH:mm")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
