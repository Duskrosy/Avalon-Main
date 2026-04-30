// @ts-nocheck — vitest is not yet installed in this project.
//
// To run this test:
//   1. npm install --save-dev vitest @vitest/ui
//   2. Add scripts to package.json:
//        "test": "vitest run",
//        "test:watch": "vitest"
//   3. Create vitest.config.ts (see TESTING.md)
//   4. Remove the @ts-nocheck above and run `npm test`.
//
// This test exercises the Phase 1 round-trip:
//   create draft → add items → confirm (with mocked Shopify) → revert →
//   re-confirm. It also covers the idempotency guard's "Shopify succeeded
//   but response was lost" recovery scenario.
//
// Per the design doc rev 2 testing plan, this single integration test is
// Phase 1's verification surface. Per-route unit tests are deferred to
// Phase 2/3 alongside the rest of the test suite.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runConfirmFlow } from "@/lib/sales/confirm-flow";
import { releaseOrder } from "@/lib/sales/release-order";

// ─── HTTP-integration scaffolding (used only by the end-to-end case below) ───
//
// The new "drawer → CS inbox → dispatch → courier picked_up" case below talks
// to a running dev server and a real Supabase project. It is NOT exercised by
// the existing mocked unit tests above. To run it you need:
//   TEST_BASE_URL                 (defaults to http://localhost:3000)
//   TEST_CUSTOMER_ID              (existing customer row in the target DB)
//   SUPABASE_URL                  (or NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY     (server-side admin key)
// Migrations 00096 + 00097 must be applied to that DB.
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const TEST_CUSTOMER_ID = process.env.TEST_CUSTOMER_ID ?? "";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const admin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : (null as any);

// ─── Test doubles ────────────────────────────────────────────────────────────

function makeSupabase() {
  const tables: Record<string, any[]> = {
    orders: [],
    order_items: [],
    order_shopify_syncs: [],
    customers: [],
  };
  let avalonSeq = 1000;

  const builder = (tableName: string) => {
    const ctx: any = {
      _table: tableName,
      _filters: [] as Array<(row: any) => boolean>,
      _select: "*",
      _orderBy: null as { col: string; ascending: boolean } | null,
      _limit: Infinity,
      eq(col: string, val: any) {
        ctx._filters.push((r: any) => r[col] === val);
        return ctx;
      },
      lt(col: string, val: any) {
        ctx._filters.push((r: any) => r[col] < val);
        return ctx;
      },
      in(col: string, vals: any[]) {
        ctx._filters.push((r: any) => vals.includes(r[col]));
        return ctx;
      },
      is(col: string, val: any) {
        ctx._filters.push((r: any) =>
          val === null ? r[col] == null : r[col] === val,
        );
        return ctx;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        ctx._orderBy = { col, ascending: opts?.ascending !== false };
        return ctx;
      },
      limit(n: number) {
        ctx._limit = n;
        return ctx;
      },
      select(s: string) {
        ctx._select = s;
        return ctx;
      },
      single() {
        return ctx._exec().then((data: any[]) => ({
          data: data[0] ?? null,
          error: null,
        }));
      },
      maybeSingle() {
        return ctx.single();
      },
      _exec() {
        let rows = tables[tableName] ?? [];
        for (const f of ctx._filters) rows = rows.filter(f);
        if (ctx._orderBy) {
          const { col, ascending } = ctx._orderBy;
          rows = [...rows].sort((a, b) =>
            ascending ? (a[col] > b[col] ? 1 : -1) : a[col] < b[col] ? 1 : -1,
          );
        }
        if (ctx._limit < Infinity) rows = rows.slice(0, ctx._limit);
        return Promise.resolve(rows);
      },
      then(resolve: any, reject?: any) {
        return ctx._exec().then((data: any[]) => resolve({ data, error: null }), reject);
      },
      insert(values: any | any[]) {
        const arr = Array.isArray(values) ? values : [values];
        const inserted = arr.map((v) => ({ id: cryptoRandom(), ...v }));
        tables[tableName] = [...(tables[tableName] ?? []), ...inserted];
        const inner = {
          select(_s: string) {
            return inner;
          },
          single() {
            return Promise.resolve({ data: inserted[0], error: null });
          },
          then(resolve: any, reject?: any) {
            return Promise.resolve({ data: inserted, error: null }).then(resolve, reject);
          },
        };
        return inner;
      },
      update(patch: any) {
        const inner = {
          eq(col: string, val: any) {
            tables[tableName] = (tables[tableName] ?? []).map((r) =>
              r[col] === val ? { ...r, ...patch } : r,
            );
            return inner;
          },
          in(col: string, vals: any[]) {
            tables[tableName] = (tables[tableName] ?? []).map((r) =>
              vals.includes(r[col]) ? { ...r, ...patch } : r,
            );
            return inner;
          },
          then(resolve: any, reject?: any) {
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return inner;
      },
      delete() {
        const inner = {
          eq(col: string, val: any) {
            tables[tableName] = (tables[tableName] ?? []).filter(
              (r) => r[col] !== val,
            );
            return inner;
          },
          then(resolve: any, reject?: any) {
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return inner;
      },
    };
    return ctx;
  };

  return {
    from: (table: string) => builder(table),
    rpc: async (name: string) => {
      if (name === "next_avalon_order_number") return `AV-${++avalonSeq}`;
      return null;
    },
    _tables: tables,
  };
}

function cryptoRandom() {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

// ─── Mock Shopify HTTP layer ─────────────────────────────────────────────────

let shopifyOrders: any[] = [];
let shopifyShouldFail = false;
let shopifyResponseLost = false;

vi.mock("@/lib/shopify/client", async () => {
  return {
    createShopifyOrder: vi.fn(async (input) => {
      if (shopifyShouldFail) throw new Error("Shopify 503");
      const order = { id: Math.floor(Math.random() * 1e9), ...input };
      shopifyOrders.push(order);
      if (shopifyResponseLost) {
        throw new Error("network blip — but Shopify recorded the order");
      }
      return order;
    }),
    fetchShopifyOrderByNoteAttribute: vi.fn(async (name, value) => {
      return (
        shopifyOrders.find((o) =>
          (o.note_attributes ?? []).some(
            (a: any) => a.name === name && a.value === value,
          ),
        ) ?? null
      );
    }),
    cancelShopifyOrder: vi.fn(async (id) => {
      shopifyOrders = shopifyOrders.filter((o) => String(o.id) !== String(id));
      return { id, cancelled: true };
    }),
    searchShopifyCustomers: vi.fn(async () => []),
    createShopifyCustomer: vi.fn(async (input) => ({
      id: Math.floor(Math.random() * 1e9),
      ...input,
    })),
  };
});

describe("Phase 1 round-trip", () => {
  beforeEach(() => {
    shopifyOrders = [];
    shopifyShouldFail = false;
    shopifyResponseLost = false;
  });

  it("creates a draft, confirms it, syncs to Shopify", async () => {
    const supabase = makeSupabase() as any;
    // Seed customer + order + items
    supabase._tables.customers = [
      {
        id: "cust1",
        first_name: "Luke",
        last_name: "Cage",
        email: "luke@example.com",
        phone: "+639170000001",
        shopify_customer_id: null,
      },
    ];
    supabase._tables.orders = [
      {
        id: "order1",
        status: "draft",
        sync_status: "not_synced",
        avalon_order_number: null,
        shopify_order_id: null,
        customer_id: "cust1",
        voucher_code: null,
        voucher_discount_amount: 0,
        manual_discount_amount: 0,
        shipping_fee_amount: 0,
        final_total_amount: 7000,
        mode_of_payment: "COD",
        person_in_charge_label: "Fulfillment",
        route_type: "normal",
        notes: null,
      },
    ];
    supabase._tables.order_items = [
      {
        id: "item1",
        order_id: "order1",
        product_name: "Air Runner Pro",
        quantity: 2,
        unit_price_amount: 3500,
        adjusted_unit_price_amount: null,
      },
    ];

    const result = await runConfirmFlow(supabase, "order1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pending).toBe(false);
      expect(result.shopifyOrderId).toBeTruthy();
      expect(result.avalonOrderNumber).toMatch(/^AV-/);
    }
    expect(shopifyOrders).toHaveLength(1);
  });

  it("retry after lost response does not create a duplicate (idempotency guard)", async () => {
    const supabase = makeSupabase() as any;
    supabase._tables.customers = [
      { id: "cust1", first_name: "L", last_name: "C", shopify_customer_id: null },
    ];
    supabase._tables.orders = [
      {
        id: "order1",
        status: "draft",
        sync_status: "not_synced",
        avalon_order_number: null,
        customer_id: "cust1",
        final_total_amount: 100,
        voucher_discount_amount: 0,
        manual_discount_amount: 0,
        shipping_fee_amount: 0,
        route_type: "normal",
      },
    ];
    supabase._tables.order_items = [
      {
        id: "item1",
        order_id: "order1",
        product_name: "Test",
        quantity: 1,
        unit_price_amount: 100,
      },
    ];

    // Pretend a prior attempt actually succeeded in Shopify but the local
    // response was lost. We seed the Shopify side directly:
    shopifyOrders.push({
      id: 12345,
      note_attributes: [{ name: "avalon_order_number", value: "AV-1001" }],
    });
    supabase._tables.orders[0].avalon_order_number = "AV-1001";
    supabase._tables.order_shopify_syncs = [
      {
        id: "att1",
        order_id: "order1",
        attempt_number: 1,
        avalon_order_number: "AV-1001",
        status: "failed",
        error_message: "lost response",
      },
    ];

    const result = await runConfirmFlow(supabase, "order1", { isRetry: true });
    expect(result.ok).toBe(true);
    if (result.ok && !result.pending) {
      expect(result.recovered).toBe(true);
      expect(result.shopifyOrderId).toBe("12345");
    }
    // Critical: no NEW Shopify order was created.
    expect(shopifyOrders).toHaveLength(1);
  });

  it("revert-to-draft cancels Shopify order and clears identifiers", async () => {
    const supabase = makeSupabase() as any;
    supabase._tables.orders = [
      {
        id: "order1",
        status: "confirmed",
        sync_status: "synced",
        avalon_order_number: "AV-1001",
        shopify_order_id: "12345",
        deleted_at: null,
      },
    ];
    supabase._tables.order_shopify_syncs = [
      {
        id: "att1",
        order_id: "order1",
        attempt_number: 1,
        status: "succeeded",
        shopify_order_id: "12345",
      },
    ];
    shopifyOrders.push({ id: 12345, note_attributes: [] });

    const result = await releaseOrder(supabase, {
      orderId: "order1",
      action: "revert",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.shopifyCancelled).toBe(true);
    }
    expect(shopifyOrders).toHaveLength(0);
    const o = supabase._tables.orders[0];
    expect(o.status).toBe("draft");
    expect(o.sync_status).toBe("not_synced");
    expect(o.avalon_order_number).toBeNull();
    expect(o.shopify_order_id).toBeNull();
    const att = supabase._tables.order_shopify_syncs[0];
    expect(att.status).toBe("cancelled");
  });

  it("end-to-end: drawer → CS inbox → dispatch → courier picked_up", async () => {
    // 1. POST draft with new field shape
    const draftRes = await fetch(`${BASE}/api/sales/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: TEST_CUSTOMER_ID,
        subtotal_amount: 100,
        final_total_amount: 100,
        mode_of_payment: "GCash",
        delivery_method: "tnvs",
        payment_receipt_path: "orders/test/receipt-stub.png",
        items: [
          {
            product_name: "Test Item",
            variant_name: null,
            quantity: 1,
            unit_price_amount: 100,
            line_total_amount: 100,
            adjusted_unit_price_amount: null,
            shopify_product_id: null,
            shopify_variant_id: null,
            product_variant_id: null,
            image_url: null,
            size: null,
            color: null,
          },
        ],
      }),
    });
    expect(draftRes.ok).toBe(true);
    const draft = await draftRes.json();
    const orderId = draft.order?.id ?? draft.id; // shape varies — accept both
    expect(orderId).toBeTruthy();

    let opsId: string | null = null;
    try {
      // 2. Confirm (Shopify sync). Allow either ok or 202 (async-pending).
      const confirmRes = await fetch(
        `${BASE}/api/sales/orders/${orderId}/confirm`,
        { method: "POST" },
      );
      expect([200, 202]).toContain(confirmRes.status);

      // 3. Mark complete with new attribution payload
      const completeRes = await fetch(
        `${BASE}/api/sales/orders/${orderId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            net_value_amount: 100,
            ad_creative_id: "test-creative-id",
            ad_creative_name: "Test Creative",
            is_abandoned_cart: false,
            alex_ai_assist_level: "none",
          }),
        },
      );
      expect(completeRes.ok).toBe(true);

      // 4. Should appear in CS Inbox
      const inboxRes = await fetch(
        `${BASE}/api/customer-service/confirmed-orders?tab=inbox`,
      );
      const inbox = await inboxRes.json();
      const inInbox = (inbox.orders ?? []).find((o: any) => o.id === orderId);
      expect(inInbox).toBeTruthy();

      // 5. Triage to dispatch (creates ops_orders + dispatch_queue via bridge)
      const triageRes = await fetch(
        `${BASE}/api/customer-service/orders/${orderId}/triage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dispatch" }),
        },
      );
      expect(triageRes.ok).toBe(true);

      // 6. Manually insert a courier_event of type 'picked_up' on the
      //    dispatch_queue row that was just created. Use the admin client.
      const { data: opsRow } = await admin
        .from("ops_orders")
        .select("id")
        .eq("sales_order_id", orderId)
        .maybeSingle();
      expect(opsRow).toBeTruthy();
      opsId = opsRow.id;
      const { data: dq } = await admin
        .from("dispatch_queue")
        .select("id")
        .eq("order_id", opsRow.id)
        .maybeSingle();
      expect(dq).toBeTruthy();
      await admin.from("courier_events").insert({
        dispatch_id: dq.id,
        event_type: "picked_up",
        event_time: new Date().toISOString(),
      });

      // 7. Lifecycle should now be 'picked_up' with method 'tnvs'
      const finalRes = await fetch(`${BASE}/api/sales/orders/${orderId}`);
      expect(finalRes.ok).toBe(true);
      const final = await finalRes.json();
      const order = final.order ?? final;
      expect(order.lifecycle_stage).toBe("picked_up");
      expect(order.lifecycle_method).toBe("tnvs");
    } finally {
      // Best-effort inline cleanup. No central afterAll exists in this file.
      if (admin && orderId) {
        try {
          if (opsId) {
            await admin.from("courier_events").delete().eq("dispatch_id", opsId);
            await admin.from("dispatch_queue").delete().eq("order_id", opsId);
            await admin.from("ops_orders").delete().eq("id", opsId);
          }
          await admin.from("order_items").delete().eq("order_id", orderId);
          await admin.from("orders").delete().eq("id", orderId);
        } catch {
          // swallow cleanup errors — test result is what matters
        }
      }
    }
  });
});
