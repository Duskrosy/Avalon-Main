/**
 * Confirm flow — owns the draft→confirmed transition + Shopify sync.
 *
 * Called from POST /api/sales/orders/[id]/confirm and the sync-retry path.
 * Heavy lifting lives here so route handlers stay thin and the integration
 * test can exercise the whole round-trip via a single function call.
 *
 * Sequencing (per design doc rev 2):
 *   T1: SELECT FOR UPDATE on orders → set status='confirmed', sync_status='syncing',
 *       allocate avalon_order_number, INSERT order_shopify_syncs row pending → in_flight
 *       (caller must run inventory_allocate via create_inventory_movement before this)
 *   T2: Shopify POST /orders.json with 8s AbortController timeout
 *   T3: On result, UPDATE order_shopify_syncs status + UPDATE orders sync_status/shopify_order_id
 *
 * Idempotency on retry: before any Shopify POST in retry mode, check existing
 * order_shopify_syncs rows. If a 'succeeded' row exists, recover its
 * shopify_order_id (no Shopify POST needed). If only failed/cancelled rows,
 * fall back to fetchShopifyOrderByNoteAttribute as a secondary guard before
 * creating a fresh attempt — covers "Shopify created the order but the
 * response was lost" scenarios.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createShopifyOrder,
  fetchShopifyOrderByNoteAttribute,
  type ShopifyOrderInput,
  type ShopifyOrderLineItemInput,
} from "@/lib/shopify/client";
import { resolveShopifyProvinceName } from "@/lib/sales/ph-province-resolver";

export type ConfirmFlowResult =
  | {
      ok: true;
      shopifyOrderId: string;
      avalonOrderNumber: string;
      attemptNumber: number;
      recovered: boolean;     // true if recovered via idempotency guard
      pending: false;
    }
  | {
      ok: true;
      pending: true;          // 8s timeout fired; client should poll
      avalonOrderNumber: string;
      attemptNumber: number;
    }
  | {
      ok: false;
      stage: "fetch" | "guard" | "shopify_post" | "update";
      error: string;
      avalonOrderNumber: string | null;
      attemptNumber: number | null;
    };

const SHOPIFY_TIMEOUT_MS = 8_000;

type OrderRow = {
  id: string;
  status: string;
  sync_status: string;
  avalon_order_number: string | null;
  shopify_order_id: string | null;
  customer_id: string;
  voucher_code: string | null;
  voucher_discount_amount: number;
  manual_discount_amount: number;
  shipping_fee_amount: number;
  final_total_amount: number;
  mode_of_payment: string | null;
  person_in_charge_label: string | null;
  route_type: string;
  notes: string | null;
};

type OrderItemRow = {
  shopify_variant_id: string | null;
  shopify_product_id: string | null;
  product_name: string;
  variant_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price_amount: number;
  adjusted_unit_price_amount: number | null;
};

type CustomerRow = {
  id: string;
  shopify_customer_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city_text: string | null;
  region_text: string | null;
  postal_code: string | null;
  city_code: string | null;
  region_code: string | null;
  barangay_code: string | null;
  /** Agent-confirmed Shopify-acceptable PH province (set on customer at
   * create/edit time). Authoritative over the server-side resolver. */
  shopify_region: string | null;
  /** Resolved barangay name from ph_barangays. Appended to Shopify's
   * address1 as "<street> Barangay <name>" so couriers see it on the
   * waybill — Avalon keeps the structured fields separate. */
  barangay_text?: string | null;
  /** Resolved Shopify-acceptable province name (Cebu, Bulacan, Metro
   * Manila, …). Resolved post-fetch; populated only when address fields
   * actually go to Shopify. */
  province_name?: string | null;
};

/**
 * Build the Shopify order payload from Avalon rows. Honors COD payment-due-later
 * (no transactions[]) and Inventory v1 ownership (inventory_behavior='bypass').
 */
function buildShopifyOrderInput(
  order: OrderRow,
  items: OrderItemRow[],
  customer: CustomerRow,
  agentHandle: string | null,
): ShopifyOrderInput {
  const lineItems: ShopifyOrderLineItemInput[] = items.map((it) => {
    const price = it.adjusted_unit_price_amount ?? it.unit_price_amount;
    const li: ShopifyOrderLineItemInput = {
      title: it.product_name,
      quantity: it.quantity,
      price: price.toFixed(2),
    };
    if (it.shopify_variant_id) {
      // Shopify variant ids are large integers; accept as string and let
      // Shopify coerce — tested in fetchShopifyOrderById elsewhere.
      li.variant_id = it.shopify_variant_id;
    }
    return li;
  });

  const customerRef =
    customer.shopify_customer_id != null
      ? { id: Number(customer.shopify_customer_id) }
      : {
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
          phone: customer.phone,
        };

  const noteAttributes: Array<{ name: string; value: string }> = [];
  if (order.avalon_order_number) {
    noteAttributes.push({ name: "avalon_order_number", value: order.avalon_order_number });
  }
  if (order.mode_of_payment) {
    noteAttributes.push({ name: "mode_of_payment", value: order.mode_of_payment });
  }
  if (order.person_in_charge_label) {
    noteAttributes.push({ name: "person_in_charge", value: order.person_in_charge_label });
  }
  noteAttributes.push({ name: "route_type", value: order.route_type });

  const tags = ["avalon"];
  if (agentHandle) tags.push(`created-by-${agentHandle}`);

  const input: ShopifyOrderInput = {
    customer: customerRef,
    line_items: lineItems,
    note_attributes: noteAttributes,
    tags: tags.join(", "),
    note: order.notes ?? undefined,
    inventory_behavior: "bypass",
  };

  if (order.voucher_code) {
    input.discount_codes = [
      {
        code: order.voucher_code,
        amount: order.voucher_discount_amount.toFixed(2),
        type: "fixed_amount",
      },
    ];
  }

  if (order.shipping_fee_amount > 0) {
    input.shipping_lines = [
      {
        title: "Shipping",
        price: order.shipping_fee_amount.toFixed(2),
      },
    ];
  }

  if (
    customer.address_line_1 ||
    customer.city_text ||
    customer.region_text ||
    customer.postal_code ||
    customer.barangay_text
  ) {
    // Compose address1 with the barangay appended ("Lot 3, Jose St
     // Barangay Talon Uno") so couriers see it inline on the waybill.
    const street = (customer.address_line_1 ?? "").trim();
    const barangay = (customer.barangay_text ?? "").trim();
    const composedAddress1 =
      street && barangay
        ? `${street} Barangay ${barangay}`
        : street
          ? street
          : barangay
            ? `Barangay ${barangay}`
            : undefined;
    input.shipping_address = {
      first_name: customer.first_name,
      last_name: customer.last_name,
      address1: composedAddress1,
      address2: customer.address_line_2 ?? undefined,
      city: customer.city_text ?? undefined,
      province: customer.province_name ?? undefined,
      zip: customer.postal_code ?? undefined,
      phone: customer.phone ?? undefined,
      country: "PH",
    };
  }

  return input;
}

/**
 * Run the Shopify POST with an 8s soft timeout. On timeout, the response
 * resolves to { timedOut: true } and the caller transitions the order to
 * pending=true so the drawer polls instead of hanging.
 */
async function postWithTimeout(input: ShopifyOrderInput): Promise<
  | {
      kind: "ok";
      shopifyOrderId: string;
      shopifyOrderName: string | null;
      shopifyOrderNumber: number | null;
      financialStatus: string | null;
      fulfillmentStatus: string | null;
    }
  | { kind: "error"; message: string }
  | { kind: "timeout" }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHOPIFY_TIMEOUT_MS);
  try {
    const result = await Promise.race([
      createShopifyOrder(input).then((order) => ({
        kind: "ok" as const,
        shopifyOrderId: String(order.id),
        shopifyOrderName: order.name ?? null,
        shopifyOrderNumber:
          typeof order.order_number === "number" ? order.order_number : null,
        financialStatus: order.financial_status ?? null,
        fulfillmentStatus: order.fulfillment_status ?? null,
      })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        controller.signal.addEventListener("abort", () => resolve({ kind: "timeout" }));
      }),
    ]);
    return result;
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export type ConfirmFlowOptions = {
  /** True when invoked from /sync-retry or the reconciler. Triggers the idempotency guard. */
  isRetry?: boolean;
  /** Acting agent handle for Shopify tags. */
  agentHandle?: string | null;
};

/**
 * Execute the confirm/sync flow. Caller is responsible for:
 *   1. AuthZ (owner or manager) BEFORE calling
 *   2. Inventory v1 allocation BEFORE calling (movement + balance update)
 *   3. Refreshing the order row state to expose the result to the UI
 */
export async function runConfirmFlow(
  supabase: SupabaseClient,
  orderId: string,
  options: ConfirmFlowOptions = {},
): Promise<ConfirmFlowResult> {
  // 1. Fetch the order, items, and customer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order, error: orderErr } = await (supabase as any)
    .from("orders")
    .select(
      "id, status, sync_status, avalon_order_number, shopify_order_id, customer_id, " +
        "voucher_code, voucher_discount_amount, manual_discount_amount, " +
        "shipping_fee_amount, final_total_amount, mode_of_payment, " +
        "person_in_charge_label, route_type, notes",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return {
      ok: false,
      stage: "fetch",
      error: orderErr?.message ?? "order not found",
      avalonOrderNumber: null,
      attemptNumber: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items, error: itemsErr } = await (supabase as any)
    .from("order_items")
    .select(
      "shopify_variant_id, shopify_product_id, product_name, variant_name, " +
        "size, color, quantity, unit_price_amount, adjusted_unit_price_amount",
    )
    .eq("order_id", orderId);

  if (itemsErr || !items || items.length === 0) {
    return {
      ok: false,
      stage: "fetch",
      error: itemsErr?.message ?? "no items",
      avalonOrderNumber: order.avalon_order_number,
      attemptNumber: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer, error: custErr } = await (supabase as any)
    .from("customers")
    .select(
      "id, shopify_customer_id, first_name, last_name, email, phone, " +
        "address_line_1, address_line_2, city_text, region_text, postal_code, " +
        "city_code, region_code, barangay_code, shopify_region",
    )
    .eq("id", order.customer_id)
    .maybeSingle();

  if (custErr || !customer) {
    return {
      ok: false,
      stage: "fetch",
      error: custErr?.message ?? "customer not found",
      avalonOrderNumber: order.avalon_order_number,
      attemptNumber: null,
    };
  }

  // Resolve barangay (for "<street> Barangay <name>"). Province uses
  // the agent-confirmed shopify_region first; resolver only fires for
  // legacy customers that don't have it set yet.
  const [bgyRes, provinceFromResolver] = await Promise.all([
    customer.barangay_code
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("ph_barangays")
          .select("name")
          .eq("code", customer.barangay_code)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    customer.shopify_region
      ? Promise.resolve(null)
      : resolveShopifyProvinceName(supabase, {
          city_code: customer.city_code,
          region_code: customer.region_code,
        }),
  ]);
  customer.barangay_text =
    (bgyRes?.data as { name?: string } | null)?.name ?? null;
  customer.province_name = customer.shopify_region ?? provinceFromResolver;

  // 2. Idempotency guard for retry path.
  if (options.isRetry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: priorSyncs } = await (supabase as any)
      .from("order_shopify_syncs")
      .select(
        "id, attempt_number, status, shopify_order_id, shopify_order_name, shopify_order_number",
      )
      .eq("order_id", orderId)
      .order("attempt_number", { ascending: false });

    const succeeded = (priorSyncs ?? []).find(
      (s: {
        status: string;
        shopify_order_id: string | null;
      }) => s.status === "succeeded" && s.shopify_order_id,
    ) as
      | {
          attempt_number: number;
          shopify_order_id: string;
          shopify_order_name: string | null;
          shopify_order_number: number | null;
        }
      | undefined;
    if (succeeded) {
      // Recover from a previously-successful attempt without re-POSTing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("orders")
        .update({
          sync_status: "synced",
          shopify_order_id: succeeded.shopify_order_id,
          shopify_order_name: succeeded.shopify_order_name ?? null,
          shopify_order_number: succeeded.shopify_order_number ?? null,
          sync_error: null,
        })
        .eq("id", orderId);
      return {
        ok: true,
        shopifyOrderId: succeeded.shopify_order_id,
        avalonOrderNumber: order.avalon_order_number ?? "",
        attemptNumber: succeeded.attempt_number,
        recovered: true,
        pending: false,
      };
    }

    // Secondary guard: search Shopify by note_attributes.avalon_order_number
    // to detect "POST succeeded but response packet lost" scenarios.
    if (order.avalon_order_number) {
      const recovered = await fetchShopifyOrderByNoteAttribute(
        "avalon_order_number",
        order.avalon_order_number,
        2,
      );
      if (recovered) {
        const newAttemptNumber =
          ((priorSyncs ?? [])[0]?.attempt_number ?? 0) + 1;
        const recoveredName = recovered.name ?? null;
        const recoveredNumber =
          typeof recovered.order_number === "number"
            ? recovered.order_number
            : null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("order_shopify_syncs").insert({
          order_id: orderId,
          attempt_number: newAttemptNumber,
          avalon_order_number: order.avalon_order_number,
          shopify_order_id: String(recovered.id),
          shopify_order_name: recoveredName,
          shopify_order_number: recoveredNumber,
          status: "succeeded",
          sync_finished_at: new Date().toISOString(),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("orders")
          .update({
            sync_status: "synced",
            shopify_order_id: String(recovered.id),
            shopify_order_name: recoveredName,
            shopify_order_number: recoveredNumber,
            shopify_financial_status: recovered.financial_status ?? null,
            shopify_fulfillment_status: recovered.fulfillment_status ?? null,
            sync_error: null,
          })
          .eq("id", orderId);
        return {
          ok: true,
          shopifyOrderId: String(recovered.id),
          avalonOrderNumber: order.avalon_order_number,
          attemptNumber: newAttemptNumber,
          recovered: true,
          pending: false,
        };
      }
    }
  }

  // 3. Allocate avalon_order_number (first-time only) and register a sync attempt.
  let avalonOrderNumber = order.avalon_order_number;
  if (!avalonOrderNumber) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: numRow } = await (supabase as any).rpc(
      "next_avalon_order_number",
    );
    if (typeof numRow === "string" && numRow.length > 0) {
      avalonOrderNumber = numRow;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("orders")
        .update({
          status: "confirmed",
          sync_status: "syncing",
          avalon_order_number: avalonOrderNumber,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", orderId);
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("orders")
      .update({ sync_status: "syncing" })
      .eq("id", orderId);
  }

  if (!avalonOrderNumber) {
    return {
      ok: false,
      stage: "update",
      error: "failed to allocate avalon_order_number",
      avalonOrderNumber: null,
      attemptNumber: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingAttempts } = await (supabase as any)
    .from("order_shopify_syncs")
    .select("attempt_number")
    .eq("order_id", orderId)
    .order("attempt_number", { ascending: false })
    .limit(1);
  const attemptNumber = ((existingAttempts ?? [])[0]?.attempt_number ?? 0) + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: attemptRow, error: attemptErr } = await (supabase as any)
    .from("order_shopify_syncs")
    .insert({
      order_id: orderId,
      attempt_number: attemptNumber,
      avalon_order_number: avalonOrderNumber,
      status: "in_flight",
    })
    .select("id")
    .single();

  if (attemptErr) {
    return {
      ok: false,
      stage: "update",
      error: attemptErr.message,
      avalonOrderNumber,
      attemptNumber,
    };
  }

  // 4. Fire the Shopify POST with 8s timeout.
  // NOTE: order.apply_automatic_discounts is honored at PREVIEW time
  // (drawer's preview-discounts endpoint via draftOrderCalculate) and the
  // snapshot is written to orders.automatic_discount_snapshot at confirm.
  // The Shopify REST /orders.json endpoint we POST to here does NOT
  // auto-apply automatic discounts on create — that's a checkout/draft-order
  // feature. To make Shopify apply them server-side, switch to
  // GraphQL orderCreate(applyAutomaticDiscount: true) or use Draft Orders
  // API. Tracked as a follow-up; preview-time intent is sufficient for
  // reporting today since the agent has already seen and confirmed the
  // applied chip.
  const orderForBuild = { ...order, avalon_order_number: avalonOrderNumber };
  const input = buildShopifyOrderInput(
    orderForBuild,
    items,
    customer,
    options.agentHandle ?? null,
  );
  const result = await postWithTimeout(input);

  if (result.kind === "timeout") {
    // Leave attempt as 'in_flight'; reconciler picks it up after 5 min.
    return {
      ok: true,
      pending: true,
      avalonOrderNumber,
      attemptNumber,
    };
  }

  if (result.kind === "error") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("order_shopify_syncs")
      .update({
        status: "failed",
        sync_finished_at: new Date().toISOString(),
        error_message: result.message,
      })
      .eq("id", attemptRow.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("orders")
      .update({ sync_status: "failed", sync_error: result.message })
      .eq("id", orderId);
    return {
      ok: false,
      stage: "shopify_post",
      error: result.message,
      avalonOrderNumber,
      attemptNumber,
    };
  }

  // success
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("order_shopify_syncs")
    .update({
      status: "succeeded",
      sync_finished_at: new Date().toISOString(),
      shopify_order_id: result.shopifyOrderId,
      shopify_order_name: result.shopifyOrderName,
      shopify_order_number: result.shopifyOrderNumber,
    })
    .eq("id", attemptRow.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("orders")
    .update({
      sync_status: "synced",
      shopify_order_id: result.shopifyOrderId,
      shopify_order_name: result.shopifyOrderName,
      shopify_order_number: result.shopifyOrderNumber,
      shopify_financial_status: result.financialStatus,
      shopify_fulfillment_status: result.fulfillmentStatus,
      sync_error: null,
    })
    .eq("id", orderId);

  return {
    ok: true,
    shopifyOrderId: result.shopifyOrderId,
    avalonOrderNumber,
    attemptNumber,
    recovered: false,
    pending: false,
  };
}
