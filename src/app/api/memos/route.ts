import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// GET /api/memos — list memos accessible to this user
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("memos")
    .select(`
      id, title, content, attachment_url, attachment_name, created_at, updated_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(first_name, last_name),
      memo_signatures(id, user_id, signed_at)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/memos — create memo with optional attachment
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fd = await req.formData();
  const title = fd.get("title") as string | null;
  const content = fd.get("content") as string | null;
  const department_id = fd.get("department_id") as string | null;
  const file = fd.get("file") as File | null;

  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: "Content is required" }, { status: 400 });

  // Upload attachment if provided
  let attachment_url: string | null = null;
  let attachment_name: string | null = null;

  if (file && file.size > 0) {
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Attachment must be under 50MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() ?? "bin";
    const allowed = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"];
    if (!allowed.includes(ext.toLowerCase())) {
      return NextResponse.json({ error: `File type .${ext} not allowed` }, { status: 400 });
    }

    const admin = createAdminClient();
    const storagePath = `memos/${Date.now()}-${file.name}`;
    const { error: uploadError } = await admin.storage
      .from("kops")
      .upload(storagePath, file, { contentType: file.type });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    attachment_url = storagePath;
    attachment_name = file.name;
  }

  const { data: memo, error } = await supabase
    .from("memos")
    .insert({
      title: title.trim(),
      content: content.trim(),
      department_id: department_id || null,
      attachment_url,
      attachment_name,
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
