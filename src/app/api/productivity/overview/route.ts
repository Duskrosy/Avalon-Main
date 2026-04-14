import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";

// GET /api/productivity/overview — manager dashboard data
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get("department_id");

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIsOps = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);

  if (!userIsManager) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  // Build department filter
  const deptFilter = userIsOps && departmentId ? departmentId : currentUser.department_id;

  // Get board for the department
  const { data: board } = await supabase
    .from("kanban_boards")
    .select("id")
    .eq("department_id", deptFilter)
    .maybeSingle();

  if (!board) {
    return NextResponse.json({
      workload: [],
      overdue: [],
      stats: { total: 0, completed: 0, overdue: 0, completedThisWeek: 0 },
    });
  }

  // Get all cards for this board with assignee info
  const { data: cards, error } = await supabase
    .from("kanban_cards")
    .select(`
      id, title, priority, due_date, completed_at, assigned_to,
      assigned_to_profile:profiles!assigned_to(id, first_name, last_name),
      column:kanban_columns!inner(id, name, board_id)
    `)
    .eq("column.board_id", board.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Calculate workload by assignee
  const workloadMap = new Map<string, {
    id: string;
    name: string;
    open: number;
    overdue: number;
    completedThisWeek: number;
  }>();

  const overdueCards: Array<{
    id: string;
    title: string;
    priority: string;
    due_date: string;
    assignee: string | null;
    column: string;
  }> = [];

  let totalCards = 0;
  let completedCards = 0;
  let overdueCount = 0;
  let completedThisWeek = 0;

  for (const card of cards ?? []) {
    totalCards++;
    const isCompleted = !!card.completed_at;
    const isOverdue = !isCompleted && card.due_date && new Date(card.due_date) < now;
    const completedRecently = isCompleted && new Date(card.completed_at!) >= weekAgo;

    if (isCompleted) completedCards++;
    if (isOverdue) overdueCount++;
    if (completedRecently) completedThisWeek++;

    // Cast profile (Supabase returns single object for !inner join)
    const profile = card.assigned_to_profile as unknown as { id: string; first_name: string; last_name: string } | null;
    const column = card.column as unknown as { id: string; name: string; board_id: string };

    // Track overdue cards
    if (isOverdue) {
      overdueCards.push({
        id: card.id,
        title: card.title,
        priority: card.priority,
        due_date: card.due_date!,
        assignee: profile
          ? `${profile.first_name} ${profile.last_name}`
          : null,
        column: column.name,
      });
    }

    // Track workload by assignee
    if (profile) {
      const key = profile.id;
      const existing = workloadMap.get(key) ?? {
        id: key,
        name: `${profile.first_name} ${profile.last_name}`,
        open: 0,
        overdue: 0,
        completedThisWeek: 0,
      };

      if (!isCompleted) existing.open++;
      if (isOverdue) existing.overdue++;
      if (completedRecently) existing.completedThisWeek++;

      workloadMap.set(key, existing);
    }
  }

  // Sort overdue by date (oldest first)
  overdueCards.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  // Sort workload by overdue count (most overdue first)
  const workload = Array.from(workloadMap.values()).sort((a, b) => b.overdue - a.overdue);

  return NextResponse.json({
    workload,
    overdue: overdueCards.slice(0, 20), // Top 20 overdue
    stats: {
      total: totalCards,
      completed: completedCards,
      overdue: overdueCount,
      completedThisWeek,
    },
  });
}
