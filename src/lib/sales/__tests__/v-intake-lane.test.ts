// src/lib/sales/__tests__/v-intake-lane.test.ts
//
// Unit tests for classifyIntakeLane(). These are pure-function tests —
// no DB, no env vars, no beforeAll/afterAll needed.
//
// Run: npx vitest run src/lib/sales/__tests__/v-intake-lane.test.ts
// (vitest is not a project devDependency — npx auto-installs it)

import { describe, it, expect } from "vitest";
import {
  classifyIntakeLane,
  type ShopifyOrderForClassification,
  type AvalonLinkage,
} from "../intake-lane";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NO_LINKAGE: AvalonLinkage = {
  hasAvalonOrderRecord: false,
  hasAvalonNoteAttribute: false,
};

const WITH_ORDER_RECORD: AvalonLinkage = {
  hasAvalonOrderRecord: true,
  hasAvalonNoteAttribute: false,
};

const WITH_NOTE_ATTRIBUTE: AvalonLinkage = {
  hasAvalonOrderRecord: false,
  hasAvalonNoteAttribute: true,
};

const WITH_BOTH_LINKAGE: AvalonLinkage = {
  hasAvalonOrderRecord: true,
  hasAvalonNoteAttribute: true,
};

/** Full-shaped fixture — realistic Shopify web checkout order */
function makeOrder(
  patch: Partial<ShopifyOrderForClassification> = {},
): ShopifyOrderForClassification {
  return {
    source_name: "web",
    app_id: 580111, // Shopify web checkout app id
    note_attributes: [],
    ...patch,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("classifyIntakeLane", () => {
  // 1. Avalon-linked via hasAvalonOrderRecord — conflicting POS payload to prove linkage wins
  it("hasAvalonOrderRecord → 'sales' (even with conflicting source_name='pos')", () => {
    const order = makeOrder({ source_name: "pos", app_id: 12345 });
    expect(classifyIntakeLane(order, WITH_ORDER_RECORD)).toBe("sales");
  });

  // 2. Avalon-linked via hasAvalonNoteAttribute — conflicting POS payload to prove linkage wins
  it("hasAvalonNoteAttribute → 'sales' (even with conflicting source_name='pos')", () => {
    const order = makeOrder({ source_name: "pos", app_id: 12345 });
    expect(classifyIntakeLane(order, WITH_NOTE_ATTRIBUTE)).toBe("sales");
  });

  // 3. Both linkage flags — Avalon precedence wins
  it("both linkage flags → 'sales' (Avalon precedence wins)", () => {
    const order = makeOrder({ source_name: "pos", app_id: null });
    expect(classifyIntakeLane(order, WITH_BOTH_LINKAGE)).toBe("sales");
  });

  // 4. POS order, no linkage → shopify_admin
  it("source_name='pos', no linkage → 'shopify_admin'", () => {
    const order = makeOrder({ source_name: "pos", app_id: null });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("shopify_admin");
  });

  // 5. Draft order, no linkage → shopify_admin
  it("source_name='shopify_draft_order', no linkage → 'shopify_admin'", () => {
    const order = makeOrder({
      source_name: "shopify_draft_order",
      app_id: null,
    });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("shopify_admin");
  });

  // 6. Non-web app_id (admin app), no linkage → shopify_admin
  it("app_id=12345 (non-web admin app), no linkage → 'shopify_admin'", () => {
    const order = makeOrder({ source_name: null, app_id: 12345 });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("shopify_admin");
  });

  // 7. Web checkout, no linkage, no admin metadata → conversion
  it("source_name='web', no linkage, app_id=580111 → 'conversion'", () => {
    const order = makeOrder({ source_name: "web", app_id: 580111 });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("conversion");
  });

  // 8. null source_name AND null app_id, no linkage → conversion (web fallback)
  it("source_name=null, app_id=null, no linkage → 'conversion'", () => {
    const order = makeOrder({ source_name: null, app_id: null });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("conversion");
  });

  // 9. Unrecognised source_name, no linkage → quarantine
  it("source_name='unknown_lane_xyz', no linkage → 'quarantine'", () => {
    const order = makeOrder({
      source_name: "unknown_lane_xyz",
      app_id: 580111,
    });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("quarantine");
  });

  // 10. Entirely null/garbage payload, no linkage → conversion
  //     (rule 3: null source_name + null app_id = web checkout fallback)
  it("all-null payload, no linkage → 'conversion' (null source + null app = web fallback)", () => {
    const order: ShopifyOrderForClassification = {
      source_name: null,
      app_id: null,
      note_attributes: null,
    };
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("conversion");
  });

  // 11. CRITICAL EDGE: source_name='web' BUT non-web app_id — rule 2 fires before rule 3
  it("source_name='web' + app_id=12345 (non-web app), no linkage → 'shopify_admin' (rule 2 beats rule 3)", () => {
    const order = makeOrder({ source_name: "web", app_id: 12345 });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("shopify_admin");
  });

  // 12. app_id as string "580111" (GraphQL / some webhooks) — must coerce to number before compare
  //     Without Number() coercion, "580111" !== 580111 → isAdminApp=true → wrong lane.
  it("app_id='580111' (string form) + source_name='web', no linkage → 'conversion'", () => {
    const order = makeOrder({ source_name: "web", app_id: "580111" });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("conversion");
  });

  // 13. app_id as string "12345" (non-web, string form) + no linkage → shopify_admin
  it("app_id='12345' (string, non-web), no linkage → 'shopify_admin'", () => {
    const order = makeOrder({ source_name: null, app_id: "12345" });
    expect(classifyIntakeLane(order, NO_LINKAGE)).toBe("shopify_admin");
  });
});
