import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextResponse } from "next/server";

// GET /api/sales/agents
// Returns sales-dept profiles. OPS sees all; sales managers see own dept.
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find sales department id
  const { data: salesDept } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", "sales")
    .single();

  let query = supabase
    .from("profiles")
    .select("id, first_name, last_name, email, department_id")
    .eq("status", "active")
    .order("first_name");

  if (!isOps(currentUser)) {
    // Limit to sales dept only
    if (salesDept) {
      query = query.eq("department_id", salesDept.id);
    } else {
      return NextResponse.json([]);
    }
  } else {
    // OPS can filter to sales dept for convenience, but also returns all
    if (salesDept) query = query.eq("department_id", salesDept.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
