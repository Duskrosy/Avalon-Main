import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/obs/usage?days=30
// Returns: daily active users, module usage, recent events
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = parseInt(new URL(req.url).searchParams.get("days") ?? "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [dauRes, moduleRes, eventRes] = await Promise.all([
    // Daily active users — group by day
    supabase
      .from("obs_app_events")
      .select("created_at, actor_id")
      .gte("created_at", since)
      .order("created_at"),

    // Module usage
    supabase
      .from("obs_app_events")
      .select("module, category, actor_id, event_name")
      .gte("created_at", since)
      .not("module", "is", null),

    // Top events
    supabase
      .from("obs_app_events")
      .select("event_name, module, category, actor_id, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // Aggregate daily active users client-side (avoids needing the view)
  const dauMap: Record<string, Set<string>> = {};
  for (const row of dauRes.data ?? []) {
    const day = row.created_at.slice(0, 10);
    if (!dauMap[day]) dauMap[day] = new Set();
    if (row.actor_id) dauMap[day].add(row.actor_id);
  }
  const dau = Object.entries(dauMap)
    .map(([day, users]) => ({ day, unique_users: users.size }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Module counts
  const moduleMap: Record<string, { count: number; users: Set<string> }> = {};
  for (const row of moduleRes.data ?? []) {
    const key = row.module ?? "unknown";
    if (!moduleMap[key]) moduleMap[key] = { count: 0, users: new Set() };
    moduleMap[key].count++;
    if (row.actor_id) moduleMap[key].users.add(row.actor_id);
  }
  const modules = Object.entries(moduleMap)
    .map(([module, { count, users }]) => ({ module, count, unique_users: users.size }))
    .sort((a, b) => b.count - a.count);

  // Event frequency
  const eventMap: Record<string, { count: number; users: Set<string>; latest: string }> = {};
  for (const row of eventRes.data ?? []) {
    const key = row.event_name;
    if (!eventMap[key]) eventMap[key] = { count: 0, users: new Set(), latest: row.created_at };
    eventMap[key].count++;
    if (row.actor_id) eventMap[key].users.add(row.actor_id);
    if (row.created_at > eventMap[key].latest) eventMap[key].latest = row.created_at;
  }
  const events = Object.entries(eventMap)
    .map(([event_name, { count, users, latest }]) => ({
      event_name,
      count,
      unique_users: users.size,
      latest,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const totalEvents = (dauRes.data ?? []).length;
  const totalUsers = new Set((dauRes.data ?? []).map((r) => r.actor_id).filter(Boolean)).size;

  return NextResponse.json({ dau, modules, events, totalEvents, totalUsers, days });
}
