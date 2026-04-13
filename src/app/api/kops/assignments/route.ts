import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { trackEventServer } from "@/lib/observability/track";

// GET /api/kops/assignments?kop_id=xxx
// Returns all assignments for a KOP (managers+)
// Or all assignments for the current user (everyone)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const kopId = searchParams.get("kop_id");
  const myOnly = searchParams.get("my") === "true";

  if (myOnly) {
    // Get current user's assignments
    const { data, error } = await supabase
      .from("kop_assignments")
      .select("id, kop_id, assigned_at, notes, kop:kops(id, title, department:departments(id, name))")
      .eq("user_id", currentUser.id)
      .order("assigned_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (!kopId) return NextResponse.json({ error: "kop_id required" }, { status: 400 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("kop_assignments")
    .select("id, kop_id, user_id, assigned_at, notes, user:profiles!user_id(first_name, last_name, email), assigned_by_profile:profiles!assigned_by(first_name, last_name)")
    .eq("kop_id", kopId)
    .order("assigned_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/kops/assignments — assign KOP to user(s)
// Body: { kop_id: string, user_ids: string[], notes?: string }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { kop_id, user_ids, notes } = raw as { kop_id?: string; user_ids?: string[]; notes?: string };
  if (!kop_id || !user_ids?.length) return NextResponse.json({ error: "kop_id and user_ids required" }, { status: 400 });

  const rows = user_ids.map((uid) => ({
    kop_id,
    user_id: uid,
    assigned_by: currentUser.id,
    notes: notes || null,
  }));

  const { data, error } = await supabase
    .from("kop_assignments")
    .upsert(rows, { onConflict: "kop_id,user_id" })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify assigned users
  const admin = createAdminClient();
  const { data: kop } = await supabase.from("kops").select("title").eq("id", kop_id).single();

  if (kop) {
    await admin.from("notifications").insert(
      user_ids.filter((uid) => uid !== currentUser.id).map((uid) => ({
        user_id: uid,
        title: "KOP Assigned",
        message: `"${kop.title}" has been assigned to you.`,
        link_url: `/knowledgebase/kops/${kop_id}`,
      }))
    );
  }

  trackEventServer(supabase, currentUser.id, "kop.assigned", {
    module: "knowledgebase",
    properties: { kop_id, user_count: user_ids.length },
  });

  return NextResponse.json({ assigned: data?.length ?? 0 }, { status: 201 });
}

// DELETE /api/kops/assignments?id=xxx — remove assignment
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("kop_assignments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
