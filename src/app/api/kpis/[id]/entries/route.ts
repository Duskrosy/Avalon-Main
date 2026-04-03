import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// GET /api/kpis/[id]/entries — full history for a KPI
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("kpi_entries")
    .select("id, period_date, value_numeric, notes, created_at, entered_by_profile:profiles!entered_by(first_name, last_name)")
    .eq("kpi_definition_id", id)
    .is("profile_id", null)
    .order("period_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/kpis/[id]/entries — log a value
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { value_numeric, period_date, notes } = await req.json() as {
    value_numeric: number;
    period_date: string;
    notes?: string;
  };

  if (value_numeric === undefined || !period_date) {
    return NextResponse.json({ error: "value_numeric and period_date required" }, { status: 400 });
  }

  // Upsert: update if same KPI + same period already exists
  const { data, error } = await supabase
    .from("kpi_entries")
    .upsert({
      kpi_definition_id: id,
      profile_id: null,
      period_date,
      value_numeric,
      notes: notes || null,
      entered_by: currentUser.id,
    }, { onConflict: "kpi_definition_id,profile_id,period_date" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

// DELETE /api/kpis/[id]/entries?entry_id=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);
  const entryId = searchParams.get("entry_id");
  if (!entryId) return NextResponse.json({ error: "entry_id required" }, { status: 400 });

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("kpi_entries").delete().eq("id", entryId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
