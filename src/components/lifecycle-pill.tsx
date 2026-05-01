"use client";

const LABELS: Record<string, string> = {
  draft: "DRAFT",
  incomplete: "UNCOMPLETE ORDER",
  cs_inbox: "HANDOFF TO CS",
  inventory: "INVENTORY",
  fulfillment: "FULFILLMENT",
  picked_up: "PICKED UP",
  en_route: "EN ROUTE",
  delivered: "DELIVERED",
  declined: "DECLINED",
  en_route_back: "EN ROUTE BACK",
  rts: "RTS",
  replenished: "REPLENISHED",
  cancelled: "CANCELLED",
  in_progress: "IN PROGRESS",
};

const TONES: Record<string, string> = {
  draft: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)]",
  incomplete: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border-[var(--color-warning)]/30",
  cs_inbox: "bg-[var(--color-accent-light)] text-[var(--color-accent)] border-[var(--color-accent)]/30",
  inventory: "bg-[var(--color-accent-light)] text-[var(--color-accent)] border-[var(--color-accent)]/30",
  fulfillment: "bg-[var(--color-accent-light)] text-[var(--color-accent)] border-[var(--color-accent)]/30",
  picked_up: "bg-[var(--color-info-light)] text-[var(--color-info)] border-[var(--color-info)]/30",
  en_route: "bg-[var(--color-info-light)] text-[var(--color-info)] border-[var(--color-info)]/30",
  delivered: "bg-[var(--color-success-light)] text-[var(--color-success-text)] border-[var(--color-success)]/30",
  declined: "bg-[var(--color-error-light)] text-[var(--color-error-text)] border-[var(--color-error)]/30",
  en_route_back: "bg-[var(--color-error-light)] text-[var(--color-error-text)] border-[var(--color-error)]/30",
  rts: "bg-[var(--color-error-light)] text-[var(--color-error-text)] border-[var(--color-error)]/30",
  replenished: "bg-[var(--color-success-light)] text-[var(--color-success-text)] border-[var(--color-success)]/30 opacity-80",
  cancelled: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] border-[var(--color-border-primary)] line-through",
  in_progress: "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)]",
};

const METHOD_STAGES = new Set(["picked_up", "en_route", "delivered"]);

export function LifecyclePill({
  stage,
  method,
}: {
  stage: string;
  method?: string | null;
}) {
  const label = LABELS[stage] ?? stage.toUpperCase();
  const tone = TONES[stage] ?? TONES.in_progress;
  const showMethod = method && METHOD_STAGES.has(stage);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
      {showMethod ? ` — ${method.toUpperCase()}` : ""}
    </span>
  );
}
