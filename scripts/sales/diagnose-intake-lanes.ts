// scripts/sales/diagnose-intake-lanes.ts
//
// Diagnostic: fetch the last 60 days of orders and show the distribution
// across intake lanes. Run after migration 00101 is applied to verify the
// backfill and to get a baseline before enabling the live classifier.
//
// Run: bun run scripts/sales/diagnose-intake-lanes.ts
//   OR: tsx scripts/sales/diagnose-intake-lanes.ts
//
// Exits 0 if quarantine % <= 10%.
// Exits 1 if quarantine % > 10% (investigate before going live).
//
// NOTE: This script reads data only — it does NOT modify any rows.

import { createClient } from "@supabase/supabase-js";
import { classifyIntakeLane } from "../../src/lib/sales/intake-lane";
import type {
  ShopifyOrderForClassification,
  AvalonLinkage,
  IntakeLane,
} from "../../src/lib/sales/intake-lane";

// ─── Env loading (mirrors diagnose-psgc-orphans.ts convention) ───────────────
try {
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* ignore — env may come from shell */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  shopify_order_id: string | null;
  created_by_user_id: string | null;
  shopify_source_name: string | null;
  // Raw Shopify payload columns if present (added in 00101).
  // The spike uses them to run the classifier with full fidelity.
  intake_lane: string | null;
  // Snapshot columns for quarantine reporting.
  created_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build an AvalonLinkage from a DB row. */
function buildLinkage(row: OrderRow): AvalonLinkage {
  return {
    // If the row has created_by_user_id it was created by a sales rep via Avalon.
    hasAvalonOrderRecord: row.created_by_user_id !== null,
    // Note attribute linkage would require fetching note_attributes from the
    // Shopify payload. For this spike we conservatively set it to false.
    hasAvalonNoteAttribute: false,
  };
}

/** Build a ShopifyOrderForClassification from a DB row. */
function buildShopifyOrder(row: OrderRow): ShopifyOrderForClassification {
  return {
    source_name: row.shopify_source_name ?? null,
    app_id: null, // app_id not yet stored in DB — populated by webhook handler in Lane 2.
    note_attributes: null,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const sinceIso = since.toISOString();

  console.log(`\nFetching orders created since ${sinceIso} ...`);

  // Paginate — PostgREST caps at 1000 rows by default.
  const PAGE = 1000;
  const rows: OrderRow[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("orders")
      .select(
        "id, shopify_order_id, created_by_user_id, shopify_source_name, intake_lane, created_at",
      )
      .gte("created_at", sinceIso)
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("Supabase error:", error.message, { code: error.code, hint: error.hint, details: error.details });
      process.exit(1);
    }

    const page = (data ?? []) as OrderRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  console.log(`Total orders in window: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log("No orders found — nothing to classify.");
    process.exit(0);
  }

  // ─── Classify ──────────────────────────────────────────────────────────────

  const counts: Record<IntakeLane, number> = {
    sales: 0,
    shopify_admin: 0,
    conversion: 0,
    quarantine: 0,
  };

  const quarantineRows: Array<{ row: OrderRow; classified_lane: IntakeLane }> =
    [];

  for (const row of rows) {
    const linkage = buildLinkage(row);
    const shopifyOrder = buildShopifyOrder(row);
    const lane = classifyIntakeLane(shopifyOrder, linkage);
    counts[lane]++;

    if (lane === "quarantine") {
      quarantineRows.push({ row, classified_lane: lane });
    }
  }

  // ─── Summary table ─────────────────────────────────────────────────────────

  const total = rows.length;
  const lanes: IntakeLane[] = [
    "sales",
    "shopify_admin",
    "conversion",
    "quarantine",
  ];

  console.log("Lane distribution (last 60 days):");
  console.log("─".repeat(48));
  console.log(
    `${"lane".padEnd(20)} ${"count".padStart(8)} ${"percent".padStart(10)}`,
  );
  console.log("─".repeat(48));

  for (const lane of lanes) {
    const count = counts[lane];
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`${lane.padEnd(20)} ${String(count).padStart(8)} ${(pct + "%").padStart(10)}`);
  }

  console.log("─".repeat(48));
  console.log(`${"TOTAL".padEnd(20)} ${String(total).padStart(8)}`);

  // ─── Quarantine sample ─────────────────────────────────────────────────────

  const quarantinePct = (counts.quarantine / total) * 100;

  if (quarantineRows.length > 0) {
    console.log(
      `\nQuarantine sample (up to 5 of ${quarantineRows.length} rows):`,
    );
    console.log("─".repeat(72));

    const sample = quarantineRows.slice(0, 5);
    for (const { row } of sample) {
      // Print the full snapshot of what we have in the DB row.
      console.log(
        JSON.stringify(
          {
            id: row.id,
            shopify_order_id: row.shopify_order_id,
            created_by_user_id: row.created_by_user_id,
            shopify_source_name: row.shopify_source_name,
            existing_intake_lane: row.intake_lane,
            created_at: row.created_at,
          },
          null,
          2,
        ),
      );
      console.log("─".repeat(72));
    }
  }

  // ─── Gate ─────────────────────────────────────────────────────────────────

  if (quarantinePct > 10) {
    console.error(
      `\nBLOCKED: Quarantine rate is ${quarantinePct.toFixed(1)}% > 10% threshold.`,
    );
    console.error(
      "Investigate quarantined rows before enabling the live classifier.",
    );
    process.exit(1);
  }

  console.log(
    `\nOK: Quarantine rate is ${quarantinePct.toFixed(1)}% (<= 10%). Safe to proceed.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("\ndiagnose-intake-lanes failed:", err);
  process.exit(1);
});
