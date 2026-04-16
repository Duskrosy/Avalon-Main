import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/leave-requests/[id]/attachments
// Returns all attachments for a leave request, ordered by created_at
export async function GET(_req: Request, { params }: RouteParams) {
  const { id: leaveRequestId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Verify the user can see this leave request
  const { data: leaveRequest } = await admin
    .from("leave_requests")
    .select("user_id, profile:profiles!leave_requests_user_id_fkey(department_id)")
    .eq("id", leaveRequestId)
    .single();

  if (!leaveRequest) return NextResponse.json({ error: "Leave request not found" }, { status: 404 });

  const leaveProfile = leaveRequest.profile as unknown as { department_id: string };
  const isRequester = leaveRequest.user_id === currentUser.id;
  const isSameDept =
    isManagerOrAbove(currentUser) &&
    leaveProfile.department_id === currentUser.department_id;

  if (!isRequester && !isSameDept && !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all attachments for this leave request
  const { data: attachments } = await admin
    .from("leave_attachments")
    .select(
      `
      *,
      uploader:profiles!leave_attachments_uploaded_by_fkey(first_name, last_name)
    `
    )
    .eq("leave_request_id", leaveRequestId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ attachments: attachments ?? [] });
}

// POST /api/leave-requests/[id]/attachments
// Upload a supporting document for a leave request
export async function POST(request: Request, { params }: RouteParams) {
  const { id: leaveRequestId } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Fetch the leave request + owner info
  const { data: leaveRequest } = await admin
    .from("leave_requests")
    .select(
      `
      user_id,
      profile:profiles!leave_requests_user_id_fkey(id, first_name, last_name, department_id)
    `
    )
    .eq("id", leaveRequestId)
    .single();

  if (!leaveRequest) return NextResponse.json({ error: "Leave request not found" }, { status: 404 });

  const leaveOwner = leaveRequest.profile as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    department_id: string;
  };

  // Verify caller can upload (is requester OR isOps OR isManagerOrAbove)
  const isRequester = leaveRequest.user_id === currentUser.id;
  const isSameDept =
    isManagerOrAbove(currentUser) &&
    leaveOwner.department_id === currentUser.department_id;

  if (!isRequester && !isSameDept && !isOps(currentUser)) {
    return NextResponse.json({ error: "You cannot upload documents for this leave request" }, { status: 403 });
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
  const timestamp = Date.now();
  const storagePath = `leave-requests/${leaveRequestId}/${timestamp}-${file.name}`;
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

  // Generate a public URL for the file
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: publicData } = (await (admin as any).storage
    .from("leave-documents")
    .getPublicUrl(uploadData.path)) as any;

  const fileUrl = publicData?.publicUrl ?? "";

  // Insert record into leave_attachments table
  const { data: attachment, error: dbError } = await admin
    .from("leave_attachments")
    .insert({
      leave_request_id: leaveRequestId,
      file_url: fileUrl,
      file_name: file.name,
      uploaded_by: currentUser.id,
    })
    .select(
      `
      *,
      uploader:profiles!leave_attachments_uploaded_by_fkey(first_name, last_name)
    `
    )
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ attachment, message: "Attachment uploaded successfully" });
}
