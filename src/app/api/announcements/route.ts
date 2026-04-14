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
      id, title, content, priority, flair_text, flair_color,
      attachment_url, attachment_name, expires_at, created_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate signed URLs for attachments
  const admin = createAdminClient();
  const enriched = await Promise.all(
    (data ?? []).map(async (a) => {
      if (!a.attachment_url) return a;
      const { data: signed } = await admin.storage
        .from("announcements")
        .createSignedUrl(a.attachment_url, 3600);
      return { ...a, attachment_signed_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json(enriched);
}

// POST /api/announcements — FormData with optional file attachment
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fd = await req.formData();
  const title = fd.get("title") as string | null;
  const content = fd.get("content") as string | null;
  const department_id = fd.get("department_id") as string | null;
  const expires_at = fd.get("expires_at") as string | null;
  const flair_text = fd.get("flair_text") as string | null;
  const flair_color = fd.get("flair_color") as string | null;
  const file = fd.get("file") as File | null;

  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: "Content is required" }, { status: 400 });

  // Non-OPS managers can only post to own department
  if (!isOps(currentUser) && department_id && department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Upload attachment if provided
  let attachment_url: string | null = null;
  let attachment_name: string | null = null;

  if (file && file.size > 0) {
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Attachment must be under 50MB" }, { status: 400 });
    }

    const admin = createAdminClient();
    const storagePath = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await admin.storage
      .from("announcements")
      .upload(storagePath, file, { contentType: file.type });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    attachment_url = storagePath;
    attachment_name = file.name;
  }

  const { data: announcement, error } = await supabase
    .from("announcements")
    .insert({
      title: title.trim(),
      content: content.trim(),
      priority: "normal",
      department_id: department_id || null,
      expires_at: expires_at || null,
      flair_text: flair_text?.trim() || null,
      flair_color: flair_color || null,
      attachment_url,
      attachment_name,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify relevant users with descriptive message
  const admin = createAdminClient();
  const authorName = `${currentUser.first_name} ${currentUser.last_name}`;
  const titlePreview = title.trim().length > 60 ? title.trim().slice(0, 60) + "..." : title.trim();

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
        type: "announcement",
        title: "New Announcement",
        body: `${authorName} posted an announcement: "${titlePreview}"`,
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

  // Check for attachment to clean up storage
  const { data: ann } = await supabase
    .from("announcements")
    .select("attachment_url")
    .eq("id", id)
    .single();

  if (ann?.attachment_url) {
    const admin = createAdminClient();
    await admin.storage.from("announcements").remove([ann.attachment_url]);
  }

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
