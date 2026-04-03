import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// GET /api/learning — list learning materials with user's completions
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: materials, error }, { data: completions }] = await Promise.all([
    supabase
      .from("learning_materials")
      .select(`
        id, title, description, material_type, file_url, external_link, sort_order, created_at,
        department:departments(id, name, slug),
        created_by_profile:profiles!created_by(first_name, last_name)
      `)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("learning_completions")
      .select("material_id")
      .eq("user_id", currentUser.id),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const completedIds = new Set((completions ?? []).map((c) => c.material_id));
  const result = (materials ?? []).map((m) => ({
    ...m,
    completed: completedIds.has(m.id),
  }));

  return NextResponse.json(result);
}

// POST /api/learning — create learning material (manager+)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const title        = formData.get("title") as string;
  const description  = formData.get("description") as string | null;
  const materialType = formData.get("material_type") as string;
  const departmentId = formData.get("department_id") as string | null;
  const externalLink = formData.get("external_link") as string | null;
  const sortOrder    = parseInt(formData.get("sort_order") as string ?? "0", 10) || 0;
  const file         = formData.get("file") as File | null;

  if (!title)        return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!materialType) return NextResponse.json({ error: "material_type is required" }, { status: 400 });

  let fileUrl: string | null = null;

  if (file) {
    const admin = createAdminClient();
    const ext = file.name.split(".").pop() ?? "bin";
    const storagePath = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage
      .from("learning")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    fileUrl = storagePath;
  }

  const { data, error } = await supabase
    .from("learning_materials")
    .insert({
      title,
      description: description || null,
      material_type: materialType,
      department_id: departmentId || null,
      external_link: externalLink || null,
      file_url: fileUrl,
      sort_order: sortOrder,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
