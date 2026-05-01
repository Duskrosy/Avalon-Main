// src/lib/cs/intake/__tests__/v-process-shopify-order.test.ts
//
// Unit tests for processIncomingShopifyOrder().
// Uses vi.fn() mocks for SupabaseClient — no real DB needed.
//
// Run: npx vitest run src/lib/cs/intake/__tests__/v-process-shopify-order.test.ts

import { describe, it, expect, vi } from "vitest";
import {
  processIncomingShopifyOrder,
  type ShopifyOrderPayload,
} from "../process-shopify-order";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WEB_ORDER: ShopifyOrderPayload = {
  id: 111222333,
  source_name: "web",
  app_id: 580111,
  total_price: "1500.00",
  payment_gateway: "gcash",
  created_at: "2026-05-01T00:00:00Z",
  note_attributes: [],
  customer: {
    id: 987654321,
    first_name: "Maria",
    last_name: "Santos",
    email: "maria@example.com",
    phone: "09171234567",
  },
};

const QUARANTINE_ORDER: ShopifyOrderPayload = {
  ...WEB_ORDER,
  id: 444555666,
  source_name: "unknown_app",
  app_id: null,
};

const AVALON_LINKED_ORDER: ShopifyOrderPayload = {
  ...WEB_ORDER,
  id: 777888999,
  note_attributes: [{ name: "avalon_order_number", value: "AV-0001" }],
};

// ─── Mock builder factory ─────────────────────────────────────────────────────
//
// The Supabase query builder is a fluent chain. The code calls patterns like:
//   .from(t).select(...).eq(...).maybeSingle()   → { data, error }
//   .from(t).select(...).eq(...).single()         → { data, error }
//   .from(t).insert(row).select(...).single()     → { data, error }
//   .from(t).insert(row)                          → { data, error }  (for side-effect only)
//   .from(t).delete({ count: 'exact' }).lt(...)   → { data, error, count }
//
// We build one terminal mock per (table, operation) pair. The builder methods
// (select, insert, eq, lt) all return `this` so the chain reaches the terminal.
// The terminal resolves to whatever `handler()` returns.

type MockHandler = () => Promise<{ data: unknown; error: unknown; count?: number | null }>;

function makeChainedMock(tableHandlers: Record<string, MockHandler>) {
  return {
    from: vi.fn((table: string) => {
      const handler = tableHandlers[table] ?? (async () => ({ data: null, error: null }));
      const builder: Record<string, unknown> = {};
      // Terminal methods — resolve the mock result
      builder.maybeSingle = vi.fn(handler);
      builder.single = vi.fn(handler);
      builder.lt = vi.fn(handler);
      // Chainable methods — return the builder
      builder.select = vi.fn(() => builder);
      builder.insert = vi.fn(() => builder);
      builder.delete = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      return builder;
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("processIncomingShopifyOrder", () => {
  // 1. Happy path: conversion lane (web checkout)
  it("inserts a conversion-lane order and returns { status: 'inserted' }", async () => {
    let ordersCallCount = 0;
    const supabase = makeChainedMock({
      // orders: first call = linkage SELECT (no existing row), second call = INSERT result
      orders: async () => {
        ordersCallCount++;
        if (ordersCallCount === 1) return { data: null, error: null }; // linkage: not found
        return { data: { id: 42, intake_lane: "conversion" }, error: null }; // INSERT result
      },
      // customers: first call = SELECT by shopify_id (not found), second = INSERT result
      customers: async () => {
        return { data: { id: "cust-uuid-123" }, error: null };
      },
    });

    // For the customers table we need two separate calls: SELECT maybeSingle → null, then INSERT → id
    // Override: first call returns null (no existing customer), second returns created row
    let customersCallCount = 0;
    supabase.from = vi.fn((table: string) => {
      if (table === "customers") {
        customersCallCount++;
        const builder: Record<string, unknown> = {};
        if (customersCallCount === 1) {
          // SELECT ... maybeSingle() — no existing customer
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          builder.single = vi.fn(async () => ({ data: { id: "cust-uuid-123" }, error: null }));
        } else {
          // INSERT ... single() — newly created customer
          builder.maybeSingle = vi.fn(async () => ({ data: { id: "cust-uuid-123" }, error: null }));
          builder.single = vi.fn(async () => ({ data: { id: "cust-uuid-123" }, error: null }));
        }
        builder.select = vi.fn(() => builder);
        builder.insert = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        return builder;
      }
      if (table === "orders") {
        ordersCallCount++;
        const result = ordersCallCount === 1
          ? { data: null, error: null }
          : { data: { id: 42, intake_lane: "conversion" }, error: null };
        const builder: Record<string, unknown> = {};
        builder.maybeSingle = vi.fn(async () => result);
        builder.single = vi.fn(async () => result);
        builder.select = vi.fn(() => builder);
        builder.insert = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        return builder;
      }
      // Default
      const builder: Record<string, unknown> = {};
      builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      builder.single = vi.fn(async () => ({ data: null, error: null }));
      builder.select = vi.fn(() => builder);
      builder.insert = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      return builder;
    });

    const result = await processIncomingShopifyOrder(
      supabase as never,
      WEB_ORDER,
      "webhook",
    );

    expect(result.status).toBe("inserted");
    expect(result.lane).toBe("conversion");
    expect(result.orderId).toBe(42);
  });

  // 2. Happy path: sales lane (Avalon-linked via note_attribute)
  it("inserts a sales-lane order when order has avalon_order_number note_attribute", async () => {
    let ordersCallCount = 0;
    let customersCallCount = 0;

    const supabase = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.insert = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);

        if (table === "customers") {
          customersCallCount++;
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          builder.single = vi.fn(async () =>
            customersCallCount <= 1
              ? { data: null, error: null }  // SELECT: no existing
              : { data: { id: "cust-uuid-2" }, error: null }, // INSERT
          );
          // On INSERT path: single resolves to created customer
          builder.single = vi.fn(async () => ({ data: { id: "cust-uuid-2" }, error: null }));
          return builder;
        }
        if (table === "orders") {
          ordersCallCount++;
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null })); // linkage: none
          builder.single = vi.fn(async () => ({ data: { id: 55, intake_lane: "sales" }, error: null }));
          return builder;
        }
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        builder.single = vi.fn(async () => ({ data: null, error: null }));
        return builder;
      }),
    };

    const result = await processIncomingShopifyOrder(
      supabase as never,
      AVALON_LINKED_ORDER,
      "webhook",
    );

    expect(result.status).toBe("inserted");
    expect(result.lane).toBe("sales");
    expect(result.orderId).toBe(55);
  });

  // 3. Idempotency: duplicate delivery returns { status: 'duplicate' }
  it("returns duplicate when shopify_order_id already exists and lane matches", async () => {
    // The winner row also has intake_lane='conversion' — same as what WEB_ORDER classifies to
    // So no disagreement should be logged
    const supabase = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.insert = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);

        if (table === "customers") {
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          builder.single = vi.fn(async () => ({ data: { id: "cust-uuid-3" }, error: null }));
          return builder;
        }
        if (table === "orders") {
          let callCount = 0;
          builder.maybeSingle = vi.fn(async () => {
            callCount++;
            if (callCount === 1) return { data: null, error: null }; // linkage check: no existing
            // Second maybeSingle call is the winner re-fetch after conflict
            return { data: { id: 77, intake_lane: "conversion" }, error: null };
          });
          // INSERT fails with unique constraint
          builder.single = vi.fn(async () => ({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          }));
          return builder;
        }
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        builder.single = vi.fn(async () => ({ data: null, error: null }));
        return builder;
      }),
    };

    const result = await processIncomingShopifyOrder(
      supabase as never,
      WEB_ORDER,
      "webhook",
    );

    expect(result.status).toBe("duplicate");
  });

  // 4. Quarantine lane triggers review insert
  it("inserts into cs_intake_quarantine_review when lane is quarantine", async () => {
    const quarantineInsertFn = vi.fn(async () => ({ data: null, error: null }));

    const supabase = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);

        if (table === "cs_intake_quarantine_review") {
          builder.insert = quarantineInsertFn;
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          builder.single = vi.fn(async () => ({ data: null, error: null }));
          return builder;
        }
        if (table === "customers") {
          builder.insert = vi.fn(() => builder);
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          builder.single = vi.fn(async () => ({ data: { id: "cust-uuid-q" }, error: null }));
          return builder;
        }
        if (table === "orders") {
          builder.insert = vi.fn(() => builder);
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null })); // linkage: none
          builder.single = vi.fn(async () => ({ data: { id: 99, intake_lane: "quarantine" }, error: null }));
          return builder;
        }
        builder.insert = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        builder.single = vi.fn(async () => ({ data: null, error: null }));
        return builder;
      }),
    };

    const result = await processIncomingShopifyOrder(
      supabase as never,
      QUARANTINE_ORDER,
      "webhook",
    );

    expect(result.status).toBe("inserted");
    expect(result.lane).toBe("quarantine");
    expect(quarantineInsertFn).toHaveBeenCalledOnce();
    const callArg = quarantineInsertFn.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg).toHaveProperty("order_id", 99);
    expect(callArg).toHaveProperty("shopify_payload_snapshot");
  });

  // 5. Classifier disagreement is logged when lanes differ on duplicate
  it("logs a disagreement when duplicate exists with a different intake_lane", async () => {
    const disagreementInsertFn = vi.fn(async () => ({ data: null, error: null }));

    // Counter is OUTSIDE the from() callback so it persists across multiple from("orders") calls
    let ordersMaybeSingleCallCount = 0;

    const supabase = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);

        if (table === "cs_intake_classifier_disagreements") {
          builder.insert = disagreementInsertFn;
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          builder.single = vi.fn(async () => ({ data: null, error: null }));
          return builder;
        }
        if (table === "customers") {
          builder.insert = vi.fn(() => builder);
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          builder.single = vi.fn(async () => ({ data: { id: "cust-uuid-d" }, error: null }));
          return builder;
        }
        if (table === "orders") {
          builder.insert = vi.fn(() => builder);
          builder.maybeSingle = vi.fn(async () => {
            ordersMaybeSingleCallCount++;
            if (ordersMaybeSingleCallCount === 1) return { data: null, error: null }; // linkage: none
            // Winner re-fetch: has 'sales' lane (different from 'conversion' WEB_ORDER would classify to)
            return { data: { id: 88, intake_lane: "sales" }, error: null };
          });
          builder.single = vi.fn(async () => ({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          }));
          return builder;
        }
        builder.insert = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        builder.single = vi.fn(async () => ({ data: null, error: null }));
        return builder;
      }),
    };

    // WEB_ORDER classifies as 'conversion', but winner has 'sales'
    const result = await processIncomingShopifyOrder(
      supabase as never,
      WEB_ORDER,
      "reconciler",
    );

    expect(result.status).toBe("disagreement");
    expect(disagreementInsertFn).toHaveBeenCalledOnce();
    const callArg = disagreementInsertFn.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.winner_lane).toBe("sales");
    expect(callArg.loser_lane).toBe("conversion");
    expect(callArg.source_loser).toBe("reconciler");
    expect(callArg.source_winner).toBe("webhook"); // DONE_WITH_CONCERNS hardcoded
  });

  // 6. Error path: guest checkout (no customer) returns { status: 'error' }
  it("returns error when shopifyOrder.customer is null (guest checkout)", async () => {
    const guestOrder: ShopifyOrderPayload = { ...WEB_ORDER, customer: null };

    const supabase = {
      from: vi.fn((_table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.insert = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        builder.single = vi.fn(async () => ({ data: null, error: null }));
        return builder;
      }),
    };

    const result = await processIncomingShopifyOrder(
      supabase as never,
      guestOrder,
      "webhook",
    );

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/guest checkout/i);
  });

  // 7. Unexpected DB error returns { status: 'error' }
  it("returns error when orders insert fails with an unexpected DB error", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.insert = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);

        if (table === "customers") {
          builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          builder.single = vi.fn(async () => ({ data: { id: "cust-uuid" }, error: null }));
          return builder;
        }
        // orders: linkage check → no existing; INSERT → unexpected error
        if (table === "orders") {
          let callCount = 0;
          builder.maybeSingle = vi.fn(async () => {
            callCount++;
            return { data: null, error: null }; // linkage: none found
          });
          builder.single = vi.fn(async () => ({
            data: null,
            error: { code: "99999", message: "database is on fire" },
          }));
          return builder;
        }
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        builder.single = vi.fn(async () => ({ data: null, error: null }));
        return builder;
      }),
    };

    const result = await processIncomingShopifyOrder(
      supabase as never,
      WEB_ORDER,
      "webhook",
    );

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/database is on fire/);
  });
});
