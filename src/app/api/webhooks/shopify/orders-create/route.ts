// src/app/api/webhooks/shopify/orders-create/route.ts
//
// POST /api/webhooks/shopify/orders-create
//
// Receives Shopify orders/create webhook events (fired on every new Shopify
// order). Verifies the HMAC signature, deduplicates via cs_webhook_deliveries,
// classifies the order into an intake lane, and inserts it into orders.
//
// Shopify retries on non-200 — the dedup table prevents double-processing.
// Uses the service-role client (webhook arrives unauthenticated, no cookie).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyShopifyWebhook } from "@/lib/shopify/webhook-verify";
import { processIncomingShopifyOrder } from "@/lib/cs/intake/process-shopify-order";
import type { ShopifyOrderPayload } from "@/lib/cs/intake/process-shopify-order";

export async function POST(req: NextRequest) {
  // 1. Read raw body FIRST — must be raw string for HMAC verification.
  //    Do NOT call req.json() before this — it consumes the stream.
  const rawBody = await req.text();

  // 2. Verify HMAC-SHA256 signature
  const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[shopify/orders-create] SHOPIFY_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const isValid = verifyShopifyWebhook(rawBody, hmacHeader, secret);
  if (!isValid) {
    console.warn("[shopify/orders-create] HMAC verification failed", {
      hasHeader: Boolean(hmacHeader),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Idempotency: insert webhook delivery id into dedup table.
  //    X-Shopify-Webhook-Id is set by Shopify and unique per delivery attempt.
  const webhookId = req.headers.get("X-Shopify-Webhook-Id");

  const admin = createAdminClient();

  if (webhookId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dedupError } = await (admin as any)
      .from("cs_webhook_deliveries")
      .insert({ shopify_webhook_id: webhookId });

    if (dedupError) {
      // Unique constraint violation = replay; skip processing.
      const isReplay =
        dedupError.code === "23505" ||
        (dedupError.message ?? "").includes("duplicate") ||
        (dedupError.message ?? "").includes("unique");

      if (isReplay) {
        return NextResponse.json({ duplicate: true });
      }

      // Other insert error — log but continue (don't lose the event over a
      // dedup-table failure)
      console.error("[shopify/orders-create] dedup insert error:", dedupError.message);
    }
  } else {
    console.warn("[shopify/orders-create] X-Shopify-Webhook-Id header missing — skipping dedup");
  }

  // 4. Parse body and process
  let payload: ShopifyOrderPayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyOrderPayload;
  } catch (parseErr) {
    console.error("[shopify/orders-create] Failed to parse JSON body:", parseErr);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await processIncomingShopifyOrder(admin, payload, "webhook");

  if (result.status === "error") {
    console.error("[shopify/orders-create] processIncomingShopifyOrder error", {
      error: result.error,
      shopify_order_id: payload.id,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json(result);
}
