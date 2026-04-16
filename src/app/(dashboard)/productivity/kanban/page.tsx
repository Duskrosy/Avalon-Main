import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { KanbanMultiBoard } from "./kanban-multi-board";

export default async function KanbanPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // OPS can view any department; others see own dept
  const departmentId = currentUser.department_id;
  if (!departmentId && !isOps(currentUser)) redirect("/");

  // Fetch all active users (for assignment)
  const { data: allUsersData } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_url")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  const allUsers = allUsersData ?? [];

  // Fetch all boards (using admin to bypass RLS so team/global boards are visible)
  // 1. Team board (scope='team', their department)
  // 2. Personal board (scope='personal', they own)
  // 3. Global board (scope='global')
  const { data: boards } = await admin
    .from("kanban_boards")
    .select("id, name, scope, owner_id, department_id")
    .or(`scope.eq.global,and(scope.eq.team,department_id.eq.${departmentId ?? ""}),and(scope.eq.personal,owner_id.eq.${currentUser.id})`);

  // Helper to fetch board data (using admin to bypass RLS so all cards are visible)
  async function fetchBoardData(boardId: string) {
    const [columnsRes, fieldsRes] = await Promise.all([
      admin
        .from("kanban_columns")
        .select(`
          id, name, sort_order, color,
          kanban_cards(
            id, title, description, priority, due_date, start_date, sort_order, created_at, completed_at, color,
            created_by_profile:profiles!created_by(first_name, last_name),
            assignees:kanban_card_assignees(
              id, user_id,
              profile:profiles!user_id(id, first_name, last_name, avatar_url)
            ),
            field_values:kanban_card_field_values(
              id, field_definition_id, value_text, value_number, value_date, value_boolean, value_json
            )
          )
        `)
        .eq("board_id", boardId)
        .order("sort_order"),
      admin
        .from("kanban_field_definitions")
        .select("*")
        .eq("board_id", boardId)
        .order("sort_order"),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortedColumns = ((columnsRes.data ?? []) as any[]).map((col: any) => ({
      ...col,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      kanban_cards: (col.kanban_cards ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }));

    return {
      columns: sortedColumns,
      fieldDefinitions: fieldsRes.data ?? [],
    };
  }

  // Organize boards by scope
  const teamBoard = boards?.find((b) => b.scope === "team");
  const personalBoard = boards?.find((b) => b.scope === "personal");
  const globalBoard = boards?.find((b) => b.scope === "global");

  // Fetch data for each board
  const [teamData, personalData, globalData] = await Promise.all([
    teamBoard ? fetchBoardData(teamBoard.id) : null,
    personalBoard ? fetchBoardData(personalBoard.id) : null,
    globalBoard ? fetchBoardData(globalBoard.id) : null,
  ]);

  return (
    <KanbanMultiBoard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      teamBoard={teamBoard ? { ...teamBoard, ...teamData } as any : null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      personalBoard={personalBoard ? { ...personalBoard, ...personalData } as any : null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalBoard={globalBoard ? { ...globalBoard, ...globalData } as any : null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allUsers={allUsers as any}
      departmentId={departmentId}
      canManageTeam={isManagerOrAbove(currentUser)}
      canManageGlobal={isOps(currentUser)}
      currentUserId={currentUser.id}
    />
  );
}
