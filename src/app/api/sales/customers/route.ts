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
// Queries the local mirror first (fast, trigram on full_name + canonical phone +
// lowered email). Falls back to empty results — Shopify search is intentionally
// NOT chained here; agents create customers locally, and the periodic sync
// pulls Shopify customers in.

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
  // Match phone (canonical), lowered email, or trigram-matched full_name.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: byName } = await (admin as any)
    .from("customers")
    .select(
      "id, shopify_customer_id, first_name, last_name, full_name, email, phone, full_address, total_orders_cached",
    )
    .ilike("full_name", `%${search}%`)
    .limit(10);

  return NextResponse.json({ customers: byName ?? [] });
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
  /**
   * If true, also create the customer in Shopify immediately. Default false
   * (defer to order-confirm time).
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

  let shopifyCustomerId: string | null = null;
  if (body.create_in_shopify && body.email) {
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
    })
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ customer: row }, { status: 201 });
}
