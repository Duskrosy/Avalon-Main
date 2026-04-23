// Diagnostic: list shopify_sync_runs, detect gaps, and show Shopify-order date coverage.
// Run: bun scripts/diagnose-shopify-sync.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Minimal .env.local loader (bun doesn't auto-load .env.local).
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch { /* ignore */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runs, error: runsErr } = await (admin as any)
    .from("shopify_sync_runs")
    .select("sync_date, status, triggered_by, orders_synced, started_at, completed_at, error_log")
    .order("started_at", { ascending: false })
    .limit(90);

  if (runsErr) {
    console.error("query failed:", runsErr.message);
    process.exit(1);
  }

  const rows: Array<{
    sync_date: string | null;
    status: string;
    triggered_by: string;
    orders_synced: number | null;
    started_at: string;
    completed_at: string | null;
    error_log: string | null;
  }> = runs ?? [];

  console.log(`\nLast ${rows.length} sync runs:\n`);
  console.log("date       | status  | by     | orders | started                        | error");
  console.log("-----------|---------|--------|--------|--------------------------------|------");
  for (const r of rows.slice(0, 30)) {
    const err = r.error_log ? r.error_log.slice(0, 50).replace(/\n/g, " ") : "";
    console.log(
      `${(r.sync_date ?? "-").padEnd(10)} | ${r.status.padEnd(7)} | ${r.triggered_by.padEnd(6)} | ${String(r.orders_synced ?? "-").padStart(6)} | ${r.started_at.padEnd(30)} | ${err}`,
    );
  }

  // Count by status + trigger
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = `${r.triggered_by}/${r.status}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  console.log("\nRun counts by trigger/status (last 90):");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(20)} ${v}`);

  // Detect calendar-day gaps from the cron. Cron fires daily so we expect a cron row per day.
  const days = new Set<string>();
  for (const r of rows) {
    if (r.triggered_by === "cron" && r.status === "success" && r.sync_date) {
      days.add(r.sync_date);
    }
  }
  const today = new Date();
  const missing: string[] = [];
  for (let i = 1; i <= 60; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (!days.has(iso)) missing.push(iso);
  }
  console.log(`\nDays in the last 60 with NO successful cron run: ${missing.length}`);
  if (missing.length > 0) console.log(`  ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? ", …" : ""}`);

  // Shopify-order coverage: count distinct order dates in shopify_orders (last 60 days)
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders, error: ordErr } = await (admin as any)
    .from("shopify_orders")
    .select("created_at_shopify")
    .gte("created_at_shopify", since);

  if (ordErr) {
    console.error("\nshopify_orders query failed:", ordErr.message);
    return;
  }

  const orderDays = new Map<string, number>();
  for (const o of orders ?? []) {
    const day = String(o.created_at_shopify).slice(0, 10);
    orderDays.set(day, (orderDays.get(day) ?? 0) + 1);
  }
  const orderMissing: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (!orderDays.has(iso)) orderMissing.push(iso);
  }
  console.log(`\nDays in the last 60 with ZERO shopify_orders rows: ${orderMissing.length}`);
  if (orderMissing.length > 0) console.log(`  ${orderMissing.slice(0, 20).join(", ")}${orderMissing.length > 20 ? ", …" : ""}`);
  console.log(`\nTotal shopify_orders in last 60 days: ${orders?.length ?? 0}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
