import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

// GET /api/obs/item-timeline?table=inventory_records&id=xxx&limit=100
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isOps(currentUser) && !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tableName = searchParams.get("table");
  const recordId = searchParams.get("id");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100") || 100, 500);

  if (!tableName || !recordId) {
    return NextResponse.json({ error: "table and id are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Audit log entries for this record
  const { data: auditEntries, error: auditErr } = await admin
    .from("obs_audit_logs")
    .select("id, actor_id, action, table_name, record_id, old_values, new_values, created_at")
    .eq("table_name", tableName)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (auditErr) {
    return NextResponse.json({ error: auditErr.message }, { status: 500 });
  }

  // 2. If this is an inventory item, also fetch movements
  let movements: any[] = [];
  if (tableName === "inventory_records") {
    const { data: invRecord } = await admin
      .from("inventory_records")
      .select("catalog_item_id")
      .eq("id", recordId)
      .maybeSingle();

    if (invRecord?.catalog_item_id) {
      const { data: movData } = await admin
        .from("inventory_movements")
        .select("id, catalog_item_id, adjustment_type, quantity, notes, performed_by, created_at")
        .eq("catalog_item_id", invRecord.catalog_item_id)
        .order("created_at", { ascending: false })
        .limit(limit);
      movements = movData ?? [];
    }
  }

  // 3. Resolve actor profiles
  const actorIds = new Set<string>();
  (auditEntries ?? []).forEach((e) => { if (e.actor_id) actorIds.add(e.actor_id); });
  movements.forEach((m) => { if (m.performed_by) actorIds.add(m.performed_by); });

  let actors: any[] = [];
  if (actorIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", Array.from(actorIds));
    actors = profiles ?? [];
  }

  return NextResponse.json({
    audit: auditEntries ?? [],
    movements,
    actors,
  });
}
