import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// POST /api/kops/[id]/versions — upload a new version
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get current version number
  const { data: kop, error: kopErr } = await supabase
    .from("kops")
    .select("id, current_version")
    .eq("id", id)
    .single();

  if (kopErr || !kop) return NextResponse.json({ error: "KOP not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const changeNotes = formData.get("change_notes") as string | null;

  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const newVersion = kop.current_version + 1;
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${id}/v${newVersion}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from("kops")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Insert version row
  const { error: versionErr } = await supabase
    .from("kop_versions")
    .insert({
      kop_id: id,
      version_number: newVersion,
      file_url: storagePath,
      file_type: ext,
      change_notes: changeNotes || null,
      uploaded_by: currentUser.id,
    });

  if (versionErr) return NextResponse.json({ error: versionErr.message }, { status: 500 });

  // Bump current_version on parent
  await supabase.from("kops").update({ current_version: newVersion }).eq("id", id);

  return NextResponse.json({ version_number: newVersion }, { status: 201 });
}
