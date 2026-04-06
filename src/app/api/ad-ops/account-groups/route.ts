import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

const CURRENCIES = [
  "USD","PHP","AUD","GBP","EUR","SGD","CAD","HKD","NZD","MYR","IDR","THB","JPY","KRW",
];

async function guard(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };
  return { error: null, supabase };
}

// GET — list all groups with their linked accounts
export async function GET() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: groups, error: ge } = await supabase
    .from("meta_account_groups")
    .select("id, name, currency, is_active, sort_order")
    .order("sort_order")
    .order("name");

  if (ge) return NextResponse.json({ error: ge.message }, { status: 500 });

  const { data: accounts, error: ae } = await supabase
    .from("ad_meta_accounts")
    .select("id, account_id, name, label, currency, is_active, group_id")
    .order("name");

  if (ae) return NextResponse.json({ error: ae.message }, { status: 500 });

  return NextResponse.json({ groups: groups ?? [], accounts: accounts ?? [] });
}

// POST — create a group
export async function POST(req: NextRequest) {
  const { error, supabase } = await guard(req);
  if (error) return error;

  const body = await req.json();
  const { name, currency } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (currency && !CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("meta_account_groups")
    .insert({ name: name.trim(), currency: currency ?? "USD" })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — update group (name, currency, is_active, sort_order)
export async function PATCH(req: NextRequest) {
  const { error, supabase } = await guard(req);
  if (error) return error;

  const body = await req.json();
  const { id, name, currency, is_active, sort_order } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (currency && !CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name       !== undefined) updates.name       = String(name).trim();
  if (currency   !== undefined) updates.currency   = currency;
  if (is_active  !== undefined) updates.is_active  = Boolean(is_active);
  if (sort_order !== undefined) updates.sort_order = Number(sort_order);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("meta_account_groups")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — delete a group (unlinks accounts, does not delete them)
export async function DELETE(req: NextRequest) {
  const { error, supabase } = await guard(req);
  if (error) return error;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Unlink all accounts from this group first
  await supabase!
    .from("ad_meta_accounts")
    .update({ group_id: null })
    .eq("group_id", id);

  const { error: dbErr } = await supabase!
    .from("meta_account_groups")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
