import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/leaves/[id]/documents
// Returns the doc request/upload record for this leave.
export async function GET(_req: Request, { params }: RouteParams) {
  const { id: leaveId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Verify the user can see this leave
  const { data: leave } = await admin
    .from("leaves")
    .select("user_id, profile:profiles!leaves_user_id_fkey(department_id)")
    .eq("id", leaveId)
    .single();

  if (!leave) return NextResponse.json({ error: "Leave not found" }, { status: 404 });

  const leaveProfile = leave.profile as unknown as { department_id: string };
  const isOwn = leave.user_id === currentUser.id;
  const isSameDept =
    isManagerOrAbove(currentUser) &&
    leaveProfile.department_id === currentUser.department_id;

  if (!isOwn && !isSameDept && !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: doc } = await admin
    .from("leave_documents")
    .select(`
      *,
      requester:profiles!leave_documents_requested_by_fkey(first_name, last_name),
      uploader:profiles!leave_documents_uploaded_by_fkey(first_name, last_name)
    `)
    .eq("leave_id", leaveId)
    .single();

  return NextResponse.json({ document: doc ?? null });
}

// POST /api/leaves/[id]/documents
// Two actions via Content-Type:
//   JSON body { action: "request", note?: string } — manager requests supporting docs
//   multipart FormData { file: File }              — employee uploads the file
export async function POST(request: Request, { params }: RouteParams) {
  const { id: leaveId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Fetch the leave + owner info
  const { data: leave } = await admin
    .from("leaves")
    .select(`
      user_id, leave_type, start_date, end_date,
      profile:profiles!leaves_user_id_fkey(id, first_name, last_name, department_id)
    `)
    .eq("id", leaveId)
    .single();

  if (!leave) return NextResponse.json({ error: "Leave not found" }, { status: 404 });

  const leaveOwner = leave.profile as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    department_id: string;
  };

  const contentType = request.headers.get("content-type") ?? "";

  // ── REQUEST DOCUMENTS (manager → employee) ────────────────
  if (contentType.includes("application/json")) {
    if (!isManagerOrAbove(currentUser) && !isOps(currentUser)) {
      return NextResponse.json({ error: "Unauthorized — managers only" }, { status: 403 });
    }
    if (!isOps(currentUser) && leaveOwner.department_id !== currentUser.department_id) {
      return NextResponse.json({ error: "You can only request documents from your department" }, { status: 403 });
    }

    const body = await request.json();
    const note: string | null = body.note ?? null;

    // Upsert: one doc record per leave
    const { error } = await admin
      .from("leave_documents")
      .upsert(
        {
          leave_id: leaveId,
          requested_by: currentUser.id,
          requested_at: new Date().toISOString(),
          request_note: note,
        },
        { onConflict: "leave_id" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify the leave owner
    await admin.from("notifications").insert({
      user_id: leaveOwner.id,
      type: "leave_docs_requested",
      title: "Supporting document requested",
      body: `${currentUser.first_name} ${currentUser.last_name} has requested a supporting document for your ${leave.leave_type} leave (${leave.start_date} → ${leave.end_date}).${note ? ` Note: ${note}` : ""}`,
      link_url: "/people/leaves",
    });

    return NextResponse.json({ message: "Document request sent" });
  }

  // ── UPLOAD DOCUMENT (employee → server → Supabase Storage) ──
  if (contentType.includes("multipart/form-data")) {
    // Only the leave owner can upload their own doc
    if (leave.user_id !== currentUser.id) {
      return NextResponse.json({ error: "You can only upload documents for your own leaves" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large — max 10 MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() ?? "bin";
    const storagePath = `${leaveId}/${Date.now()}.${ext}`;
    const bytes = await file.arrayBuffer();

    // Upload to Supabase Storage using admin client (bypasses storage RLS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: uploadData, error: uploadError } = await (admin as any).storage
      .from("leave-documents")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Generate a signed URL (valid 7 days — viewer must re-request via this API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: signedData } = await (admin as any).storage
      .from("leave-documents")
      .createSignedUrl(uploadData.path, 60 * 60 * 24 * 7);

    const fileUrl = signedData?.signedUrl ?? "";

    // Save the upload record
    const { error: dbError } = await admin
      .from("leave_documents")
      .upsert(
        {
          leave_id: leaveId,
          file_url: fileUrl,
          file_name: file.name,
          file_size: file.size,
          uploaded_by: currentUser.id,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: "leave_id" }
      );

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    // Notify the manager who requested it (if there is one)
    const { data: docRecord } = await admin
      .from("leave_documents")
      .select("requested_by")
      .eq("leave_id", leaveId)
      .single();

    if (docRecord?.requested_by) {
      await admin.from("notifications").insert({
        user_id: docRecord.requested_by,
        type: "leave_docs_uploaded",
        title: "Supporting document uploaded",
        body: `${currentUser.first_name} ${currentUser.last_name} uploaded a supporting document for their ${leave.leave_type} leave.`,
        link_url: "/people/leaves",
      });
    }

    return NextResponse.json({ message: "Document uploaded", file_name: file.name });
  }

  return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
}
