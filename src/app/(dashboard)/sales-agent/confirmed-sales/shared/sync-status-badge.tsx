"use client";

import { LifecyclePill } from "@/components/lifecycle-pill";
import { SyncStatusIcon } from "@/components/sync-status-icon";

export function SyncStatusBadge({
  lifecycleStage,
  lifecycleMethod,
  syncStatus,
  syncError,
}: {
  lifecycleStage: string;
  lifecycleMethod?: string | null;
  syncStatus?: string | null;
  syncError?: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <LifecyclePill stage={lifecycleStage} method={lifecycleMethod} />
      <SyncStatusIcon syncStatus={syncStatus ?? null} syncError={syncError} />
    </span>
  );
}
