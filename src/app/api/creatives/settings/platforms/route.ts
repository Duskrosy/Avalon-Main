import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// PATCH /api/creatives/settings/platforms
// Updates a single smm_group_platforms row.
// Allowed fields: page_id, page_name, handle, access_token (optional).
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOps(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("page_id"   in body) update.page_id   = body.page_id   ?? null;
  if ("page_name" in body) update.page_name = body.page_name ?? null;
  if ("handle"    in body) update.handle    = body.handle    ?? null;
  if (typeof body.access_token === "string" && body.access_token.length > 0) {
    update.access_token = body.access_token;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("smm_group_platforms")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
