import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// GET /api/goals?department_id=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get("department_id");

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let query = supabase
    .from("goals")
    .select(`
      id, title, description, target_value, current_value, unit, deadline, status, created_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(first_name, last_name)
    `)
    .neq("status", "cancelled")
    .order("deadline");

  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/goals
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description, target_value, current_value, unit, deadline, department_id } =
    await req.json() as {
      title: string;
      description?: string;
      target_value: number;
      current_value?: number;
      unit?: string;
      deadline: string;
      department_id?: string;
    };

  if (!title || !target_value || !deadline) {
    return NextResponse.json({ error: "title, target_value, deadline required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("goals")
    .insert({
      title,
      description: description || null,
      target_value,
      current_value: current_value ?? 0,
      unit: unit || "%",
      deadline,
      department_id: department_id || null,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
