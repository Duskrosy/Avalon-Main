import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/api/validate";
import { confirmedSalePostSchema, confirmedSalePatchSchema } from "@/lib/api/schemas";

// GET /api/sales/confirmed-sales?month=YYYY-MM&agent_id=...
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const agentId = searchParams.get("agent_id");

  let query = supabase
    .from("sales_confirmed_sales")
    .select("*")
    .order("confirmed_date", { ascending: false });

  if (month) {
    query = query.gte("confirmed_date", `${month}-01`).lte("confirmed_date", `${month}-31`);
  }
  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/sales/confirmed-sales
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(confirmedSalePostSchema, raw);
  if (validationError) return validationError;

  const { data, error } = await supabase
    .from("sales_confirmed_sales")
    .insert({
      ...body,
      created_by: currentUser.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/sales/confirmed-sales?id=...
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(confirmedSalePatchSchema, raw);
  if (validationError) return validationError;

  const { data, error } = await supabase
    .from("sales_confirmed_sales")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/sales/confirmed-sales?id=...
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("sales_confirmed_sales").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
