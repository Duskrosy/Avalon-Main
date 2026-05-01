// src/lib/cs/intake/process-shopify-order.ts
//
// Shared helper used by both the Shopify webhook handler and the hourly
// reconciler. Classifies an incoming Shopify order, upserts the customer,
// inserts the order (idempotent on shopify_order_id unique constraint), and
// records quarantine / classifier-disagreement rows as needed.
//
// DESIGN NOTES
// ─────────────
// • Pure-ish function: all DB access goes through the injected SupabaseClient
//   so tests can provide a mock.
// • Never throws — all errors are returned as { status: 'error', error }.
// • source_winner on disagreement rows is always hardcoded to 'webhook'
//   because we have no reliable way to know from inside this function which
//   path won the INSERT race. The winning row's source is unknown at conflict
//   time. DONE_WITH_CONCERNS — a future orders.intake_source column could
//   fix this.

import {
  classifyIntakeLane,
  type ShopifyOrderForClassification,
  type AvalonLinkage,
  type IntakeLane,
} from "../../sales/intake-lane";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IntakeSource = "webhook" | "reconciler";

export type ProcessResult =
  | { status: "inserted";     orderId: string; lane: IntakeLane }
  | { status: "duplicate";    orderId?: string; lane?: IntakeLane }
  | { status: "disagreement"; orderId: string; lane: IntakeLane }
  | { status: "error";        error: string };

/**
 * The Shopify order shape we need for intake. Extends the classification
 * interface with the concrete fields required to insert an orders row.
 */
export interface ShopifyOrderPayload extends ShopifyOrderForClassification {
  id: number;                                    // Shopify order id (large int)
  total_price: string;                           // "1500.00"
  payment_gateway: string | null;
  created_at: string;                            // ISO timestamp from Shopify
  customer: {
    id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  } | null;
  note_attributes?: Array<{ name: string; value: string }> | null;
}

/**
 * Find-or-create an Avalon customer row from a Shopify customer object.
 * Matches by shopify_customer_id first; falls back to upsert by phone if
 * the customer has no Shopify ID (guest checkout).
 *
 * Returns the Avalon customer uuid, or null if we can't derive enough info
 * to create a row (name fields missing).
 */
async function findOrCreateCustomer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  shopifyCustomer: ShopifyOrderPayload["customer"],
): Promise<string | null> {
  if (!shopifyCustomer) return null;

  const firstName = shopifyCustomer.first_name?.trim() || "Unknown";
  const lastName = shopifyCustomer.last_name?.trim() || "Customer";
  const shopifyCustomerId = String(shopifyCustomer.id);

  // 1. Try to find by shopify_customer_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("customers")
    .select("id")
    .eq("shopify_customer_id", shopifyCustomerId)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  // 2. Insert new customer row (race-safe: catch 23505 and re-fetch)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertErr } = await (supabase as any)
    .from("customers")
    .insert({
      shopify_customer_id: shopifyCustomerId,
      first_name: firstName,
      last_name: lastName,
      email: shopifyCustomer.email ?? null,
      phone: shopifyCustomer.phone ?? null,
    })
    .select("id")
    .single();

  if (insertErr?.code === "23505") {
    // Race: another concurrent process inserted between our SELECT and INSERT.
    // Re-fetch — the row exists now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: refetched } = await (supabase as any)
      .from("customers")
      .select("id")
      .eq("shopify_customer_id", shopifyCustomerId)
      .maybeSingle();
    if (refetched?.id) return refetched.id as string;
    throw new Error(`23505 on customer insert but re-fetch returned no row: ${insertErr.message}`);
  }

  if (insertErr) throw insertErr;
  return inserted!.id as string;
}

/**
 * Determine the Avalon linkage for a Shopify order.
 *
 * - hasAvalonOrderRecord: an orders row with this shopify_order_id already exists.
 * - hasAvalonNoteAttribute: the payload carries a note_attribute written by the
 *   Avalon sales confirm flow (name='avalon_order_number').
 */
async function detectAvalonLinkage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  shopifyOrderId: string,
  noteAttributes: Array<{ name: string; value: string }> | null | undefined,
): Promise<AvalonLinkage> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingOrder } = await (supabase as any)
    .from("orders")
    .select("id")
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();

  const hasAvalonOrderRecord = Boolean(existingOrder?.id);
  const hasAvalonNoteAttribute = (noteAttributes ?? []).some(
    (a) => a.name === "avalon_order_number",
  );

  return { hasAvalonOrderRecord, hasAvalonNoteAttribute };
}

/**
 * Process an incoming Shopify order through the conversion-lane intake pipeline.
 *
 * Steps:
 *  1. Detect Avalon linkage (existing order record or note_attribute).
 *  2. Classify lane using classifyIntakeLane().
 *  3. Upsert customer.
 *  4. INSERT into orders — idempotent on shopify_order_id unique constraint.
 *  5. If quarantine lane: INSERT into cs_intake_quarantine_review.
 *  6. If conflict and lane differs from winner: INSERT into cs_intake_classifier_disagreements.
 */
export async function processIncomingShopifyOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  shopifyOrder: ShopifyOrderPayload,
  source: IntakeSource,
): Promise<ProcessResult> {
  try {
    const shopifyOrderId = String(shopifyOrder.id);

    // Step 1: Detect linkage
    const linkage = await detectAvalonLinkage(
      supabase,
      shopifyOrderId,
      shopifyOrder.note_attributes,
    );

    // Step 2: Classify
    const lane = classifyIntakeLane(shopifyOrder, linkage);

    // Step 3: Find-or-create customer
    // TODO: guest checkout orders (shopifyOrder.customer === null) cannot be
    // linked to a real customer. We create a placeholder only when customer
    // data is present. If null, the insert will fail the NOT NULL constraint
    // on orders.customer_id. This needs a follow-up migration to allow
    // nullable customer_id for conversion-lane orders, or a system sentinel
    // customer row. For now, return an error for guest checkouts.
    const customerId = await findOrCreateCustomer(supabase, shopifyOrder.customer);
    if (!customerId) {
      return {
        status: "error",
        error:
          "Cannot process order without a customer: guest checkout or customer lookup failed. " +
          `shopify_order_id=${shopifyOrderId}`,
      };
    }

    // Build insert row from Shopify payload.
    // Fields we CAN populate from the webhook payload are populated.
    // Fields we cannot trivially derive are left NULL with TODO comments.
    const orderRow = {
      shopify_order_id: shopifyOrderId,
      customer_id: customerId,
      intake_lane: lane,
      shopify_source_name: shopifyOrder.source_name ?? null,
      shopify_gateway: shopifyOrder.payment_gateway ?? null,
      // TODO: shopify_card_last4 and shopify_transaction_id require a
      // /orders/{id}/transactions.json call — not in the base webhook payload.
      // Leave null; a follow-up enrichment job can backfill these.
      shopify_card_last4: null,
      shopify_transaction_id: null,
      // shopify_transaction_at: null for same reason as above.
      shopify_transaction_at: null,
      // Amount fields: Shopify returns total_price as a string ("1500.00").
      // subtotal, voucher, shipping breakdown are not in the base webhook payload.
      // We store total_price in final_total_amount and leave breakdown fields at 0.
      final_total_amount: parseFloat(shopifyOrder.total_price ?? "0") || 0,
      subtotal_amount: 0,          // TODO: derive from line_items if needed
      voucher_discount_amount: 0,
      manual_discount_amount: 0,
      shipping_fee_amount: 0,
      // Status: conversion-lane orders from Shopify arrive already confirmed
      // (payment taken). Use 'confirmed' + 'synced' since Shopify is the source.
      status: "confirmed",
      sync_status: "synced",
      completion_status: "incomplete",
      // created_by_user_id: null — no Avalon agent created this order.
      created_by_user_id: null,
      created_by_name: null,
    };

    // Step 4: INSERT (idempotent on shopify_order_id unique constraint)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertError } = await (supabase as any)
      .from("orders")
      .insert(orderRow)
      .select("id, intake_lane")
      .single();

    if (insertError) {
      // Unique constraint violation → duplicate delivery
      const isDuplicateError =
        insertError.code === "23505" || // PostgreSQL unique_violation
        (insertError.message ?? "").includes("duplicate") ||
        (insertError.message ?? "").includes("unique");

      if (!isDuplicateError) {
        console.error("[process-shopify-order] orders INSERT failed", {
          code: insertError.code,
          message: insertError.message,
          hint: insertError.hint,
          details: insertError.details,
          shopify_order_id: shopifyOrderId,
        });
        return { status: "error", error: "Internal error" };
      }

      // Fetch the winner row to compare lanes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: winner } = await (supabase as any)
        .from("orders")
        .select("id, intake_lane")
        .eq("shopify_order_id", shopifyOrderId)
        .maybeSingle();

      if (winner && winner.intake_lane !== lane) {
        // Lanes disagree — log it for classifier tuning.
        // DONE_WITH_CONCERNS: source_winner is hardcoded to 'webhook' because we
        // have no reliable way to know which intake source won the INSERT race.
        // A future orders.intake_source column could fix this properly.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("cs_intake_classifier_disagreements").insert({
          order_id: winner.id,
          winner_lane: winner.intake_lane,
          loser_lane: lane,
          source_winner: "webhook",    // DONE_WITH_CONCERNS: see note above
          source_loser: source,
        });

        return { status: "disagreement", orderId: winner.id, lane };
      }

      return { status: "duplicate", orderId: winner?.id, lane };
    }

    const orderId: string = inserted.id as string;

    // Step 5: If quarantine, insert review row
    if (lane === "quarantine") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("cs_intake_quarantine_review").insert({
        order_id: orderId,
        shopify_payload_snapshot: shopifyOrder as unknown as Record<string, unknown>,
      });
    }

    return { status: "inserted", orderId, lane };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
