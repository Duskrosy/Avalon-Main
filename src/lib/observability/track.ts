import { createClient } from "@/lib/supabase/client";

type EventCategory = "product" | "audit" | "error" | "performance";

type TrackOptions = {
  category?: EventCategory;
  module?: string;
  properties?: Record<string, unknown>;
  success?: boolean;
};

/**
 * Fire-and-forget client-side event tracker.
 * Never throws. Never awaits in the caller.
 *
 * Usage:
 *   trackEvent("leave.submitted", { module: "people", properties: { leave_type: "sick" } });
 */
export function trackEvent(name: string, opts: TrackOptions = {}): void {
  const supabase = createClient();

  supabase.auth.getUser().then(({ data }) => {
    const userId = data.user?.id ?? null;

    supabase
      .from("obs_app_events")
      .insert({
        event_name: name,
        category: opts.category ?? "product",
        actor_id: userId,
        module: opts.module ?? null,
        properties: opts.properties ?? {},
        success: opts.success ?? true,
      })
      .then(
        () => { /* fire-and-forget */ },
        () => { /* swallow errors */ }
      );
  }).catch(() => { /* swallow errors */ });
}

/**
 * Server-side variant for use in API routes.
 * Pass the Supabase server client (already authenticated).
 * Never throws.
 */
export async function trackEventServer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  actorId: string | null,
  name: string,
  opts: TrackOptions = {}
): Promise<void> {
  try {
    await supabase.from("obs_app_events").insert({
      event_name: name,
      category: opts.category ?? "product",
      actor_id: actorId,
      module: opts.module ?? null,
      properties: opts.properties ?? {},
      success: opts.success ?? true,
    });
  } catch {
    // swallow — observability must never crash the app
  }
}

/**
 * Log an error to obs_error_logs (server-side, API routes only).
 * Never throws.
 */
export async function logError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: {
    error_type: string;
    message: string;
    stack_trace?: string;
    module?: string;
    severity?: "low" | "medium" | "high" | "critical";
    actor_id?: string | null;
    request_path?: string;
    request_method?: string;
  }
): Promise<void> {
  try {
    await supabase.from("obs_error_logs").insert({
      error_type: opts.error_type,
      message: opts.message,
      stack_trace: opts.stack_trace ?? null,
      module: opts.module ?? null,
      severity: opts.severity ?? "medium",
      actor_id: opts.actor_id ?? null,
      request_path: opts.request_path ?? null,
      request_method: opts.request_method ?? null,
    });
  } catch {
    // swallow
  }
}
