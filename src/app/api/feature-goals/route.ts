import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";

const featureGoalCreateSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status:      z.enum(["planned", "in_progress", "done"]).default("planned"),
  progress:    z.number().int().min(0).max(100).default(0),
  milestone:   z.string().max(100).optional(),
  sort_order:  z.number().int().default(0),
});

// GET /api/feature-goals — list all goals with linked ticket counts
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("feature_goals")
    .select("*, feature_goal_tickets(id, feedback_id)")
    .order("milestone", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ goals: data });
}

// POST /api/feature-goals — create a new goal (OPS only)
export async function POST(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: body, error: validationError } = validateBody(featureGoalCreateSchema, raw);
  if (validationError) return validationError;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("feature_goals")
    .insert({ ...body, created_by: currentUser.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ goal: data }, { status: 201 });
}
