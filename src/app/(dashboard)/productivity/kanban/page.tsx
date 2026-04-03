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

  const [boardRes, membersRes, deptsRes] = await Promise.all([
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? "" : "http://localhost:3000"}/api/kanban?department_id=${departmentId ?? ""}`, {
      headers: { cookie: "" }, // server fetch — use supabase directly instead
    }).catch(() => null),
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("department_id", departmentId ?? "")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),
    isOps(currentUser)
      ? supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name")
      : Promise.resolve({ data: [] }),
  ]);

  // Fetch board directly via supabase (avoids circular HTTP call in server component)
  const { data: boardRow } = await supabase
    .from("kanban_boards")
    .select("id, name")
    .eq("department_id", departmentId ?? "")
    .maybeSingle();

  const { data: columns } = boardRow
    ? await supabase
        .from("kanban_columns")
        .select(`
          id, name, sort_order,
          kanban_cards(
            id, title, description, priority, due_date, sort_order, created_at,
            assigned_to_profile:profiles!assigned_to(id, first_name, last_name),
            created_by_profile:profiles!created_by(first_name, last_name)
          )
        `)
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
      departmentId={departmentId}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
