import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/reports ─────────────────────────────────────────────────
//
// Aggregated sales metrics for the Reports page.
//
// Query params:
//   range — today | yesterday | 7d | 14d | 30d | mtd | custom (default: 7d)
//   custom_from / custom_to — ISO timestamps when range=custom
//   scope — mine | all (managers can choose all; agents always mine)
//
// Returns:
//   {
//     range:   { from, to },
//     totals:  { orders, confirmed, completed, abandoned, gross, net,
//                avg_order_value, conversion_rate, abandon_rate },
//     by_day:  [{ day, orders, gross, net }],
//     by_agent: [{ user_id, name, orders, completed, gross, net }] (managers only),
//     by_campaign: [{ name, orders, gross, net }],
//   }

const RANGE_OPTIONS = new Set([
  "today",
  "yesterday",
  "7d",
  "14d",
  "30d",
  "mtd",
  "custom",
]);

function rangeBounds(
  range: string,
  customFrom: string | null,
  customTo: string | null,
): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  switch (range) {
    case "today":
      return { from: today, to: tomorrow };
    case "yesterday": {
      const y = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { from: y, to: today };
    }
    case "7d":
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: tomorrow,
      };
    case "14d":
      return {
        from: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
        to: tomorrow,
      };
    case "30d":
      return {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        to: tomorrow,
      };
    case "mtd":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: tomorrow,
      };
    case "custom": {
      const from = customFrom ? new Date(customFrom) : today;
      const to = customTo ? new Date(customTo) : tomorrow;
      return { from, to };
    }
    default:
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: tomorrow,
      };
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const rangeRaw = params.get("range") ?? "7d";
  const range = RANGE_OPTIONS.has(rangeRaw) ? rangeRaw : "7d";
  const scopeRaw = params.get("scope") ?? "mine";
  const customFrom = params.get("custom_from");
  const customTo = params.get("custom_to");

  const isManager = isManagerOrAbove(currentUser);
  const scope = scopeRaw === "all" && isManager ? "all" : "mine";

  const { from, to } = rangeBounds(range, customFrom, customTo);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (admin as any)
    .from("orders")
    .select(
      "id, status, sync_status, created_by_user_id, created_by_name, " +
        "final_total_amount, net_value_amount, is_abandoned_cart, " +
        "ad_campaign_source, delivery_status, created_at, completed_at",
    )
    .is("deleted_at", null)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .limit(5000);
  if (scope === "mine") {
    query = query.eq("created_by_user_id", currentUser.id);
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []) as Array<{
    id: string;
    status: string;
    sync_status: string;
    created_by_user_id: string | null;
    created_by_name: string | null;
    final_total_amount: number;
    net_value_amount: number | null;
    is_abandoned_cart: boolean | null;
    ad_campaign_source: string | null;
    delivery_status: string | null;
    created_at: string;
  }>;

  // Totals
  const nonCancelled = orders.filter((o) => o.status !== "cancelled");
  const confirmed = orders.filter(
    (o) =>
      o.status === "confirmed" ||
      o.status === "completed" ||
      o.status === "cancelled",
  );
  const completed = orders.filter((o) => o.status === "completed");
  const abandoned = orders.filter((o) => o.is_abandoned_cart === true);
  const gross = nonCancelled.reduce(
    (s, o) => s + (o.final_total_amount ?? 0),
    0,
  );
  const net = orders.reduce((s, o) => s + (o.net_value_amount ?? 0), 0);
  const aov = completed.length > 0 ? gross / completed.length : 0;
  const conversion =
    confirmed.length > 0 ? completed.length / confirmed.length : 0;
  const abandonRate =
    completed.length + abandoned.length > 0
      ? abandoned.length / (completed.length + abandoned.length)
      : 0;

  // By day (created_at, YYYY-MM-DD bucket)
  const dayMap = new Map<
    string,
    { day: string; orders: number; gross: number; net: number }
  >();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const day = o.created_at.slice(0, 10);
    const row = dayMap.get(day) ?? { day, orders: 0, gross: 0, net: 0 };
    row.orders += 1;
    row.gross += o.final_total_amount ?? 0;
    row.net += o.net_value_amount ?? 0;
    dayMap.set(day, row);
  }
  const by_day = [...dayMap.values()].sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
  );

  // By agent (manager view only)
  let by_agent:
    | Array<{
        user_id: string;
        name: string;
        orders: number;
        completed: number;
        gross: number;
        net: number;
      }>
    | undefined = undefined;
  if (scope === "all") {
    const agentMap = new Map<
      string,
      {
        user_id: string;
        name: string;
        orders: number;
        completed: number;
        gross: number;
        net: number;
      }
    >();
    for (const o of orders) {
      const id = o.created_by_user_id ?? "unknown";
      const row = agentMap.get(id) ?? {
        user_id: id,
        name: o.created_by_name ?? "(unknown)",
        orders: 0,
        completed: 0,
        gross: 0,
        net: 0,
      };
      if (o.status !== "cancelled") row.orders += 1;
      if (o.status === "completed") row.completed += 1;
      if (o.status !== "cancelled") row.gross += o.final_total_amount ?? 0;
      row.net += o.net_value_amount ?? 0;
      agentMap.set(id, row);
    }
    by_agent = [...agentMap.values()].sort((a, b) => b.gross - a.gross);
  }

  // By campaign — only counts orders with a non-null source.
  const campaignMap = new Map<
    string,
    { name: string; orders: number; gross: number; net: number }
  >();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    if (!o.ad_campaign_source) continue;
    const row = campaignMap.get(o.ad_campaign_source) ?? {
      name: o.ad_campaign_source,
      orders: 0,
      gross: 0,
      net: 0,
    };
    row.orders += 1;
    row.gross += o.final_total_amount ?? 0;
    row.net += o.net_value_amount ?? 0;
    campaignMap.set(o.ad_campaign_source, row);
  }
  const by_campaign = [...campaignMap.values()].sort(
    (a, b) => b.gross - a.gross,
  );

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    scope,
    totals: {
      orders: nonCancelled.length,
      confirmed: confirmed.length,
      completed: completed.length,
      abandoned: abandoned.length,
      cancelled: orders.length - nonCancelled.length,
      gross,
      net,
      avg_order_value: aov,
      conversion_rate: conversion,
      abandon_rate: abandonRate,
    },
    by_day,
    by_agent,
    by_campaign,
  });
}
