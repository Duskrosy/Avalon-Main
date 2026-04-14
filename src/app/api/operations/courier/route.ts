import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

// GET /api/operations/courier
// Default:              Dispatches with tracking_number, joined with ops_orders + latest courier_event
// ?events=true&dispatch_id=xxx  All courier_events for a specific dispatch
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const wantEvents = searchParams.get("events") === "true";
  const dispatchId = searchParams.get("dispatch_id");

  const admin = createAdminClient();

  // Mode 2: fetch all events for a specific dispatch
  if (wantEvents && dispatchId) {
    const { data, error } = await admin
      .from("courier_events")
      .select("*")
      .eq("dispatch_id", dispatchId)
      .order("event_time", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Mode 1 (default): dispatches with tracking numbers + latest event
  // Step 1 — fetch dispatches that have a tracking_number
  const { data: dispatches, error: dErr } = await admin
    .from("dispatch_queue")
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name, total_price)
    `)
    .not("tracking_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  if (!dispatches || dispatches.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Step 2 — for each dispatch, get the latest courier_event
  const dispatchIds = dispatches.map((d) => d.id);

  const { data: allEvents, error: eErr } = await admin
    .from("courier_events")
    .select("*")
    .in("dispatch_id", dispatchIds)
    .order("event_time", { ascending: false });

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  // Build a map: dispatch_id -> latest event
  const latestEventMap: Record<string, typeof allEvents extends (infer T)[] ? T : never> = {};
  for (const ev of allEvents ?? []) {
    if (!latestEventMap[ev.dispatch_id]) {
      latestEventMap[ev.dispatch_id] = ev;
    }
  }

  // Merge latest event onto each dispatch
  const result = dispatches.map((d) => ({
    ...d,
    latest_event: latestEventMap[d.id] ?? null,
  }));

  return NextResponse.json({ data: result });
}

// POST /api/operations/courier — add a new courier_event
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { dispatch_id, event_type, event_time, location, courier_name, external_ref, notes } = body;

  if (!dispatch_id) {
    return NextResponse.json({ error: "dispatch_id is required" }, { status: 400 });
  }
  if (!event_type) {
    return NextResponse.json({ error: "event_type is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: event, error } = await admin
    .from("courier_events")
    .insert({
      dispatch_id,
      event_type,
      event_time: event_time || new Date().toISOString(),
      location: location || null,
      courier_name: courier_name || null,
      external_ref: external_ref || null,
      notes: notes || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: event }, { status: 201 });
}
