import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const admin = createAdminClient();

  // Fetch non-recurring events in range
  const { data: oneTime } = await admin
    .from("calendar_events")
    .select("*")
    .eq("is_recurring", false)
    .gte("event_date", from)
    .lte("event_date", to);

  // Fetch all recurring events and expand into the requested range
  const { data: recurring } = await admin
    .from("calendar_events")
    .select("*")
    .eq("is_recurring", true);

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const expanded = (recurring ?? []).flatMap((evt) => {
    if (evt.recurrence_rule !== "yearly") return [];
    const results = [];
    const origMonth = new Date(evt.event_date).getMonth();
    const origDay = new Date(evt.event_date).getDate();

    for (let year = fromDate.getFullYear(); year <= toDate.getFullYear(); year++) {
      const d = new Date(year, origMonth, origDay);
      const ds = d.toISOString().slice(0, 10);
      if (ds >= from && ds <= to) {
        results.push({ ...evt, event_date: ds, _expanded: true });
      }
    }
    return results;
  });

  const all = [...(oneTime ?? []), ...expanded].sort(
    (a, b) => a.event_date.localeCompare(b.event_date)
  );

  return NextResponse.json(all);
}

// POST /api/calendar/events
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_events")
    .insert({
      title: body.title,
      event_date: body.event_date,
      end_date: body.end_date ?? null,
      event_type: body.event_type ?? "custom",
      is_recurring: body.is_recurring ?? false,
      recurrence_rule: body.recurrence_rule ?? null,
      description: body.description ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/calendar/events?id=...
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_events")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/calendar/events?id=...
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("calendar_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
