import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";
import {
  createShopifyCustomer,
  searchShopifyCustomers,
} from "@/lib/shopify/client";

// ─── GET /api/sales/customers?search=... ─────────────────────────────────────
//
// Typeahead search for the Customer step of the Create Order drawer.
//
// Strategy: query the local mirror (matching name OR phone OR email), then
// chain Shopify customer search to surface customers that exist on Shopify
// but haven't been synced into the local mirror yet. Local rows are returned
// as-is; Shopify-only matches come back with `id: null` and a `_source:
// "shopify"` flag so the UI knows to claim them via POST on selection.
// Results dedup by shopify_customer_id (local wins).

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const search = (req.nextUrl.searchParams.get("search") ?? "").trim();
  if (search.length < 2) {
    return NextResponse.json({ customers: [] });
  }

  const admin = createAdminClient();
  // Local match: name OR phone OR email (case-insensitive). The .or() string
  // uses PostgREST syntax — commas in `search` would break it, so we strip
  // them defensively before interpolation.
  const safe = search.replace(/,/g, " ");
  const orClause = [
    `full_name.ilike.%${safe}%`,
    `phone.ilike.%${safe}%`,
    `email.ilike.%${safe}%`,
  ].join(",");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: localRows } = await (admin as any)
    .from("customers")
    .select(
      "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached",
    )
    .or(orClause)
    .limit(10);

  const local = (localRows ?? []) as Array<{
    id: string;
    shopify_customer_id: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    full_address: string | null;
    total_orders_cached: number | null;
  }>;

  // Shopify pull. Shopify's /customers/search.json honors a Lucene-style
  // query — passing the raw search term searches name, email, and phone.
  // Wrapped in a try/catch (already in the helper) so a Shopify outage
  // doesn't blank the typeahead.
  const shopifyMatches = await searchShopifyCustomers(search);

  // Merge: dedup by shopify_customer_id. Local rows win.
  const localShopifyIds = new Set(
    local.map((r) => r.shopify_customer_id).filter(Boolean) as string[],
  );
  const shopifyOnly = shopifyMatches
    .filter((c) => !localShopifyIds.has(String(c.id)))
    .slice(0, 10)
    .map((c) => ({
      id: null as string | null,
      shopify_customer_id: String(c.id),
      first_name: c.first_name ?? null,
      last_name: c.last_name ?? null,
      full_name:
        [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
        c.email ||
        c.phone ||
        "(unnamed)",
      email: c.email ?? null,
      phone: c.phone ?? null,
      full_address: (() => {
        const addr = c.addresses?.[0];
        if (!addr) return null;
        return (
          [addr.address1, addr.city, addr.province, addr.zip]
            .filter(Boolean)
            .join(", ") || null
        );
      })(),
      total_orders_cached: null,
      _source: "shopify" as const,
    }));

  return NextResponse.json({
    customers: [...local, ...shopifyOnly].slice(0, 15),
  });
}

// ─── POST /api/sales/customers ───────────────────────────────────────────────
//
// Create a customer locally. Shopify customer creation is deferred to confirm
// time (when shopify_customer_id is null on the order's customer at confirm,
// the confirm flow runs an email-pre-search → create-or-link before posting
// the order).

const postSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address_line_1: z.string().optional().nullable(),
  address_line_2: z.string().optional().nullable(),
  city_text: z.string().optional().nullable(),
  region_text: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  full_address: z.string().optional().nullable(),
  // PSGC structured codes (Phase 1.5+). Optional so legacy clients still work.
  region_code: z.string().optional().nullable(),
  city_code: z.string().optional().nullable(),
  barangay_code: z.string().optional().nullable(),
  /**
   * Pre-existing Shopify customer id, when claiming a Shopify-only result
   * from the typeahead. The caller has already verified this customer
   * exists on Shopify (the typeahead returned it), so we mirror locally
   * without going back to Shopify.
   */
  shopify_customer_id: z.string().optional().nullable(),
  /**
   * If true, also create the customer in Shopify immediately. Default false
   * (defer to order-confirm time). Ignored when shopify_customer_id is
   * already supplied.
   */
  create_in_shopify: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(postSchema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();

  // Importing an existing Shopify customer? If so, the typeahead has already
  // verified this Shopify id exists, and the user is explicitly claiming
  // them — short-circuit dedup-by-phone (the duplicate match would just be
  // a previously-imported mirror, which we want to reuse, not 409 on).
  if (body.shopify_customer_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (admin as any)
      .from("customers")
      .select(
        "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached",
      )
      .eq("shopify_customer_id", body.shopify_customer_id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ customer: existing }, { status: 200 });
    }
  } else {
    // Dedup check using public.canonicalize_phone via an OR query.
    // The unique partial index on canonical_phone protects against concurrent
    // duplicate inserts; the explicit query gives a friendly 409 with the
    // matching row instead of a constraint-violation error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matches } = await (admin as any).rpc("canonicalize_phone", {
      raw: body.phone ?? null,
    });
    const canonicalPhone: string | null =
      typeof matches === "string" ? matches : null;

    if (canonicalPhone) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (admin as any)
        .from("customers")
        .select("id, first_name, last_name, full_name, phone, email")
        .eq("canonical_phone", canonicalPhone)
        .limit(5);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          {
            error: "Possible duplicate customer",
            duplicates: existing,
          },
          { status: 409 },
        );
      }
    }
  }

  // Pre-existing Shopify id wins. Otherwise create-in-Shopify path may set it.
  let shopifyCustomerId: string | null = body.shopify_customer_id ?? null;
  if (!shopifyCustomerId && body.create_in_shopify && body.email) {
    // Email-pre-search dedup against Shopify.
    const matches = await searchShopifyCustomers(`email:${body.email}`);
    const found = matches.find((c) => c.email === body.email);
    if (found) {
      shopifyCustomerId = String(found.id);
    } else {
      try {
        const created = await createShopifyCustomer({
          first_name: body.first_name,
          last_name: body.last_name,
          email: body.email,
          phone: body.phone,
        });
        shopifyCustomerId = String(created.id);
      } catch (err) {
        return NextResponse.json(
          {
            error: "Shopify customer create failed",
            detail: err instanceof Error ? err.message : String(err),
          },
          { status: 502 },
        );
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error: insertErr } = await (admin as any)
    .from("customers")
    .insert({
      shopify_customer_id: shopifyCustomerId,
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      address_line_1: body.address_line_1 ?? null,
      address_line_2: body.address_line_2 ?? null,
      city_text: body.city_text ?? null,
      region_text: body.region_text ?? null,
      postal_code: body.postal_code ?? null,
      full_address: body.full_address ?? null,
      region_code: body.region_code ?? null,
      city_code: body.city_code ?? null,
      barangay_code: body.barangay_code ?? null,
    })
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ customer: row }, { status: 201 });
}
