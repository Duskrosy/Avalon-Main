import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

const CURRENCIES = [
  "USD","PHP","AUD","GBP","EUR","SGD","CAD","HKD","NZD","MYR","IDR","THB","JPY","KRW",
];

async function requireOps(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };
  return { error: null, supabase };
}

// GET — list all Meta accounts
export async function GET() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ad_meta_accounts")
    .select("id, account_id, name, label, currency, is_active, group_id, created_at")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — add a new Meta ad account
export async function POST(req: NextRequest) {
  const { error, supabase } = await requireOps(req);
  if (error) return error;

  const body = await req.json();
  const { account_id, name, label, currency, group_id } = body;

  if (!account_id || typeof account_id !== "string" || !account_id.trim()) {
    return NextResponse.json({ error: "account_id is required (the numeric Meta ad account ID)" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (currency && !CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("ad_meta_accounts")
    .insert({
      account_id: account_id.trim().replace(/^act_/, ""), // strip act_ prefix if pasted
      name: name.trim(),
      label: label?.trim() ?? null,
      currency: currency ?? "USD",
      group_id: group_id ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — update account (name, label, currency, group_id, is_active)
export async function PATCH(req: NextRequest) {
  const { error, supabase } = await requireOps(req);
  if (error) return error;

  const body = await req.json();
  const { id, name, label, currency, group_id, is_active, primary_conversion_id, primary_conversion_name } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (currency && !CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name      !== undefined) updates.name      = String(name).trim();
  if (label     !== undefined) updates.label     = label ? String(label).trim() : null;
  if (currency  !== undefined) updates.currency  = currency;
  if (is_active !== undefined) updates.is_active = Boolean(is_active);
  if ("group_id"               in body) updates.group_id               = group_id ?? null;
  if ("primary_conversion_id"  in body) updates.primary_conversion_id  = primary_conversion_id ?? null;
  if ("primary_conversion_name" in body) updates.primary_conversion_name = primary_conversion_name ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase!
    .from("ad_meta_accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove a Meta account
export async function DELETE(req: NextRequest) {
  const { error, supabase } = await requireOps(req);
  if (error) return error;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error: dbErr } = await supabase!
    .from("ad_meta_accounts")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
