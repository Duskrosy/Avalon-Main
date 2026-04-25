"use client";

type Status = "draft" | "syncing" | "synced" | "failed" | "cancelled" | "completed";

const TONE: Record<Status, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  syncing: "bg-amber-50 text-amber-700 border-amber-200",
  synced: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200 line-through",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
};

const LABEL: Record<Status, string> = {
  draft: "Draft",
  syncing: "Syncing…",
  synced: "Synced",
  failed: "Sync failed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export function SyncStatusBadge({
  status,
  syncStatus,
}: {
  status: string;
  syncStatus?: string;
}) {
  // status takes precedence for cancelled/completed; sync_status for the others.
  let key: Status = "draft";
  if (status === "cancelled") key = "cancelled";
  else if (status === "completed") key = "completed";
  else if (syncStatus === "syncing") key = "syncing";
  else if (syncStatus === "synced") key = "synced";
  else if (syncStatus === "failed") key = "failed";
  else key = "draft";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[key]}`}
    >
      {LABEL[key]}
    </span>
  );
}
