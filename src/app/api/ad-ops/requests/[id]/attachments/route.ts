import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per ticket requirement
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
]);

async function ticketAccess(
  admin: ReturnType<typeof createAdminClient>,
  requestId: string,
  userId: string,
  userIsOps: boolean,
): Promise<boolean> {
  if (userIsOps) return true;

  const { data: request } = await admin
    .from("ad_requests")
    .select("requester_id, assignee_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return false;

  if (request.requester_id === userId || request.assignee_id === userId) return true;

  const { data: junction } = await admin
    .from("ad_request_assignees")
    .select("assignee_id")
    .eq("ad_request_id", requestId)
    .eq("assignee_id", userId)
    .maybeSingle();
  return !!junction;
}

// GET /api/ad-ops/requests/[id]/attachments
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await ticketAccess(admin, id, currentUser.id, isOps(currentUser));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rows, error } = await admin
    .from("ad_request_attachments")
    .select("id, path, file_name, mime_type, size_bytes, created_at")
    .eq("ad_request_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withUrls = await Promise.all(
    (rows ?? []).map(async (r) => {
      const { data: signed } = await admin.storage
        .from("ad-request-attachments")
        .createSignedUrl(r.path, 60 * 10);
      return { ...r, url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ attachments: withUrls });
}

// POST /api/ad-ops/requests/[id]/attachments — multipart FormData, max 5 total
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await ticketAccess(admin, id, currentUser.id, isOps(currentUser));
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
    .from("ad_request_attachments")
    .select("id", { count: "exact", head: true })
    .eq("ad_request_id", id);

  const existing = count ?? 0;
  if (existing + files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Max ${MAX_FILES} attachments per request (already ${existing}).` },
      { status: 400 },
    );
  }

  const results: Array<{ id: string; path: string; file_name: string | null; mime_type: string | null }> = [];
  for (const file of files) {
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `Unsupported mime type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large: ${file.name} (max 10 MB)` }, { status: 400 });
    }

    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const storagePath = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

    const { error: uploadError } = await admin.storage
      .from("ad-request-attachments")
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: row, error: insertError } = await admin
      .from("ad_request_attachments")
      .insert({
        ad_request_id: id,
        path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        created_by: currentUser.id,
      })
      .select("id, path, file_name, mime_type")
      .single();

    if (insertError) {
      await admin.storage.from("ad-request-attachments").remove([storagePath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    results.push(row);
  }

  return NextResponse.json({ attachments: results }, { status: 201 });
}

// DELETE /api/ad-ops/requests/[id]/attachments?attachment_id=xxx
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attachmentId = new URL(req.url).searchParams.get("attachment_id");
  if (!attachmentId) return NextResponse.json({ error: "Missing attachment_id" }, { status: 400 });

  const admin = createAdminClient();
  const allowed = await ticketAccess(admin, id, currentUser.id, isOps(currentUser));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: row } = await admin
    .from("ad_request_attachments")
    .select("id, path, created_by")
    .eq("id", attachmentId)
    .eq("ad_request_id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  if (!isOps(currentUser) && row.created_by !== currentUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await admin.storage.from("ad-request-attachments").remove([row.path]);
  const { error } = await admin.from("ad_request_attachments").delete().eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
