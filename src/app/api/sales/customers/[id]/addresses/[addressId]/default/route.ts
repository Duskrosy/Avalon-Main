import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { setDefaultShopifyCustomerAddress } from "@/lib/shopify/client";

// ─── POST /api/sales/customers/[id]/addresses/[addressId]/default ───────────
//
// Mark a saved Shopify address as the customer's default. Used by the
// "Set as default" action in the address-book modal. The path's address
// id becomes the new default; Shopify atomically clears the previous one.

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; addressId: string }> },
) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, addressId } = await params;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (admin as any)
    .from("customers")
    .select("id, shopify_customer_id")
    .eq("id", id)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (!customer.shopify_customer_id) {
    return NextResponse.json(
      { error: "Customer has no Shopify mirror" },
      { status: 409 },
    );
  }

  try {
    const address = await setDefaultShopifyCustomerAddress(
      customer.shopify_customer_id,
      addressId,
    );
    return NextResponse.json({ address });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Shopify default address update failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
