import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { trackEventServer } from "@/lib/observability/track";
import { validateBody } from "@/lib/api/validate";
import { adRequestPostSchema, adRequestPatchSchema } from "@/lib/api/schemas";

// GET /api/ad-ops/requests?status=&limit=100
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") ?? "100");

  const admin = createAdminClient();
  let query = admin
    .from("ad_requests")
    .select(`
      *,
      requester:profiles!requester_id(id, first_name, last_name),
      assignee:profiles!assignee_id(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/ad-ops/requests
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(adRequestPostSchema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_requests")
    .insert({
      title: body.title,
      brief: body.brief ?? null,
      requester_id: currentUser.id,
      assignee_id: body.assignee_id ?? null,
      status: "submitted",
      target_date: body.target_date ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  trackEventServer(supabase, currentUser.id, "ad.request.created", {
    module: "ad-ops",
    properties: { request_id: data.id },
  });

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/ad-ops/requests?id=...
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(adRequestPatchSchema, raw);
  if (validationError) return validationError;

  const { data, error } = await supabase
    .from("ad_requests")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create kanban card when request is accepted
  if (data && body.status === "in_progress" && !data.linked_card_id) {
    try {
      const admin = createAdminClient();
      const { data: creativesDept } = await admin
        .from("departments").select("id").eq("slug", "creatives").single();

      if (creativesDept) {
        const { data: board } = await admin
          .from("kanban_boards")
          .select("id, kanban_columns(id, sort_order)")
          .eq("department_id", creativesDept.id)
          .eq("scope", "team")
          .limit(1)
          .single();

        if (board?.kanban_columns?.length) {
          const firstCol = [...(board.kanban_columns as any[])].sort((a, b) => a.sort_order - b.sort_order)[0];
          const { data: card } = await admin
            .from("kanban_cards")
            .insert({
              column_id: firstCol.id,
              title: `[Request] ${data.title}`,
              created_by: currentUser.id,
            })
            .select("id")
            .single();

          if (card) {
            await admin.from("ad_requests")
              .update({ linked_card_id: card.id })
              .eq("id", id);
          }
        }
      }
    } catch {
      // Kanban linking is best-effort
    }
  }

  return NextResponse.json(data);
}

// DELETE /api/ad-ops/requests?id=... — manager+ only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("ad_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
