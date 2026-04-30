import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { listShopifyVouchers } from "@/lib/shopify/client";

// ─── GET /api/sales/vouchers?force=1 ────────────────────────────────────────
//
// Live Shopify discount code list for the Payment step of the Create Order
// drawer. 60s in-memory cache lives inside the client lib (per-process).
// Pass ?force=1 to bypass cache for testing.
//
// Errors from the Shopify client are surfaced as { vouchers: [], error: msg }
// instead of a 500 — the dropdown still renders, but the UI can show why the
// list is empty (auth/scope issues, network) rather than silently failing.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const codes = await listShopifyVouchers({ force });
    return NextResponse.json({
      vouchers: codes.map((c) => ({
        id: c.id,
        code: c.code,
        price_rule_id: c.price_rule_id,
      })),
      error: null,
    });
  } catch (err) {
    return NextResponse.json({
      vouchers: [],
      error: err instanceof Error ? err.message : "Couldn't reach Shopify discounts",
    });
  }
}
