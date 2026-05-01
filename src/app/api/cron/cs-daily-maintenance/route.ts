// src/app/api/cron/cs-daily-maintenance/route.ts
//
// Consolidated daily cron for CS Pass 2 maintenance jobs. Combines the
// conversion-lane reconciler and the webhook-deliveries prune into a single
// endpoint so we stay under Vercel Hobby's daily-cron count limit.
//
// Trade-off vs running them separately:
// - Reconciler window is now ~24h instead of ~2h. Missed-webhook orders may
//   take up to a day to surface in CS. Acceptable while volume is low; revisit
//   when upgrading to Vercel Pro (then split back into hourly reconciler + daily prune).
// - Prune still happens daily, same window as before.
//
// The two underlying endpoints (cs-conversion-reconciler, webhook-deliveries-prune)
// are still callable manually with the CRON_SECRET — they are just not on the
// vercel.json cron schedule anymore.

import { NextResponse, type NextRequest } from "next/server";
import { authCron } from "@/lib/auth/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Daily run can take longer than the default; cap at the platform max.
export const maxDuration = 300;

interface JobResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function callInternal(req: NextRequest, path: string): Promise<JobResult> {
  // Build a same-origin URL. On Vercel, x-forwarded-host + x-forwarded-proto
  // are reliable; locally we fall back to req.nextUrl.origin.
  const origin = req.nextUrl.origin;
  const url = `${origin}${path}`;
  const auth = req.headers.get("authorization") ?? "";

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { authorization: auth },
      // Don't cache — we always want fresh execution.
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON response (rare); leave body null
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  // Run reconciler first, then prune. Sequential is fine — total wall time
  // stays well under the 300s cap for low webhook volume.
  const reconciler = await callInternal(req, "/api/cron/cs-conversion-reconciler");
  const prune = await callInternal(req, "/api/cron/webhook-deliveries-prune");

  const completedAt = new Date().toISOString();

  // 207-style: report both job outcomes; overall status is 200 if BOTH ok,
  // 500 if either failed (so the cron platform surfaces the failure).
  const overallOk = reconciler.ok && prune.ok;
  return NextResponse.json(
    {
      startedAt,
      completedAt,
      reconciler: { ok: reconciler.ok, status: reconciler.status, summary: reconciler.body },
      prune: { ok: prune.ok, status: prune.status, summary: prune.body },
    },
    { status: overallOk ? 200 : 500 },
  );
}
