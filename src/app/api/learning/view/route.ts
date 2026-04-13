import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { trackEventServer } from "@/lib/observability/track";

// POST /api/learning/view — record that user viewed a material
// Body: { material_id: string, duration_s?: number }
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

  const { material_id, duration_s } = raw as { material_id?: string; duration_s?: number };
  if (!material_id) return NextResponse.json({ error: "material_id required" }, { status: 400 });

  // Upsert: create view record or update duration if exists
  const { error } = await supabase
    .from("learning_views")
    .upsert(
      {
        user_id: currentUser.id,
        material_id,
        viewed_at: new Date().toISOString(),
        duration_s: duration_s ?? 0,
      },
      { onConflict: "user_id,material_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  trackEventServer(supabase, currentUser.id, "learning.viewed", {
    module: "knowledgebase",
    properties: { material_id, duration_s },
  });

  return NextResponse.json({ ok: true });
}
