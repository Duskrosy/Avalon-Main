"use client";

import { useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type Unit = "percent" | "number" | "currency_php" | "days" | "weeks" | "seconds";
type Direction = "higher_better" | "lower_better";

type KpiDef = {
  id: string;
  name: string;
  category: string;
  unit: Unit;
  direction: Direction;
  frequency: "daily" | "weekly" | "monthly";
  threshold_green: number;
  threshold_amber: number;
  hint: string | null;
  is_platform_tracked: boolean;
  sort_order: number;
};

type KpiEntry = {
  id: string;
  kpi_definition_id: string;
  period_date: string;
  value_numeric: number;
  notes: string | null;
  created_at: string;
};

type Dept = { id: string; name: string; slug: string };

type Props = {
  initialDefinitions: KpiDef[];
  initialEntries: Record<string, KpiEntry[]>;
  departments: Dept[];
  currentDeptId: string | null;
  canLog: boolean;
  isOps: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rag(value: number, def: KpiDef): "green" | "amber" | "red" {
  if (def.direction === "higher_better") {
    if (value >= def.threshold_green) return "green";
    if (value >= def.threshold_amber) return "amber";
    return "red";
  } else {
    if (value <= def.threshold_green) return "green";
    if (value <= def.threshold_amber) return "amber";
    return "red";
  }
}

function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case "percent":      return `${value.toFixed(1)}%`;
    case "currency_php": return `₱${value.toFixed(2)}`;
    case "days":         return `${value}d`;
    case "weeks":        return `${value}w`;
    case "seconds":      return `${value}s`;
    default:             return value.toLocaleString();
  }
}

function formatPeriod(date: string, freq: string): string {
  const d = parseISO(date);
  if (freq === "monthly") return format(d, "MMM yy");
  if (freq === "weekly")  return format(d, "d MMM");
  return format(d, "d MMM");
}

const RAG_STYLES = {
  green: { bg: "bg-green-50",   border: "border-green-200",  badge: "bg-green-100 text-green-700",  dot: "bg-green-500",  label: "On Track"  },
  amber: { bg: "bg-amber-50",   border: "border-amber-200",  badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-400",  label: "Monitor"   },
  red:   { bg: "bg-red-50",     border: "border-red-200",    badge: "bg-red-100 text-red-700",      dot: "bg-red-500",    label: "Critical"  },
  none:  { bg: "bg-gray-50",    border: "border-gray-200",   badge: "bg-gray-100 text-gray-500",    dot: "bg-gray-300",   label: "No data"   },
};

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ entries, def }: { entries: KpiEntry[]; def: KpiDef }) {
  const last8 = entries.slice(-8);
  if (last8.length < 2) return <div className="h-8 flex items-center text-xs text-gray-300">—</div>;

  const data = last8.map((e) => ({ v: e.value_numeric }));
  const color = entries.length ? RAG_STYLES[rag(last8[last8.length - 1].value_numeric, def)].dot.replace("bg-", "") : "gray-300";
  const strokeColor = color === "bg-green-500" ? "#22c55e" : color === "bg-amber-400" ? "#f59e0b" : color === "bg-red-500" ? "#ef4444" : "#d1d5db";
  const latestRag = rag(last8[last8.length - 1].value_numeric, def);
  const strokeMap = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={strokeMap[latestRag]}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Trend chart in detail panel ──────────────────────────────────────────────
function TrendChart({ entries, def }: { entries: KpiEntry[]; def: KpiDef }) {
  const data = entries.map((e) => ({
    period: formatPeriod(e.period_date, def.frequency),
    value: e.value_numeric,
  }));

  const ragColor = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={40}
          tickFormatter={(v) => formatValue(v, def.unit)} />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [formatValue(Number(v), def.unit), def.name]}
          labelStyle={{ fontSize: 11 }}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        {/* Green threshold reference line */}
        <ReferenceLine
          y={def.threshold_green}
          stroke={ragColor.green}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{ value: "Target", position: "right", fontSize: 10, fill: ragColor.green }}
        />
        {/* Amber threshold reference line */}
        <ReferenceLine
          y={def.threshold_amber}
          stroke={ragColor.amber}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{ value: "Minimum", position: "right", fontSize: 10, fill: ragColor.amber }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#111827"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#111827" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Log Value Modal ──────────────────────────────────────────────────────────
function LogModal({
  def,
  onSave,
  onClose,
}: {
  def: KpiDef;
  onSave: (value: number, period: string, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [period, setPeriod] = useState(() => {
    const today = new Date();
    if (def.frequency === "monthly") {
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    }
    // Week: get Monday
    const d = new Date(today);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const preview = value !== "" ? rag(parseFloat(value), def) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">{def.name}</h2>
        <p className="text-xs text-gray-400 mb-4">
          Target: {def.direction === "higher_better" ? "≥" : "≤"}{formatValue(def.threshold_green, def.unit)}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Value ({def.unit === "currency_php" ? "₱" : def.unit === "percent" ? "%" : def.unit})
            </label>
            <input
              autoFocus
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {preview && (
              <div className={`mt-1.5 text-xs px-2 py-1 rounded-full inline-block ${RAG_STYLES[preview].badge}`}>
                → {RAG_STYLES[preview].label}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period</label>
            <input
              type="date"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">
              {def.frequency === "monthly" ? "Use first day of month (YYYY-MM-01)" : "Use Monday of the week"}
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={!value || saving}
            onClick={async () => {
              setSaving(true);
              await onSave(parseFloat(value), period, notes);
              onClose();
            }}
            className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Log Value"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  def,
  entries,
  onSelect,
  onLog,
  canLog,
}: {
  def: KpiDef;
  entries: KpiEntry[];
  onSelect: () => void;
  onLog: () => void;
  canLog: boolean;
}) {
  const latest = entries[entries.length - 1] ?? null;
  const prev   = entries[entries.length - 2] ?? null;
  const status = latest ? rag(latest.value_numeric, def) : "none";
  const style  = RAG_STYLES[status];

  const delta = latest && prev
    ? ((latest.value_numeric - prev.value_numeric) / Math.abs(prev.value_numeric)) * 100
    : null;

  return (
    <div
      className={`bg-white border ${style.border} rounded-xl p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-0.5 truncate">{def.name}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">
              {latest ? formatValue(latest.value_numeric, def.unit) : "—"}
            </span>
            {delta !== null && (
              <span className={`text-xs font-medium ${
                (def.direction === "higher_better" ? delta >= 0 : delta <= 0)
                  ? "text-green-600" : "text-red-500"
              }`}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
          {style.label}
        </div>
      </div>

      {/* Target */}
      <div className="text-xs text-gray-400">
        Target: {def.direction === "higher_better" ? "≥" : "≤"}{formatValue(def.threshold_green, def.unit)}
        {latest && (
          <span className="ml-2 text-gray-300">
            · {formatPeriod(latest.period_date, def.frequency)}
          </span>
        )}
      </div>

      {/* Sparkline */}
      <Sparkline entries={entries} def={def} />

      {/* Actions */}
      <div className="flex items-center justify-between">
        {def.is_platform_tracked && (
          <span className="text-xs text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full">Auto (Phase 6)</span>
        )}
        {canLog && (
          <button
            onClick={(e) => { e.stopPropagation(); onLog(); }}
            className="ml-auto text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-2.5 py-1 rounded-lg transition-colors"
          >
            Log value
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({
  def,
  entries,
  onLog,
  onClose,
  canLog,
}: {
  def: KpiDef;
  entries: KpiEntry[];
  onLog: () => void;
  onClose: () => void;
  canLog: boolean;
}) {
  const latest = entries[entries.length - 1] ?? null;
  const status = latest ? rag(latest.value_numeric, def) : "none";
  const style  = RAG_STYLES[status];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{def.name}</h2>
              <p className="text-xs text-gray-400">{def.category} · {def.frequency}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-1">×</button>
          </div>

          {/* Current value */}
          <div className={`rounded-xl p-4 mb-5 ${style.bg} border ${style.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Current value</p>
                <p className="text-3xl font-bold text-gray-900">
                  {latest ? formatValue(latest.value_numeric, def.unit) : "No data"}
                </p>
                {latest && <p className="text-xs text-gray-400 mt-1">{format(parseISO(latest.period_date), "d MMMM yyyy")}</p>}
              </div>
              <div className={`text-sm px-3 py-1.5 rounded-full font-medium ${style.badge}`}>
                {style.label}
              </div>
            </div>
            <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Green target</p>
                <p className="text-sm font-medium text-green-700">
                  {def.direction === "higher_better" ? "≥" : "≤"}{formatValue(def.threshold_green, def.unit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Amber minimum</p>
                <p className="text-sm font-medium text-amber-600">
                  {def.direction === "higher_better" ? "≥" : "≤"}{formatValue(def.threshold_amber, def.unit)}
                </p>
              </div>
            </div>
          </div>

          {/* Trend chart */}
          {entries.length > 0 ? (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Trend</p>
              <TrendChart entries={entries} def={def} />
            </div>
          ) : (
            <div className="mb-5 bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-400">
              No data logged yet.
            </div>
          )}

          {/* Hint */}
          {def.hint && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-5">
              <p className="text-xs text-blue-700">📌 {def.hint}</p>
            </div>
          )}

          {/* History table */}
          {entries.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">History</p>
              <div className="space-y-1">
                {[...entries].reverse().slice(0, 10).map((e) => {
                  const r = rag(e.value_numeric, def);
                  return (
                    <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <span className="text-xs text-gray-500">{format(parseISO(e.period_date), "d MMM yyyy")}</span>
                      <div className="flex items-center gap-2">
                        {e.notes && <span className="text-xs text-gray-400 max-w-32 truncate">{e.notes}</span>}
                        <div className={`w-2 h-2 rounded-full ${RAG_STYLES[r].dot}`} />
                        <span className="text-sm font-medium text-gray-900">{formatValue(e.value_numeric, def.unit)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Log button */}
          {canLog && (
            <button
              onClick={onLog}
              className="w-full bg-gray-900 text-white text-sm py-2.5 rounded-xl hover:bg-gray-700 transition-colors"
            >
              Log new value
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function KpiDashboard({
  initialDefinitions,
  initialEntries,
  departments,
  currentDeptId,
  canLog,
  isOps,
}: Props) {
  const [definitions, setDefinitions] = useState<KpiDef[]>(initialDefinitions);
  const [entries, setEntries] = useState<Record<string, KpiEntry[]>>(initialEntries);
  const [deptId, setDeptId] = useState<string | null>(currentDeptId);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<KpiDef | null>(null);
  const [logging, setLogging] = useState<KpiDef | null>(null);

  // Load KPIs for a department
  const loadDept = useCallback(async (id: string) => {
    setLoading(true);
    setSelected(null);
    const res = await fetch(`/api/kpis?department_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setDefinitions(data.definitions);
      setEntries(data.entries);
    }
    setDeptId(id);
    setLoading(false);
  }, []);

  // Log a value
  const handleLog = useCallback(async (def: KpiDef, value: number, period: string, notes: string) => {
    const res = await fetch(`/api/kpis/${def.id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value_numeric: value, period_date: period, notes }),
    });
    if (res.ok) {
      const newEntry: KpiEntry = {
        id: (await res.json()).id,
        kpi_definition_id: def.id,
        period_date: period,
        value_numeric: value,
        notes: notes || null,
        created_at: new Date().toISOString(),
      };
      setEntries((prev) => {
        const existing = (prev[def.id] ?? []).filter((e) => e.period_date !== period);
        return {
          ...prev,
          [def.id]: [...existing, newEntry].sort((a, b) => a.period_date.localeCompare(b.period_date)),
        };
      });
    }
  }, []);

  // RAG summary
  const summary = useMemo(() => {
    let green = 0, amber = 0, red = 0, noData = 0;
    for (const def of definitions) {
      const defEntries = entries[def.id] ?? [];
      const latest = defEntries[defEntries.length - 1];
      if (!latest) { noData++; continue; }
      const r = rag(latest.value_numeric, def);
      if (r === "green") green++;
      else if (r === "amber") amber++;
      else red++;
    }
    return { green, amber, red, noData, total: definitions.length };
  }, [definitions, entries]);

  // Group by category
  const byCategory = useMemo(() => {
    const groups: Record<string, KpiDef[]> = {};
    for (const def of definitions) {
      if (!groups[def.category]) groups[def.category] = [];
      groups[def.category].push(def);
    }
    return groups;
  }, [definitions]);

  const currentDeptName = departments.find((d) => d.id === deptId)?.name;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">KPI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {currentDeptName ? `${currentDeptName} · ` : ""}Performance tracking
          </p>
        </div>
        {isOps && departments.length > 0 && (
          <select
            value={deptId ?? ""}
            onChange={(e) => e.target.value && loadDept(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* RAG Summary Bar */}
      {summary.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-6 mb-3">
            {[
              { label: "On Track",    count: summary.green,  color: "text-green-600",  bg: "bg-green-500"  },
              { label: "Monitor",     count: summary.amber,  color: "text-amber-600",  bg: "bg-amber-400"  },
              { label: "Critical",    count: summary.red,    color: "text-red-600",    bg: "bg-red-500"    },
              { label: "No Data",     count: summary.noData, color: "text-gray-400",   bg: "bg-gray-200"   },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${s.bg}`} />
                <span className={`text-sm font-semibold ${s.color}`}>{s.count}</span>
                <span className="text-xs text-gray-400">{s.label}</span>
              </div>
            ))}
          </div>
          {/* Proportional bar */}
          <div className="h-2.5 rounded-full overflow-hidden flex gap-0.5">
            {summary.green > 0  && <div className="bg-green-500 rounded-full" style={{ flex: summary.green  }} />}
            {summary.amber > 0  && <div className="bg-amber-400 rounded-full" style={{ flex: summary.amber  }} />}
            {summary.red > 0    && <div className="bg-red-500   rounded-full" style={{ flex: summary.red    }} />}
            {summary.noData > 0 && <div className="bg-gray-200  rounded-full" style={{ flex: summary.noData }} />}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Loading KPIs...</p>
      ) : definitions.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No KPI definitions found for this department.</p>
          <p className="text-xs text-gray-300 mt-1">Apply migration 00005 and ensure the department is seeded.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byCategory).map(([category, defs]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{category}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {defs.map((def) => (
                  <KpiCard
                    key={def.id}
                    def={def}
                    entries={entries[def.id] ?? []}
                    onSelect={() => setSelected(def)}
                    onLog={() => setLogging(def)}
                    canLog={canLog}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          def={selected}
          entries={entries[selected.id] ?? []}
          onLog={() => { setLogging(selected); }}
          onClose={() => setSelected(null)}
          canLog={canLog}
        />
      )}

      {/* Log modal */}
      {logging && (
        <LogModal
          def={logging}
          onSave={async (value, period, notes) => {
            await handleLog(logging, value, period, notes);
          }}
          onClose={() => setLogging(null)}
        />
      )}
    </div>
  );
}
