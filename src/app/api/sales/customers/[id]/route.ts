import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";
import { updateShopifyCustomer } from "@/lib/shopify/client";
import { resolveShopifyProvinceName } from "@/lib/sales/ph-province-resolver";

// ─── PATCH /api/sales/customers/[id] ────────────────────────────────────────
//
// Updates a single customer. Used by the Customer step of the Create Order
// drawer when the agent picks an existing customer and edits their fields
// (e.g. fixes a wrong address) before placing the order. Only the supplied
// fields are written; the rest stay untouched.
//
// Single-source-of-truth: when the row carries a shopify_customer_id, the
// edit is also pushed to Shopify so both systems stay in sync. A Shopify
// failure surfaces a 502 and the local update is rolled forward anyway —
// the local row is the picker's view of the world, and we don't want to
// silently revert its UI back to stale state if Shopify is briefly
// unavailable.

const patchSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address_line_1: z.string().nullable().optional(),
  address_line_2: z.string().nullable().optional(),
  city_text: z.string().nullable().optional(),
  region_text: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  full_address: z.string().nullable().optional(),
  region_code: z.string().nullable().optional(),
  city_code: z.string().nullable().optional(),
  barangay_code: z.string().nullable().optional(),
  shopify_region: z.string().nullable().optional(),
});

// ─── GET /api/sales/customers/[id] ──────────────────────────────────────────
//
// Customer detail used by the per-customer page. Returns the full
// customers row plus lifetime stats and a sample of recent orders so
// the page can render in one round-trip:
//
//   { customer, stats, recent_orders, top_items }
//
// stats: order_count, completed_count, total_gross, total_net,
//        avg_order_value, last_order_at, first_order_at
// top_items: most-bought product_names (up to 5) by total quantity

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (admin as any)
    .from("customers")
    .select(
      "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached, address_line_1, address_line_2, city_text, region_text, postal_code, region_code, city_code, barangay_code, shopify_region, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // All non-deleted orders for stats. Pull only the fields needed; the
  // recent-orders slice and top-items aggregate run client-side.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orderRows } = await (admin as any)
    .from("orders")
    .select(
      "id, avalon_order_number, shopify_order_name, shopify_order_number, status, sync_status, sync_error, completion_status, final_total_amount, net_value_amount, delivery_status, created_at, completed_at, items:order_items(product_name, variant_name, size, color, quantity, image_url)",
    )
    .eq("customer_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const orders = (orderRows ?? []) as Array<{
    id: string;
    avalon_order_number: string | null;
    shopify_order_name: string | null;
    shopify_order_number: number | null;
    status: string;
    sync_status: string;
    sync_error: string | null;
    completion_status: string;
    final_total_amount: number;
    net_value_amount: number | null;
    delivery_status: string | null;
    created_at: string;
    completed_at: string | null;
    items: Array<{
      product_name: string;
      variant_name: string | null;
      size: string | null;
      color: string | null;
      quantity: number;
      image_url: string | null;
    }>;
  }>;

  const completed = orders.filter(
    (o) => o.status === "completed" || o.status === "confirmed",
  );
  const totalGross = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + (o.final_total_amount ?? 0), 0);
  const totalNet = orders.reduce(
    (sum, o) => sum + (o.net_value_amount ?? 0),
    0,
  );
  const stats = {
    order_count: orders.length,
    completed_count: orders.filter((o) => o.status === "completed").length,
    confirmed_count: orders.filter((o) => o.status === "confirmed").length,
    cancelled_count: orders.filter((o) => o.status === "cancelled").length,
    draft_count: orders.filter((o) => o.status === "draft").length,
    total_gross: totalGross,
    total_net: totalNet,
    avg_order_value: completed.length > 0 ? totalGross / completed.length : 0,
    first_order_at:
      orders.length > 0 ? orders[orders.length - 1].created_at : null,
    last_order_at: orders.length > 0 ? orders[0].created_at : null,
  };

  // Top items: aggregate by product_name, sum quantities, take top 5.
  const itemMap = new Map<
    string,
    { product_name: string; quantity: number; image_url: string | null }
  >();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    for (const it of o.items ?? []) {
      const existing = itemMap.get(it.product_name);
      if (existing) {
        existing.quantity += it.quantity;
      } else {
        itemMap.set(it.product_name, {
          product_name: it.product_name,
          quantity: it.quantity,
          image_url: it.image_url ?? null,
        });
      }
    }
  }
  const top_items = Array.from(itemMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Recent orders: trim to a slim shape for the page, enriched with
  // lifecycle_stage + lifecycle_method from v_order_lifecycle.
  const recentSlice = orders.slice(0, 20);
  const recentIds = recentSlice.map((o) => o.id);
  const lifecycleMap = new Map<
    string,
    { lifecycle_stage: string; lifecycle_method: string | null }
  >();
  if (recentIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lifeRows } = await (admin as any)
      .from("v_order_lifecycle")
      .select("order_id, lifecycle_stage, lifecycle_method")
      .in("order_id", recentIds);
    for (const r of (lifeRows ?? []) as Array<{
      order_id: string;
      lifecycle_stage: string;
      lifecycle_method: string | null;
    }>) {
      lifecycleMap.set(r.order_id, {
        lifecycle_stage: r.lifecycle_stage,
        lifecycle_method: r.lifecycle_method,
      });
    }
  }
  const recent_orders = recentSlice.map((o) => ({
    id: o.id,
    avalon_order_number: o.avalon_order_number,
    shopify_order_name: o.shopify_order_name,
    shopify_order_number: o.shopify_order_number,
    status: o.status,
    sync_status: o.sync_status,
    sync_error: o.sync_error,
    lifecycle_stage: lifecycleMap.get(o.id)?.lifecycle_stage ?? "in_progress",
    lifecycle_method: lifecycleMap.get(o.id)?.lifecycle_method ?? null,
    completion_status: o.completion_status,
    final_total_amount: o.final_total_amount,
    net_value_amount: o.net_value_amount,
    delivery_status: o.delivery_status,
    created_at: o.created_at,
    completed_at: o.completed_at,
    item_count: (o.items ?? []).reduce((s, it) => s + it.quantity, 0),
  }));

  return NextResponse.json({ customer, stats, recent_orders, top_items });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(patchSchema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();

  // Build the update object excluding undefined keys so unchanged fields
  // don't get overwritten with null.
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) update[k] = v;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (admin as any)
    .from("customers")
    .update(update)
    .eq("id", id)
    .select(
      "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached, address_line_1, address_line_2, city_text, region_text, postal_code, region_code, city_code, barangay_code, shopify_region",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Push the same edit to Shopify when the customer is mirrored there.
  // Address fields go in addresses[] (Shopify keeps name/email/phone on
  // the customer object and the postal address as a sub-resource).
  if (row?.shopify_customer_id) {
    const addressTouched =
      "address_line_1" in update ||
      "address_line_2" in update ||
      "city_text" in update ||
      "region_text" in update ||
      "postal_code" in update;
    const profileTouched =
      "first_name" in update ||
      "last_name" in update ||
      "email" in update ||
      "phone" in update;
    if (addressTouched || profileTouched) {
      try {
        // Province goes out as whatever the agent typed in Shopify Region.
        // Fall back to the resolver for older customers that don't have
        // shopify_region set yet (legacy rows from before migration 00090).
        let barangayName: string | null = null;
        let provinceName: string | null = row.shopify_region ?? null;
        if (addressTouched) {
          const tasks: Array<Promise<unknown>> = [
            row.barangay_code
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (admin as any)
                  .from("ph_barangays")
                  .select("name")
                  .eq("code", row.barangay_code)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            provinceName
              ? Promise.resolve(null)
              : resolveShopifyProvinceName(admin, {
                  city_code: row.city_code,
                  region_code: row.region_code,
                }),
          ];
          const [bgy, prov] = await Promise.all(tasks);
          barangayName =
            ((bgy as { data?: { name?: string } | null })?.data?.name ??
              null) || null;
          if (!provinceName) {
            provinceName = (prov as string | null) ?? null;
          }
        }
        const composedAddress1 =
          row.address_line_1 && barangayName
            ? `${row.address_line_1.trim()} Barangay ${barangayName.trim()}`
            : row.address_line_1
              ? row.address_line_1
              : barangayName
                ? `Barangay ${barangayName}`
                : null;
        await updateShopifyCustomer(row.shopify_customer_id, {
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email ?? undefined,
          phone: row.phone ?? undefined,
          addresses: addressTouched
            ? [
                {
                  address1: composedAddress1,
                  address2: row.address_line_2 ?? null,
                  city: row.city_text ?? null,
                  province: provinceName,
                  zip: row.postal_code ?? null,
                  country: "Philippines",
                },
              ]
            : undefined,
        });
      } catch (err) {
        return NextResponse.json(
          {
            customer: row,
            shopify_sync: {
              ok: false,
              detail: err instanceof Error ? err.message : String(err),
            },
          },
          { status: 502 },
        );
      }
    }
  }

  return NextResponse.json({ customer: row });
}
