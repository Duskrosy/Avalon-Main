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
import { runConfirmFlow } from "@/lib/sales/confirm-flow";
import { releaseOrder } from "@/lib/sales/release-order";

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
});
