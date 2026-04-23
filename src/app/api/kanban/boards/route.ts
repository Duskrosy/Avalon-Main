import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { seedDefaultColumns } from "@/lib/kanban/defaults";

// POST /api/kanban/boards — create a new board
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, scope, department_id, owner_id } = body;

  if (!name || !scope) {
    return NextResponse.json({ error: "name and scope required" }, { status: 400 });
  }

  // Validate permissions based on scope
  if (scope === "global" && !isOps(currentUser)) {
    return NextResponse.json({ error: "Only OPS can create global boards" }, { status: 403 });
  }

  if (scope === "team") {
    if (!isManagerOrAbove(currentUser)) {
      return NextResponse.json({ error: "Only managers can create team boards" }, { status: 403 });
    }
    if (!department_id) {
      return NextResponse.json({ error: "department_id required for team boards" }, { status: 400 });
    }
    // Managers can only create boards for their own department (unless OPS)
    if (!isOps(currentUser) && department_id !== currentUser.department_id) {
      return NextResponse.json({ error: "Cannot create board for another department" }, { status: 403 });
    }
  }

  if (scope === "personal") {
    // Personal boards must be owned by the current user
    if (owner_id && owner_id !== currentUser.id) {
      return NextResponse.json({ error: "Cannot create personal board for another user" }, { status: 403 });
    }
  }

  const admin = createAdminClient();

  // Check if board already exists
  let existingQuery = admin.from("kanban_boards").select("id").eq("scope", scope);

  if (scope === "team") {
    existingQuery = existingQuery.eq("department_id", department_id);
  } else if (scope === "personal") {
    existingQuery = existingQuery.eq("owner_id", currentUser.id);
  }
  // Global boards are unique (only one)

  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Board already exists" }, { status: 409 });
  }

  // Create the board
  const boardData: Record<string, unknown> = {
    name,
    scope,
    created_by: currentUser.id,
  };

  if (scope === "team") {
    boardData.department_id = department_id;
  } else if (scope === "personal") {
    boardData.owner_id = currentUser.id;
    // Personal boards don't need department_id
  }
  // Global boards don't have department_id or owner_id

  const { data: newBoard, error } = await admin
    .from("kanban_boards")
    .insert(boardData)
    .select("id, name, scope")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create default columns — creatives team boards get tracker-status columns
  let departmentSlug: string | null = null;
  if (scope === "team" && department_id) {
    const { data: dept } = await admin
      .from("departments")
      .select("slug")
      .eq("id", department_id)
      .maybeSingle();
    departmentSlug = dept?.slug ?? null;
  }
  await seedDefaultColumns(admin, newBoard.id, scope, departmentSlug);

  return NextResponse.json(newBoard, { status: 201 });
}
