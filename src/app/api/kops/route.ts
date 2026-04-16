import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// GET /api/kops — list all KOPs accessible to this user
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("kops")
    .select(`
      id, title, description, category, current_version, created_at, updated_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(first_name, last_name)
    `)
    .order("title");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/kops — create KOP + upload first version
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const title       = formData.get("title") as string;
  const description = formData.get("description") as string | null;
  const category    = formData.get("category") as string | null;
  const departmentId = formData.get("department_id") as string | null;
  const changeNotes = formData.get("change_notes") as string | null;
  const file        = formData.get("file") as File | null;

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!file)  return NextResponse.json({ error: "file is required" }, { status: 400 });

  // Create the KOP row (use admin client to bypass RLS)
  const admin = createAdminClient();
  const { data: kop, error: kopErr } = await admin
    .from("kops")
    .insert({
      title,
      description: description || null,
      category: category || null,
      department_id: departmentId || null,
      created_by: currentUser.id,
      current_version: 1,
    })
    .select("id")
    .single();

  if (kopErr) return NextResponse.json({ error: kopErr.message }, { status: 500 });

  // Upload file to storage
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${kop.id}/v1.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from("kops")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    await admin.from("kops").delete().eq("id", kop.id);
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // Insert version row
  const { error: versionErr } = await admin
    .from("kop_versions")
    .insert({
      kop_id: kop.id,
      version_number: 1,
      file_url: storagePath,
      file_type: ext,
      change_notes: changeNotes || null,
      uploaded_by: currentUser.id,
    });

  if (versionErr) return NextResponse.json({ error: versionErr.message }, { status: 500 });

  return NextResponse.json({ id: kop.id }, { status: 201 });
}
