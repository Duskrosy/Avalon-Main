import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/sales/confirmed-sales?month=YYYY-MM&agent_id=...
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const agentId = searchParams.get("agent_id");

  let query = supabase
    .from("sales_confirmed_sales")
    .select("*")
    .order("confirmed_date", { ascending: false });

  if (month) {
    query = query.gte("confirmed_date", `${month}-01`).lte("confirmed_date", `${month}-31`);
  }
  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// sales_confirmed_sales is now a read-only archive (migration 00093 renamed
// the table to sales_confirmed_sales_legacy and exposed it as a view at the
// old name). Writes go through /api/sales/orders. The handlers below return
// 410 Gone so any stragglers fail loudly instead of silently no-op'ing.

const GONE_BODY = {
  error: "sales_confirmed_sales is archived. Use /api/sales/orders instead.",
  archived_in_migration: "00093_sales_confirmed_sales_legacy",
} as const;

export function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export function PATCH() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export function DELETE() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}
