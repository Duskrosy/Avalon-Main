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
