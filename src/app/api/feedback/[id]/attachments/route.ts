import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

async function ticketOwnerOrOps(supabase: ReturnType<typeof createAdminClient>, ticketId: string, userId: string, userIsOps: boolean) {
  if (userIsOps) return true;
  const { data } = await supabase
    .from("feedback")
    .select("user_id")
    .eq("id", ticketId)
    .maybeSingle();
  return data?.user_id === userId;
}

// GET /api/feedback/[id]/attachments — list with signed URLs
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await ticketOwnerOrOps(admin, id, currentUser.id, isOps(currentUser));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rows, error } = await admin
    .from("feedback_attachments")
    .select("id, path, mime_type, size_bytes, created_at")
    .eq("feedback_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withUrls = await Promise.all(
    (rows ?? []).map(async (r) => {
      const { data: signed } = await admin.storage
        .from("feedback-attachments")
        .createSignedUrl(r.path, 60 * 10);
      return { ...r, url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ attachments: withUrls });
}

// POST /api/feedback/[id]/attachments — upload up to 3 images (multipart form)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await ticketOwnerOrOps(admin, id, currentUser.id, isOps(currentUser));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
  }

  const files = form.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const { count } = await admin
    .from("feedback_attachments")
    .select("id", { count: "exact", head: true })
    .eq("feedback_id", id);

  const existing = count ?? 0;
  if (existing + files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Max ${MAX_FILES} attachments per ticket (already ${existing}).` },
      { status: 400 },
    );
  }

  const results: Array<{ id: string; path: string; mime_type: string | null }> = [];
  for (const file of files) {
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `Unsupported mime type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large: ${file.name}` }, { status: 400 });
    }

    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const storagePath = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

    const { error: uploadError } = await admin.storage
      .from("feedback-attachments")
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: row, error: insertError } = await admin
      .from("feedback_attachments")
      .insert({
        feedback_id: id,
        path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        created_by: currentUser.id,
      })
      .select("id, path, mime_type")
      .single();

    if (insertError) {
      await admin.storage.from("feedback-attachments").remove([storagePath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    results.push(row);
  }

  return NextResponse.json({ attachments: results }, { status: 201 });
}
