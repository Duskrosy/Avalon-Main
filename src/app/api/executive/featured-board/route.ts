import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";

const SETTING_KEY = "executive_featured_user_id";

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : null;
  if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: SETTING_KEY, value: { user_id: userId }, updated_by: currentUser.id },
      { onConflict: "key" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
