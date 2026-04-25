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

// ─── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Build the addresses[] entry Shopify wants from the address fields the
 * Avalon drawer hands us. Returns undefined when there's nothing
 * addressable so we don't push an empty object that Shopify validates.
 *
 * Shopify expects `city` to be the most-specific addressing level — for
 * Manila that's the sub-muni name (Sampaloc, Tondo I, …) which is what
 * we store in customers.city_text.
 *
 * `province` is intentionally NOT sent. Shopify validates province
 * against Philippines's actual province list (Cebu, Bulacan, Abra,
 * etc.) — and our `region_text` holds the PSA region label ("Region V",
 * "NCR") which is a regional grouping, not a province, so it 422s with
 * "addresses.province is invalid". Until we add a ph_provinces seed
 * (PSGC /provinces/ endpoint) Shopify will infer the province from the
 * postal code (Phlpost zones are province-coded). City + zip + country
 * is enough for shipping.
 */
function buildShopifyAddresses(input: {
  address_line_1?: string | null;
  address_line_2?: string | null;
  city_text?: string | null;
  region_text?: string | null;
  postal_code?: string | null;
}): Array<{
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string;
}> | undefined {
  const hasAny =
    input.address_line_1 ||
    input.address_line_2 ||
    input.city_text ||
    input.postal_code;
  if (!hasAny) return undefined;
  return [
    {
      address1: input.address_line_1 ?? null,
      address2: input.address_line_2 ?? null,
      city: input.city_text ?? null,
      zip: input.postal_code ?? null,
      country: "Philippines",
    },
  ];
}

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
      "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached, address_line_1, address_line_2, city_text, region_text, postal_code, region_code, city_code, barangay_code",
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
    address_line_1: string | null;
    address_line_2: string | null;
    city_text: string | null;
    region_text: string | null;
    postal_code: string | null;
    region_code: string | null;
    city_code: string | null;
    barangay_code: string | null;
  }>;

  // Shopify pull. Shopify's /customers/search.json honors a Lucene-style
  // query — passing the raw search term searches name, email, and phone.
  // Wrapped in a try/catch (already in the helper) so a Shopify outage
  // doesn't blank the typeahead.
  const shopifyMatches = await searchShopifyCustomers(search);

  // Index Shopify matches by id so we can both (a) enrich local rows with
  // Shopify's authoritative orders_count, and (b) drop Shopify-only rows
  // that already have a local mirror.
  const shopifyById = new Map<string, (typeof shopifyMatches)[number]>();
  for (const c of shopifyMatches) shopifyById.set(String(c.id), c);

  // Enrich local rows with Shopify's lifetime orders_count when the Shopify
  // search happens to return the same id. (total_orders_cached on the
  // local table defaults to 0 and is never written today, so without this
  // every existing customer always shows "0 orders".)
  const enrichedLocal = local.map((r) => {
    if (r.shopify_customer_id) {
      const sc = shopifyById.get(r.shopify_customer_id);
      if (sc?.orders_count != null) {
        return { ...r, total_orders_cached: sc.orders_count };
      }
    }
    return r;
  });

  // Merge: dedup by shopify_customer_id. Local rows win.
  const localShopifyIds = new Set(
    local.map((r) => r.shopify_customer_id).filter(Boolean) as string[],
  );
  const shopifyOnly = shopifyMatches
    .filter((c) => !localShopifyIds.has(String(c.id)))
    .slice(0, 10)
    .map((c) => {
      const addr = c.addresses?.[0];
      return {
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
        full_address:
          addr &&
          ([addr.address1, addr.city, addr.province, addr.zip]
            .filter(Boolean)
            .join(", ") ||
            null),
        total_orders_cached: c.orders_count ?? null,
        // Shopify addresses don't have PSGC codes — the agent will fill
        // those manually if they choose to import this customer.
        address_line_1: addr?.address1 ?? null,
        address_line_2: addr?.address2 ?? null,
        city_text: addr?.city ?? null,
        region_text: addr?.province ?? null,
        postal_code: addr?.zip ?? null,
        region_code: null as string | null,
        city_code: null as string | null,
        barangay_code: null as string | null,
        _source: "shopify" as const,
      };
    });

  return NextResponse.json({
    customers: [...enrichedLocal, ...shopifyOnly].slice(0, 15),
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
   * If true (default), also create the customer in Shopify immediately —
   * Shopify is the single source of truth, so Avalon-side creation should
   * propagate. Set false only for the import-on-pick path (where we
   * already have shopify_customer_id and don't want to double-create).
   */
  create_in_shopify: z.boolean().optional().default(true),
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
        "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached, address_line_1, address_line_2, city_text, region_text, postal_code, region_code, city_code, barangay_code",
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
  if (!shopifyCustomerId && body.create_in_shopify) {
    // Dedup against Shopify before create. Email is the strongest dedup
    // key when we have it; phone is best-effort (Shopify search treats
    // phone matches as substrings, so we re-verify the exact match).
    let existing: { id: number } | undefined;
    if (body.email) {
      const matches = await searchShopifyCustomers(`email:${body.email}`);
      existing = matches.find((c) => c.email === body.email);
    }
    if (!existing && body.phone) {
      const matches = await searchShopifyCustomers(`phone:${body.phone}`);
      existing = matches.find((c) => c.phone === body.phone);
    }
    if (existing) {
      shopifyCustomerId = String(existing.id);
    } else {
      try {
        const created = await createShopifyCustomer({
          first_name: body.first_name,
          last_name: body.last_name,
          email: body.email,
          phone: body.phone,
          addresses: buildShopifyAddresses(body),
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
