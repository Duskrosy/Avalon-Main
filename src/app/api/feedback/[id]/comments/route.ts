import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { trackEventServer } from "@/lib/observability/track";

const commentCreateSchema = z.object({
  body: z.string().min(1).max(5000),
});

// GET /api/feedback/[id]/comments — reporter or OPS only (RLS enforces)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("feedback_comments")
    .select("id, body, created_at, author:author_id(id, first_name, last_name, avatar_url)")
    .eq("feedback_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

// POST /api/feedback/[id]/comments — OPS only
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = commentCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("feedback_comments")
    .insert({
      feedback_id: id,
      author_id: currentUser.id,
      body: parsed.data.body,
    })
    .select("id, body, created_at, author:author_id(id, first_name, last_name, avatar_url)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  trackEventServer(supabase, currentUser.id, "feedback.comment_created", {
    module: "feedback",
    properties: { feedback_id: id, comment_id: data.id },
  });

  return NextResponse.json({ comment: data }, { status: 201 });
}
