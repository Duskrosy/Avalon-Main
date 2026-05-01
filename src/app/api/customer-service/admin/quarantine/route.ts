// src/app/api/customer-service/admin/quarantine/route.ts
//
// GET /api/customer-service/admin/quarantine
//   ?tab=quarantine|disputes  (default: quarantine)
//   ?status=pending|resolved  (quarantine tab only, default: pending)
//
// Admin-gated: roles.tier <= 2 (manager, ops_admin, super_admin).
// Uses the admin client so RLS is bypassed at the app layer — the
// admin role check is performed in-route before any data is returned.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

const QUARANTINE_SELECT = [
  "id,",
  "order_id,",
  "classified_at,",
  "resolved_at,",
  "resolved_lane,",
  "resolved_by,",
  "order:orders!cs_intake_quarantine_review_order_id_fkey(",
  "  id, shopify_order_id, shopify_order_name, final_total_amount, created_at, intake_lane",
  ")",
].join(" ");

const DISPUTES_SELECT = [
  "id,",
  "order_id,",
  "winner_lane,",
  "loser_lane,",
  "source_winner,",
  "source_loser,",
  "recorded_at,",
  "order:orders!cs_intake_classifier_disagreements_order_id_fkey(",
  "  id, shopify_order_id, shopify_order_name, final_total_amount, created_at",
  ")",
].join(" ");

export async function GET(req: NextRequest) {
  // Auth
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tab = req.nextUrl.searchParams.get("tab") ?? "quarantine";
  const status = req.nextUrl.searchParams.get("status") ?? "pending";

  const admin = createAdminClient();

  if (tab === "disputes") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, count } = await (admin as any)
      .from("cs_intake_classifier_disagreements")
      .select(DISPUTES_SELECT, { count: "exact" })
      .order("recorded_at", { ascending: false })
      .limit(200);  // hard cap; revisit if disputes log grows past this

    if (error) {
      console.error("[admin/quarantine] disputes fetch failed", { code: error.code, message: error.message, hint: error.hint, details: error.details });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    return NextResponse.json({ rows: data ?? [], count: count ?? 0 });
  }

  // Default: quarantine tab
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from("cs_intake_quarantine_review")
    .select(QUARANTINE_SELECT, { count: "exact" });

  if (status === "resolved") {
    query = query.not("resolved_at", "is", null);
  } else {
    // "pending" is the default
    query = query.is("resolved_at", null);
  }

  query = query.order("classified_at", { ascending: false }).limit(200);  // hard cap

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/quarantine] quarantine fetch failed", { code: error.code, message: error.message, hint: error.hint, details: error.details });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], count: count ?? 0 });
}
