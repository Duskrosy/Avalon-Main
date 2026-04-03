import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/kops/[id] — single KOP with versions + signed URLs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: kop, error } = await supabase
    .from("kops")
    .select(`
      id, title, description, category, current_version, created_at, updated_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(first_name, last_name),
      kop_versions(id, version_number, file_url, file_type, change_notes, created_at,
        uploaded_by_profile:profiles!uploaded_by(first_name, last_name))
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Generate signed URL for current version
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versions = (kop.kop_versions as any[]) ?? [];
  const withUrls = await Promise.all(
    versions.map(async (v) => {
      const { data: signed } = await admin.storage
        .from("kops")
        .createSignedUrl(v.file_url, 3600);
      return { ...v, signed_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ ...kop, kop_versions: withUrls });
}

// DELETE /api/kops/[id] — OPS only
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get all version paths before deleting
  const { data: versions } = await supabase
    .from("kop_versions")
    .select("file_url")
    .eq("kop_id", id);

  const admin = createAdminClient();
  if (versions?.length) {
    await admin.storage.from("kops").remove(versions.map((v) => v.file_url));
  }

  const { error } = await supabase.from("kops").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
