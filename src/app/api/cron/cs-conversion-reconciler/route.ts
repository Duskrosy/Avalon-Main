// src/app/api/cron/cs-conversion-reconciler/route.ts
//
// GET /api/cron/cs-conversion-reconciler  (Vercel Cron — schedule: "0 * * * *")
//
// Hourly reconciler for conversion-lane orders. Queries Shopify for orders
// created in the last 2 hours and pushes them through the same intake pipeline
// as the webhook handler. Catches any orders the webhook missed (transient
// failures, Shopify retry expiry, etc.).
//
// CONCURRENCY DESIGN
// ──────────────────
// Orders are processed in chunks of 5 using Promise.all(). This is intentional:
// • Sequential for-await (like the old sync-reconciler) causes timeout on
//   large batches (memory 4485 — known issue).
// • Unlimited Promise.all() on 250 orders would hammer Supabase connections.
// • Chunks of 5 balance throughput vs. connection pressure.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchShopifyOrders } from "@/lib/shopify/client";
import { processIncomingShopifyOrder } from "@/lib/cs/intake/process-shopify-order";
import type { ShopifyOrderPayload } from "@/lib/cs/intake/process-shopify-order";

const CONCURRENCY = 5;

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Process an array of items concurrently in chunks of `size`.
 * Awaits each chunk before starting the next — prevents uncapped parallelism.
 */
async function processInChunks<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Query the last 2 hours to give a safety margin over the 1h cron interval.
  const createdAtMin = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  let shopifyOrders: ShopifyOrderPayload[];
  try {
    shopifyOrders = (await fetchShopifyOrders({
      createdAtMin,
      status: "any",
    })) as ShopifyOrderPayload[];
  } catch (fetchErr) {
    console.error("[cs-conversion-reconciler] Shopify fetch failed:", fetchErr);
    return NextResponse.json(
      { error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) },
      { status: 500 },
    );
  }

  const summary = { total: shopifyOrders.length, inserted: 0, duplicates: 0, quarantined: 0, errors: 0 };

  await processInChunks(shopifyOrders, CONCURRENCY, async (order) => {
    const result = await processIncomingShopifyOrder(admin, order, "reconciler");

    switch (result.status) {
      case "inserted":
        summary.inserted++;
        if (result.lane === "quarantine") summary.quarantined++;
        break;
      case "duplicate":
      case "disagreement":
        summary.duplicates++;
        break;
      case "error":
        summary.errors++;
        console.error("[cs-conversion-reconciler] order error:", result.error, {
          shopify_order_id: order.id,
        });
        break;
    }
  });

  return NextResponse.json(summary);
}
