import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

// GET /api/obs/activity?user_id=xxx&days=30&scope=all|department&module=xxx&limit=200
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse params ──────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "all";
  const userId = searchParams.get("user_id");
  const module = searchParams.get("module");
  const days = Math.min(parseInt(searchParams.get("days") ?? "30") || 30, 90);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200") || 200, 500);

  // ── Permission gate ───────────────────────────────────────────────────
  if (scope === "all" && !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (scope === "department" && !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();

  // ── Resolve member IDs for department scope ───────────────────────────
  let memberIds: string[] | null = null;
  if (scope === "department") {
    const { data: members, error: memberErr } = await admin
      .from("profiles")
      .select("id")
      .eq("department_id", currentUser.department_id)
      .is("deleted_at", null);

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }
    memberIds = (members ?? []).map((m) => m.id);
    if (memberIds.length === 0) {
      return NextResponse.json({ events: [], audit: [], users: [] });
    }
  }

  // ── Build queries ─────────────────────────────────────────────────────

  // 1. App events
  let eventsQuery = admin
    .from("obs_app_events")
    .select("id, event_name, category, actor_id, module, properties, success, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    eventsQuery = eventsQuery.eq("actor_id", userId);
  } else if (memberIds) {
    eventsQuery = eventsQuery.in("actor_id", memberIds);
  }
  if (module) {
    eventsQuery = eventsQuery.eq("module", module);
  }

  // 2. Audit logs
  let auditQuery = admin
    .from("obs_audit_logs")
    .select("id, actor_id, action, table_name, record_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    auditQuery = auditQuery.eq("actor_id", userId);
  } else if (memberIds) {
    auditQuery = auditQuery.in("actor_id", memberIds);
  }

  // 3. User profiles for display
  let usersQuery = admin
    .from("profiles")
    .select("id, first_name, last_name, email, department_id, departments(name)")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  if (scope === "department") {
    usersQuery = usersQuery.eq("department_id", currentUser.department_id);
  }

  // ── Execute in parallel ───────────────────────────────────────────────
  const [eventsRes, auditRes, usersRes] = await Promise.all([
    eventsQuery,
    auditQuery,
    usersQuery,
  ]);

  if (eventsRes.error) {
    return NextResponse.json({ error: eventsRes.error.message }, { status: 500 });
  }
  if (auditRes.error) {
    return NextResponse.json({ error: auditRes.error.message }, { status: 500 });
  }
  if (usersRes.error) {
    return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    events: eventsRes.data ?? [],
    audit: auditRes.data ?? [],
    users: usersRes.data ?? [],
  });
}
