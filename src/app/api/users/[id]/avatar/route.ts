import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

const BUCKET   = "avatars";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function canEditOthers(currentUser: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!currentUser) return false;
  if (isManagerOrAbove(currentUser)) return true;
  if (currentUser.department?.slug === "ad-ops") return true;
  return false;
}

/** DELETE /api/users/[id]/avatar */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isSelf = currentUser.id === id;
  if (!isSelf && !canEditOthers(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("avatar_url, avatar_require_approval, department_id")
    .eq("id", id)
    .single();

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (isSelf && target.avatar_require_approval && !canEditOthers(currentUser)) {
    return NextResponse.json(
      { error: "Profile picture changes require manager approval for this account" },
      { status: 403 }
    );
  }

  if (!isSelf && !isOps(currentUser) && target.department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "You can only edit users in your department" }, { status: 403 });
  }

  if (target.avatar_url) {
    await admin.storage.from(BUCKET).remove([`${id}/avatar.jpg`]);
  }

  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: null, updated_by: currentUser.id })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Avatar removed" });
}

/** POST /api/users/[id]/avatar */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isSelf = currentUser.id === id;
  if (!isSelf && !canEditOthers(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("avatar_require_approval, department_id")
    .eq("id", id)
    .single();

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (isSelf && target.avatar_require_approval && !canEditOthers(currentUser)) {
    return NextResponse.json(
      { error: "Profile picture changes require manager approval for this account" },
      { status: 403 }
    );
  }

  if (!isSelf && !isOps(currentUser) && target.department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "You can only edit users in your department" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be under 10 MB" }, { status: 400 });

  // Only validate type if the browser actually sends one — canvas blobs sometimes arrive as "" or
  // "application/octet-stream" depending on browser/Node.js multipart parsing.
  if (file.type && file.type !== "" && !["image/jpeg", "image/png", "image/webp", "application/octet-stream"].includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are accepted" }, { status: 400 });
  }

  const path = `${id}/avatar.jpg`;

  // Convert to Uint8Array — most reliable format across Node.js + Supabase storage client
  const uint8 = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, uint8, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await admin
    .from("profiles")
    .update({ avatar_url: publicUrl, updated_by: currentUser.id })
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ avatar_url: publicUrl });
}
