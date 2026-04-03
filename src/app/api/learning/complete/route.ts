import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { trackEventServer } from "@/lib/observability/track";
import { validateBody } from "@/lib/api/validate";
import { learningCompletePostSchema } from "@/lib/api/schemas";

// POST /api/learning/complete — mark/unmark material as complete
// Body: { material_id: string, completed: boolean }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(learningCompletePostSchema, raw);
  if (validationError) return validationError;

  const { material_id, completed } = body;

  if (completed) {
    const { error } = await supabase.from("learning_completions").insert({
      user_id: currentUser.id,
      material_id,
    });
    // Ignore duplicate (23505)
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("learning_completions")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("material_id", material_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (completed) {
    trackEventServer(supabase, currentUser.id, "learning.completed", {
      module: "knowledgebase",
      properties: { material_id },
    });
  }

  return NextResponse.json({ ok: true });
}
