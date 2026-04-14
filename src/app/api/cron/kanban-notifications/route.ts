import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/cron/kanban-notifications — check for due/overdue tasks and send notifications
// Run daily via cron
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayStr = now.toISOString().split("T")[0];
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Find cards that are due today or tomorrow (not completed)
  const { data: dueSoonCards, error: dueSoonError } = await admin
    .from("kanban_cards")
    .select(`
      id, title, due_date,
      column:kanban_columns!inner(
        id, name,
        board:kanban_boards!inner(id, name, department_id)
      ),
      assignees:kanban_card_assignees(
        user_id,
        profile:profiles!user_id(id, first_name, last_name)
      )
    `)
    .is("completed_at", null)
    .gte("due_date", todayStr)
    .lte("due_date", tomorrowStr);

  if (dueSoonError) {
    console.error("Error fetching due soon cards:", dueSoonError);
    return NextResponse.json({ error: dueSoonError.message }, { status: 500 });
  }

  // Find cards that are overdue (past due_date, not completed)
  const { data: overdueCards, error: overdueError } = await admin
    .from("kanban_cards")
    .select(`
      id, title, due_date,
      column:kanban_columns!inner(
        id, name,
        board:kanban_boards!inner(id, name, department_id)
      ),
      assignees:kanban_card_assignees(
        user_id,
        profile:profiles!user_id(id, first_name, last_name)
      )
    `)
    .is("completed_at", null)
    .lt("due_date", todayStr);

  if (overdueError) {
    console.error("Error fetching overdue cards:", overdueError);
    return NextResponse.json({ error: overdueError.message }, { status: 500 });
  }

  const notifications: {
    user_id: string;
    type: string;
    title: string;
    body: string;
    link_url: string;
  }[] = [];

  // Notify assignees about due soon tasks
  for (const card of dueSoonCards ?? []) {
    const isToday = card.due_date === todayStr;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignees = (card.assignees ?? []) as any[];

    for (const assignee of assignees) {
      if (!assignee.user_id) continue;
      notifications.push({
        user_id: assignee.user_id,
        type: "kanban_due_soon",
        title: isToday ? "Task due today" : "Task due tomorrow",
        body: `"${card.title}" is due ${isToday ? "today" : "tomorrow"}`,
        link_url: "/productivity/kanban",
      });
    }
  }

  // Notify assignees about overdue tasks
  for (const card of overdueCards ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignees = (card.assignees ?? []) as any[];
    const dueDate = new Date(card.due_date!);
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    for (const assignee of assignees) {
      if (!assignee.user_id) continue;
      notifications.push({
        user_id: assignee.user_id,
        type: "kanban_overdue",
        title: "Task overdue",
        body: `"${card.title}" is ${daysOverdue} day${daysOverdue > 1 ? "s" : ""} overdue`,
        link_url: "/productivity/kanban",
      });
    }
  }

  // Notify managers about overdue tasks for their team members
  // Get unique department IDs from overdue cards
  const deptIds = new Set<string>();
  for (const card of overdueCards ?? []) {
    const col = card.column as unknown as { board: { department_id: string } };
    if (col?.board?.department_id) {
      deptIds.add(col.board.department_id);
    }
  }

  // Fetch managers for those departments
  if (deptIds.size > 0) {
    const { data: managers } = await admin
      .from("profiles")
      .select("id, department_id")
      .in("department_id", Array.from(deptIds))
      .in("role", ["manager", "head", "ops"])
      .eq("status", "active")
      .is("deleted_at", null);

    // Group overdue cards by department
    const overdueByDept = new Map<string, typeof overdueCards>();
    for (const card of overdueCards ?? []) {
      const col = card.column as unknown as { board: { department_id: string } };
      const deptId = col?.board?.department_id;
      if (!deptId) continue;
      if (!overdueByDept.has(deptId)) overdueByDept.set(deptId, []);
      overdueByDept.get(deptId)!.push(card);
    }

    // Notify managers
    for (const manager of managers ?? []) {
      const deptOverdue = overdueByDept.get(manager.department_id!) ?? [];
      if (deptOverdue.length === 0) continue;

      // Get unique assignee names
      const assigneeNames = new Set<string>();
      for (const card of deptOverdue) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assignees = (card.assignees ?? []) as any[];
        for (const a of assignees) {
          const profile = a.profile;
          if (profile?.first_name) assigneeNames.add(`${profile.first_name} ${profile.last_name ?? ""}`);
        }
      }

      notifications.push({
        user_id: manager.id,
        type: "kanban_team_overdue",
        title: "Team tasks overdue",
        body: `${deptOverdue.length} task${deptOverdue.length > 1 ? "s" : ""} overdue from: ${Array.from(assigneeNames).slice(0, 3).join(", ")}${assigneeNames.size > 3 ? ` +${assigneeNames.size - 3} more` : ""}`,
        link_url: "/productivity/kanban",
      });
    }
  }

  // Insert notifications (avoid duplicates by checking recent ones)
  let inserted = 0;
  for (const notif of notifications) {
    // Check if similar notification exists in last 24 hours
    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", notif.user_id)
      .eq("type", notif.type)
      .eq("title", notif.title)
      .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (!existing) {
      await admin.from("notifications").insert(notif);
      inserted++;
    }
  }

  return NextResponse.json({
    success: true,
    dueSoon: dueSoonCards?.length ?? 0,
    overdue: overdueCards?.length ?? 0,
    notificationsSent: inserted,
  });
}
