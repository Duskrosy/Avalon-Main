import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// GET /api/learning/[id] — get material + signed URL if file
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("learning_materials")
    .select(`
      id, title, description, material_type, file_url, external_link, sort_order, created_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(first_name, last_name)
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  let signedUrl: string | null = null;
  if (data.file_url) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("learning")
      .createSignedUrl(data.file_url, 3600);
    signedUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ ...data, signed_url: signedUrl });
}

// DELETE /api/learning/[id] — manager+ can delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get file path before deleting
  const { data: material } = await supabase
    .from("learning_materials")
    .select("file_url")
    .eq("id", id)
    .single();

  if (material?.file_url) {
    const admin = createAdminClient();
    await admin.storage.from("learning").remove([material.file_url]);
  }

  const { error } = await supabase.from("learning_materials").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
