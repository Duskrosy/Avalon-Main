import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { KanbanBoard } from "./kanban-board";

export default async function KanbanPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // OPS can view any department; others see own dept
  const departmentId = currentUser.department_id;
  if (!departmentId && !isOps(currentUser)) redirect("/");

  // Fetch department members and all active users (for cross-department assignment)
  const [membersRes, allUsersRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("department_id", departmentId ?? "")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),
  ]);

  // Fetch board directly via supabase (avoids circular HTTP call in server component)
  const { data: boardRow } = await supabase
    .from("kanban_boards")
    .select("id, name")
    .eq("department_id", departmentId ?? "")
    .maybeSingle();

  // Fetch columns with cards and field values
  const { data: columns } = boardRow
    ? await supabase
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
        .eq("board_id", boardRow.id)
        .order("sort_order")
    : { data: [] };

  // Fetch field definitions for this board
  const { data: fieldDefinitions } = boardRow
    ? await supabase
        .from("kanban_field_definitions")
        .select("*")
        .eq("board_id", boardRow.id)
        .order("sort_order")
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedColumns = ((columns ?? []) as any[]).map((col: any) => ({
    ...col,
    kanban_cards: (col.kanban_cards ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));

  return (
    <KanbanBoard
      board={boardRow ?? null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialColumns={sortedColumns as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      members={(membersRes.data ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allUsers={(allUsersRes.data ?? []) as any}
      departmentId={departmentId}
      canManage={isManagerOrAbove(currentUser)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialFieldDefinitions={(fieldDefinitions ?? []) as any}
    />
  );
}
