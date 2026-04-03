import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/directory
export async function GET(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dept = searchParams.get("department");

  let query = supabase
    .from("profiles")
    .select(`
      id, first_name, last_name, email, phone, avatar_url,
      department:departments(id, name, slug),
      role:roles(id, name, slug, tier)
    `)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  if (dept) {
    query = query.eq("department_id", dept);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profiles: data });
}
