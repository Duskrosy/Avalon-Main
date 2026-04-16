import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/kanban?board_id=xxx  OR  ?department_id=xxx
// board_id takes priority (used by realtime refetch for any board scope)
// department_id falls back to team board lookup + auto-create
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("board_id");
  const departmentId = searchParams.get("department_id");

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let board: { id: string; name: string } | null = null;

  if (boardId) {
    // Direct board lookup (works for any scope)
    const { data } = await supabase
      .from("kanban_boards")
      .select("id, name")
      .eq("id", boardId)
      .maybeSingle();
    board = data;
  } else {
    // Legacy: department-based team board lookup + auto-create
    const deptId = departmentId ?? currentUser.department_id;
    if (!deptId) return NextResponse.json({ error: "No department" }, { status: 400 });

    const { data } = await supabase
      .from("kanban_boards")
      .select("id, name")
      .eq("department_id", deptId)
      .eq("scope", "team")
      .maybeSingle();
    board = data;

    if (!board) {
      // Auto-create team board + default columns
      const admin = createAdminClient();
      const { data: newBoard } = await admin
        .from("kanban_boards")
        .insert({ department_id: deptId, name: "Team Board", scope: "team", created_by: currentUser.id })
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
  }

  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  // Fetch columns with cards, field values, and assignees
  const { data: columns, error } = await supabase
    .from("kanban_columns")
    .select(`
      id, name, sort_order, color, is_default,
      kanban_cards(
        id, title, description, priority, due_date, start_date, sort_order, created_at, completed_at, color,
        created_by_profile:profiles!created_by(first_name, last_name),
        field_values:kanban_card_field_values(
          id, field_definition_id, value_text, value_number, value_date, value_boolean, value_json
        ),
        assignees:kanban_card_assignees(
          id, user_id,
          profile:profiles!user_id(id, first_name, last_name, avatar_url)
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
