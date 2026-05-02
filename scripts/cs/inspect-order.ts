// scripts/cs/inspect-order.ts
//
// Quick CS state inspector for a single order. Tells you exactly why an order
// is or isn't appearing in the CS Inbox tab.
//
// Usage:
//   bun run scripts/cs/inspect-order.ts <uuid>
// or
//   tsx scripts/cs/inspect-order.ts <uuid>
//
// Reads from .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local not present — fall through to existing process.env
  }
}

async function main() {
  loadEnv();
  const id = process.argv[2];
  if (!id) {
    console.error("usage: inspect-order.ts <uuid>");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, avalon_order_number, shopify_order_name, status, completion_status, person_in_charge_label, person_in_charge_type, claimed_by_user_id, claimed_at, intake_lane, created_by_name, created_at, confirmed_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("DB error:", error);
    process.exit(1);
  }
  if (!data) {
    console.error("No order with id", id);
    process.exit(1);
  }

  console.log("\nOrder", id);
  console.log("─".repeat(60));
  for (const [k, v] of Object.entries(data)) {
    console.log(`  ${k.padEnd(28)} ${v ?? "null"}`);
  }
  console.log("─".repeat(60));

  // Inbox eligibility
  const inInbox = data.status === "confirmed" && data.person_in_charge_label === null;
  const inAll =
    data.status === "confirmed" || data.status === "completed" || data.status === "cancelled";

  console.log("\nVerdict (post-fix logic):");
  console.log(`  Inbox tab:       ${inInbox ? "YES" : "NO"}  (needs status='confirmed' AND person_in_charge_label IS NULL)`);
  console.log(`  All tab:         ${inAll ? "YES" : "NO"}    (status in confirmed/completed/cancelled)`);

  if (!inInbox) {
    console.log("\nWhy NOT in Inbox:");
    if (data.status !== "confirmed") {
      console.log(`  - status is '${data.status}', not 'confirmed'`);
    }
    if (data.person_in_charge_label !== null) {
      console.log(`  - person_in_charge_label is '${data.person_in_charge_label}' (someone routed it already)`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
