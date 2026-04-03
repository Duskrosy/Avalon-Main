"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";

type JobRun = {
  id: string;
  job_name: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  records_processed: number;
  error_message: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-50 text-green-700",
  running:   "bg-blue-50 text-blue-600",
  pending:   "bg-gray-100 text-gray-500",
  failed:    "bg-red-50 text-red-500",
  cancelled: "bg-gray-100 text-gray-400",
};

const STATUS_DOT: Record<string, string> = {
  completed: "bg-green-500",
  running:   "bg-blue-500 animate-pulse",
  pending:   "bg-gray-400",
  failed:    "bg-red-500",
  cancelled: "bg-gray-300",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function JobsTab() {
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/obs/jobs?${params}`);
    if (res.ok) setJobs(await res.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Group by job name for summary
  const jobNames = [...new Set(jobs.map((j) => j.job_name))];
  const jobSummary = jobNames.map((name) => {
    const runs = jobs.filter((j) => j.job_name === name);
    const latest = runs[0];
    const failRate = Math.round((runs.filter((r) => r.status === "failed").length / runs.length) * 100);
    return { name, runs: runs.length, latest, failRate };
  });

  return (
    <div>
      {/* Job summary cards */}
      {jobSummary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
          {jobSummary.map(({ name, runs, latest, failRate }) => (
            <div key={name} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[latest.status]}`} />
                <p className="font-medium text-sm text-gray-900 truncate">{name}</p>
              </div>
              <p className="text-xs text-gray-500">
                {runs} run{runs !== 1 ? "s" : ""} · {failRate}% failure rate
              </p>
              {latest.started_at && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Last: {format(parseISO(latest.started_at), "d MMM HH:mm")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3 mb-5">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">No job runs recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Records</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{job.job_name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[job.status]}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {job.started_at ? format(parseISO(job.started_at), "d MMM HH:mm:ss") : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{formatDuration(job.duration_ms)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{job.records_processed.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs text-red-500 max-w-xs truncate">{job.error_message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
