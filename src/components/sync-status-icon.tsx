"use client";
import { TriangleAlert, Loader2 } from "lucide-react";

export function SyncStatusIcon({
  syncStatus,
  syncError,
}: {
  syncStatus: string | null;
  syncError?: string | null;
}) {
  if (!syncStatus || syncStatus === "synced" || syncStatus === "not_synced") return null;
  if (syncStatus === "syncing") {
    return (
      <span title="Sync in progress" className="inline-flex items-center text-amber-600">
        <Loader2 size={14} className="animate-spin" />
      </span>
    );
  }
  if (syncStatus === "failed") {
    return (
      <span
        title={syncError ?? "Sync failed"}
        className="inline-flex items-center text-rose-600"
      >
        <TriangleAlert size={14} />
      </span>
    );
  }
  return null;
}
