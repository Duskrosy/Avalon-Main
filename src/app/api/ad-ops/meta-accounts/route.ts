import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_CURRENCIES = [
  "USD","PHP","AUD","GBP","EUR","SGD","CAD","HKD","NZD","MYR","IDR","THB","JPY","KRW",
];

// PATCH /api/ad-ops/meta-accounts — update currency or name for an account
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, currency, name } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (currency && !SUPPORTED_CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (currency) updates.currency = currency;
  if (name && typeof name === "string" && name.trim()) updates.name = name.trim();

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ad_meta_accounts")
    .update(updates)
    .eq("id", id)
    .select("id, name, account_id, currency, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
