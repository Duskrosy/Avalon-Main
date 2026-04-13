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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: body, error: validationError } = validateBody(learningCompletePostSchema, raw);
  if (validationError) return validationError;

  const { material_id, completed } = body;

  if (completed) {
    // Verify the user has actually viewed the material
    const { data: view } = await supabase
      .from("learning_views")
      .select("id")
      .eq("user_id", currentUser.id)
      .eq("material_id", material_id)
      .maybeSingle();

    if (!view) {
      return NextResponse.json(
        { error: "You must view this material before marking it complete." },
        { status: 400 }
      );
    }

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
