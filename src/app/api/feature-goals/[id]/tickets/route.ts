import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";

const linkSchema = z.object({
  feedback_id: z.string().uuid(),
});

// POST /api/feature-goals/[id]/tickets — link a feedback item (OPS only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: feature_goal_id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: body, error: validationError } = validateBody(linkSchema, raw);
  if (validationError) return validationError;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("feature_goal_tickets")
    .insert({ feature_goal_id, feedback_id: body.feedback_id })
    .select()
    .single();

  if (error) {
    // Unique constraint violation — already linked
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already linked" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ticket: data }, { status: 201 });
}

// DELETE /api/feature-goals/[id]/tickets?feedback_id=... — unlink (OPS only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: feature_goal_id } = await params;
  const url = new URL(request.url);
  const feedback_id = url.searchParams.get("feedback_id");

  if (!feedback_id) {
    return NextResponse.json({ error: "feedback_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("feature_goal_tickets")
    .delete()
    .eq("feature_goal_id", feature_goal_id)
    .eq("feedback_id", feedback_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
