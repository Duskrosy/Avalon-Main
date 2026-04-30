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
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  incomplete: "bg-amber-50 text-amber-800 border-amber-200",
  cs_inbox: "bg-blue-50 text-blue-700 border-blue-200",
  inventory: "bg-indigo-50 text-indigo-700 border-indigo-200",
  fulfillment: "bg-indigo-50 text-indigo-700 border-indigo-200",
  picked_up: "bg-sky-50 text-sky-700 border-sky-200",
  en_route: "bg-sky-50 text-sky-700 border-sky-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-rose-50 text-rose-700 border-rose-200",
  en_route_back: "bg-rose-50 text-rose-700 border-rose-200",
  rts: "bg-rose-50 text-rose-700 border-rose-200",
  replenished: "bg-emerald-50 text-emerald-700 border-emerald-200 opacity-80",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200 line-through",
  in_progress: "bg-gray-50 text-gray-700 border-gray-200",
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
