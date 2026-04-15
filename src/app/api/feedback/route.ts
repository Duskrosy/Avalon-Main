import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";
import { trackEventServer } from "@/lib/observability/track";

const feedbackCreateSchema = z.object({
  category: z.enum(["bug", "missing_feature", "confusing", "slow", "other"]),
  body: z.string().min(1, "Feedback body is required").max(2000),
  page_url: z.string().max(500).optional(),
  user_agent: z.string().max(500).optional(),
});

const feedbackPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "acknowledged", "resolved", "wontfix"]),
});

// POST /api/feedback — create feedback
export async function POST(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { data: body, error: validationError } = validateBody(
    feedbackCreateSchema,
    raw
  );
  if (validationError) return validationError;

  const { data, error } = await supabase.from("feedback").insert({
    user_id: currentUser.id,
    department_id: currentUser.department?.id ?? null,
    category: body.category,
    body: body.body,
    page_url: body.page_url ?? null,
    user_agent: body.user_agent ?? null,
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  trackEventServer(supabase, currentUser.id, "feedback.submitted", {
    module: "feedback",
    properties: { category: body.category },
  });

  return NextResponse.json({ feedback: data }, { status: 201 });
}

// GET /api/feedback — read feedback (own for users, all for OPS)
export async function GET(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const departmentId = searchParams.get("department_id");
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

  const userIsOps = isOps(currentUser);

  let query = supabase
    .from("feedback")
    .select("*, profiles:user_id(first_name, last_name, email)")
    .order("created_at", { ascending: false })
    .limit(limit);

  // Defense-in-depth: scope to own rows for non-OPS (RLS also enforces this)
  if (!userIsOps) {
    query = query.eq("user_id", currentUser.id);
  }

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ feedback: data });
}

// PATCH /api/feedback — update status (OPS only)
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { data: body, error: validationError } = validateBody(
    feedbackPatchSchema,
    raw
  );
  if (validationError) return validationError;

  const { data, error } = await supabase
    .from("feedback")
    .update({ status: body.status })
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  trackEventServer(supabase, currentUser.id, "feedback.status_updated", {
    module: "feedback",
    properties: { feedback_id: body.id, new_status: body.status },
  });

  return NextResponse.json({ feedback: data });
}
