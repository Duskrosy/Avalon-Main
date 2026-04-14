import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

// GET /api/kanban?department_id=xxx — board with columns and cards
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get("department_id");

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deptId = departmentId ?? currentUser.department_id;
  if (!deptId) return NextResponse.json({ error: "No department" }, { status: 400 });

  // Get or auto-create board
  let { data: board } = await supabase
    .from("kanban_boards")
    .select("id, name")
    .eq("department_id", deptId)
    .maybeSingle();

  if (!board) {
    // Auto-create board + default columns using admin client (bypasses RLS for setup)
    const admin = createAdminClient();
    const { data: newBoard } = await admin
      .from("kanban_boards")
      .insert({ department_id: deptId, name: "Main Board", created_by: currentUser.id })
      .select("id, name")
      .single();
    board = newBoard;

    if (board) {
      const defaultColumns = ["To Do", "In Progress", "Review", "Done"];
      await admin.from("kanban_columns").insert(
        defaultColumns.map((name, i) => ({
          board_id: board!.id,
          name,
          sort_order: i,
        }))
      );
    }
  }

  if (!board) return NextResponse.json({ error: "Failed to load board" }, { status: 500 });

  // Fetch columns with cards and field values
  const { data: columns, error } = await supabase
    .from("kanban_columns")
    .select(`
      id, name, sort_order,
      kanban_cards(
        id, title, description, priority, due_date, sort_order, created_at, completed_at,
        assigned_to_profile:profiles!assigned_to(id, first_name, last_name),
        created_by_profile:profiles!created_by(first_name, last_name),
        field_values:kanban_card_field_values(
          id, field_definition_id, value_text, value_number, value_date, value_boolean, value_json
        )
      )
    `)
    .eq("board_id", board.id)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch field definitions for this board
  const { data: fieldDefinitions } = await supabase
    .from("kanban_field_definitions")
    .select("*")
    .eq("board_id", board.id)
    .order("sort_order");

  // Sort cards within each column
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columnsWithSortedCards = (columns ?? []).map((col: any) => ({
    ...col,
    kanban_cards: (col.kanban_cards ?? []).sort(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any, b: any) => a.sort_order - b.sort_order
    ),
  }));

  return NextResponse.json({
    board,
    columns: columnsWithSortedCards,
    fieldDefinitions: fieldDefinitions ?? [],
  });
}

// POST /api/kanban/columns — add a column
// (Columns and cards have their own sub-routes)
