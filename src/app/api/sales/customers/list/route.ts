import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/customers/list ──────────────────────────────────────────
//
// Customer index for /sales-agent/customers. Returns paginated customers
// joined with per-customer order aggregates (count, gross, net, last/first
// order). PostgREST can't aggregate cleanly across embedded resources, so
// we fetch the customer slice and the matching orders in one batch and
// roll up server-side.
//
// Query params:
//   q     — search by full_name | phone | email (>=2 chars, ilike)
//   sort  — recent | spend | orders | name (default: recent)
//   limit — max 200 (default 50)
//   offset — pagination cursor

const SORT_OPTIONS = new Set(["recent", "spend", "orders", "name"]);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const sortRaw = params.get("sort") ?? "recent";
  const sort = SORT_OPTIONS.has(sortRaw) ? sortRaw : "recent";
  const limit = Math.min(
    parseInt(params.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);

  const admin = createAdminClient();

  // 1. Customers slice. The order-by here is a coarse first pass; final
  //    sorting happens after stats are merged in step 3 because spend /
  //    orders are derived columns the DB doesn't have on customers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (admin as any)
    .from("customers")
    .select(
      "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached, created_at, updated_at",
      { count: "exact" },
    )
    .order(
      sort === "name"
        ? "full_name"
        : sort === "recent"
          ? "updated_at"
          : "created_at",
      { ascending: sort === "name", nullsFirst: false },
    )
    .range(offset, offset + limit - 1);
  if (q.length >= 2) {
    const safe = q.replace(/,/g, " ");
    query = query.or(
      [
        `full_name.ilike.%${safe}%`,
        `phone.ilike.%${safe}%`,
        `email.ilike.%${safe}%`,
      ].join(","),
    );
  }
  const { data: customers, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = (customers ?? []) as Array<{
    id: string;
    shopify_customer_id: string | null;
    full_name: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    full_address: string | null;
    total_orders_cached: number | null;
    created_at: string;
    updated_at: string;
  }>;

  // 2. Per-customer order aggregates. One batched query covering only
  //    the customers we're returning. Cancelled orders excluded from
  //    spend totals; status='draft' included in counts but spend is 0
  //    until confirmed.
  const ids = list.map((c) => c.id);
  type OrderAgg = {
    customer_id: string;
    final_total_amount: number;
    net_value_amount: number | null;
    status: string;
    created_at: string;
  };
  let orderRows: OrderAgg[] = [];
  if (ids.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
      .from("orders")
      .select("customer_id, final_total_amount, net_value_amount, status, created_at")
      .in("customer_id", ids)
      .is("deleted_at", null);
    orderRows = (data ?? []) as OrderAgg[];
  }

  const aggMap = new Map<
    string,
    {
      order_count: number;
      completed_count: number;
      total_gross: number;
      total_net: number;
      last_order_at: string | null;
    }
  >();
  for (const id of ids) {
    aggMap.set(id, {
      order_count: 0,
      completed_count: 0,
      total_gross: 0,
      total_net: 0,
      last_order_at: null,
    });
  }
  for (const o of orderRows) {
    const agg = aggMap.get(o.customer_id);
    if (!agg) continue;
    agg.order_count += 1;
    if (o.status === "completed") agg.completed_count += 1;
    if (o.status !== "cancelled") {
      agg.total_gross += o.final_total_amount ?? 0;
    }
    agg.total_net += o.net_value_amount ?? 0;
    if (!agg.last_order_at || o.created_at > agg.last_order_at) {
      agg.last_order_at = o.created_at;
    }
  }

  // 3. Merge + final sort. recent sort uses last_order_at when present,
  //    else falls back to updated_at.
  const merged = list.map((c) => {
    const agg = aggMap.get(c.id);
    return {
      ...c,
      order_count: agg?.order_count ?? 0,
      completed_count: agg?.completed_count ?? 0,
      total_gross: agg?.total_gross ?? 0,
      total_net: agg?.total_net ?? 0,
      last_order_at: agg?.last_order_at ?? null,
    };
  });

  if (sort === "spend") {
    merged.sort((a, b) => b.total_gross - a.total_gross);
  } else if (sort === "orders") {
    merged.sort((a, b) => b.order_count - a.order_count);
  } else if (sort === "recent") {
    merged.sort((a, b) => {
      const aT = a.last_order_at ?? a.updated_at;
      const bT = b.last_order_at ?? b.updated_at;
      return aT < bT ? 1 : aT > bT ? -1 : 0;
    });
  }
  // name sort already applied at the SQL level.

  return NextResponse.json({
    customers: merged,
    total: count ?? merged.length,
    limit,
    offset,
  });
}
