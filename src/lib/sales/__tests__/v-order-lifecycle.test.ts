// @ts-nocheck — vitest is not yet installed in this project.
//
// Run: TEST_CUSTOMER_ID=<uuid> TEST_USER_ID=<uuid> \
//      npx vitest run src/lib/sales/__tests__/v-order-lifecycle.test.ts
//
// Requires:
//   - Supabase migrations 00096 and 00097 applied locally (creates
//     v_order_lifecycle and wires ops_orders.sales_order_id).
//   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env.
//   - A real customers row identified by TEST_CUSTOMER_ID and a real
//     profiles/users row identified by TEST_USER_ID — the test inserts
//     orders that FK to these.
//
// vitest is not yet a project devDependency — `npx vitest` auto-installs.
// Setup parallels src/app/api/sales/orders/__tests__/round-trip.test.ts.

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

const admin = createAdminClient();

const TEST_CUSTOMER_ID = process.env.TEST_CUSTOMER_ID;
const TEST_USER_ID = process.env.TEST_USER_ID;

const createdOrderIds: string[] = [];
const createdOpsOrderIds: string[] = [];

async function makeOrder(patch: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from("orders")
    .insert({
      customer_id: TEST_CUSTOMER_ID,
      created_by_user_id: TEST_USER_ID,
      created_by_name: "Test",
      status: "confirmed",
      sync_status: "synced",
      completion_status: "incomplete",
      ...patch,
    })
    .select("id")
    .single();
  if (error) throw error;
  createdOrderIds.push(data.id);
  return data.id;
}

async function fetchStage(
  id: string,
): Promise<{ stage: string; method: string | null }> {
  const { data, error } = await admin
    .from("v_order_lifecycle")
    .select("lifecycle_stage, lifecycle_method")
    .eq("order_id", id)
    .maybeSingle();
  if (error) throw error;
  return { stage: data!.lifecycle_stage, method: data!.lifecycle_method };
}

async function makeOpsBridgeWithEvent(
  salesOrderId: string,
  orderNumber: string,
  eventType:
    | "picked_up"
    | "delivered"
    | "rts_received"
    | "in_transit"
    | "failed_attempt"
    | "returned_to_sender",
): Promise<void> {
  const { data: ops, error: opsErr } = await admin
    .from("ops_orders")
    .insert({
      sales_order_id: salesOrderId,
      order_number: orderNumber,
      financial_status: "pending",
      fulfillment_status: "unfulfilled",
      total_price: 0,
    })
    .select("id")
    .single();
  if (opsErr) throw opsErr;
  createdOpsOrderIds.push(ops.id);

  const { data: dq, error: dqErr } = await admin
    .from("dispatch_queue")
    .insert({
      order_id: ops.id,
      status: "pending",
    })
    .select("id")
    .single();
  if (dqErr) throw dqErr;

  const { error: ceErr } = await admin.from("courier_events").insert({
    dispatch_id: dq.id,
    event_type: eventType,
    event_time: new Date().toISOString(),
  });
  if (ceErr) throw ceErr;
}

describe("v_order_lifecycle", () => {
  beforeAll(() => {
    if (!TEST_CUSTOMER_ID || !TEST_USER_ID) {
      throw new Error(
        "Set TEST_CUSTOMER_ID + TEST_USER_ID env vars for integration tests",
      );
    }
  });

  afterAll(async () => {
    if (createdOpsOrderIds.length) {
      // ON DELETE CASCADE on dispatch_queue + courier_events handles their cleanup.
      await admin.from("ops_orders").delete().in("id", createdOpsOrderIds);
    }
    if (createdOrderIds.length) {
      await admin.from("orders").delete().in("id", createdOrderIds);
    }
  });

  it("draft → 'draft'", async () => {
    const id = await makeOrder({ status: "draft" });
    expect((await fetchStage(id)).stage).toBe("draft");
  });

  it("incomplete confirmed → 'incomplete'", async () => {
    const id = await makeOrder({ completion_status: "incomplete" });
    expect((await fetchStage(id)).stage).toBe("incomplete");
  });

  it("complete + no PIC → 'cs_inbox'", async () => {
    const id = await makeOrder({ completion_status: "complete" });
    expect((await fetchStage(id)).stage).toBe("cs_inbox");
  });

  it("complete + PIC=Inventory + no shipment → 'inventory'", async () => {
    const id = await makeOrder({
      completion_status: "complete",
      person_in_charge_label: "Inventory",
      person_in_charge_type: "custom",
    });
    expect((await fetchStage(id)).stage).toBe("inventory");
  });

  it("complete + PIC=Fulfillment + no shipment → 'fulfillment'", async () => {
    const id = await makeOrder({
      completion_status: "complete",
      person_in_charge_label: "Fulfillment",
      person_in_charge_type: "custom",
    });
    expect((await fetchStage(id)).stage).toBe("fulfillment");
  });

  it("delivery_method=tnvs → method 'tnvs'", async () => {
    const id = await makeOrder({
      completion_status: "complete",
      delivery_method: "tnvs",
    });
    expect((await fetchStage(id)).method).toBe("tnvs");
  });

  it("cancelled overrides everything → 'cancelled'", async () => {
    const id = await makeOrder({
      status: "cancelled",
      completion_status: "complete",
      person_in_charge_label: "Inventory",
    });
    expect((await fetchStage(id)).stage).toBe("cancelled");
  });

  it("courier event 'picked_up' → 'picked_up' stage", async () => {
    const orderNumber = `TEST-PICKED-${Date.now()}`;
    const id = await makeOrder({
      completion_status: "complete",
      avalon_order_number: orderNumber,
      delivery_method: "tnvs",
    });
    await makeOpsBridgeWithEvent(id, orderNumber, "picked_up");
    const stage = await fetchStage(id);
    expect(stage.stage).toBe("picked_up");
    expect(stage.method).toBe("tnvs");
  });

  it("courier event 'delivered' → 'delivered' stage", async () => {
    const orderNumber = `TEST-DEL-${Date.now()}`;
    const id = await makeOrder({
      completion_status: "complete",
      avalon_order_number: orderNumber,
      delivery_method: "lwe",
    });
    await makeOpsBridgeWithEvent(id, orderNumber, "delivered");
    const stage = await fetchStage(id);
    expect(stage.stage).toBe("delivered");
    expect(stage.method).toBe("lwe");
  });

  it("courier event 'rts_received' → 'rts' stage", async () => {
    const orderNumber = `TEST-RTS-${Date.now()}`;
    const id = await makeOrder({
      completion_status: "complete",
      avalon_order_number: orderNumber,
      delivery_method: "tnvs",
    });
    await makeOpsBridgeWithEvent(id, orderNumber, "rts_received");
    const stage = await fetchStage(id);
    expect(stage.stage).toBe("rts");
  });
});
