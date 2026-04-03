import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

// GET /api/announcements
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("announcements")
    .select(`
      id, title, content, priority, expires_at, created_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/announcements
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, content, priority, department_id, expires_at } = await req.json() as {
    title: string;
    content: string;
    priority?: "normal" | "important" | "urgent";
    department_id?: string | null;
    expires_at?: string | null;
  };

  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: "content is required" }, { status: 400 });

  // Non-OPS managers can only post to own department
  if (!isOps(currentUser) && department_id && department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: announcement, error } = await supabase
    .from("announcements")
    .insert({
      title,
      content,
      priority: priority ?? "normal",
      department_id: department_id || null,
      expires_at: expires_at || null,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify relevant users
  const admin = createAdminClient();
  let profileQuery = admin
    .from("profiles")
    .select("id")
    .eq("status", "active")
    .is("deleted_at", null)
    .neq("id", currentUser.id);

  if (department_id) profileQuery = profileQuery.eq("department_id", department_id);

  const { data: recipients } = await profileQuery;
  if (recipients?.length) {
    await admin.from("notifications").insert(
      recipients.map((r) => ({
        user_id: r.id,
        title: priority === "urgent" ? "Urgent announcement" : "New announcement",
        message: title,
        link_url: `/communications/announcements`,
      }))
    );
  }

  return NextResponse.json({ id: announcement.id }, { status: 201 });
}

// DELETE /api/announcements?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS handles OPS-or-own-author check
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
