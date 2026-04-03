import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";
import { memoPostSchema } from "@/lib/api/schemas";

// GET /api/memos — list memos accessible to this user
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("memos")
    .select(`
      id, title, content, created_at, updated_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(first_name, last_name),
      memo_signatures(id, user_id, signed_at)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/memos — create memo, notify all relevant users
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(memoPostSchema, raw);
  if (validationError) return validationError;

  const { title, content, department_id } = body;

  const { data: memo, error } = await supabase
    .from("memos")
    .insert({
      title,
      content,
      department_id: department_id || null,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify relevant users (dept or all active staff)
  const admin = createAdminClient();
  let profileQuery = admin
    .from("profiles")
    .select("id")
    .eq("status", "active")
    .is("deleted_at", null)
    .neq("id", currentUser.id);

  if (department_id) {
    profileQuery = profileQuery.eq("department_id", department_id);
  }

  const { data: recipients } = await profileQuery;
  if (recipients?.length) {
    await admin.from("notifications").insert(
      recipients.map((r) => ({
        user_id: r.id,
        title: "New Memo",
        message: `"${title}" has been posted${department_id ? " for your department" : ""}.`,
        link_url: `/knowledgebase/memos/${memo.id}`,
      }))
    );
  }

  return NextResponse.json({ id: memo.id }, { status: 201 });
}
