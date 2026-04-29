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
      assignee:profiles!assignee_id(id, first_name, last_name),
      assignees:ad_request_assignees(
        assignee:profiles!assignee_id(id, first_name, last_name, avatar_url)
      ),
      kanban_card:kanban_cards!linked_card_id(id, col:kanban_columns!column_id(name))
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten junction rows into assignees: Profile[]
  type AssigneeJoin = { assignee: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null };
  const rows = (data ?? []).map((r: Record<string, unknown> & { assignees?: AssigneeJoin[] }) => ({
    ...r,
    assignees: (r.assignees ?? [])
      .map((a) => a.assignee)
      .filter((p): p is NonNullable<AssigneeJoin["assignee"]> => p != null),
  }));

  return NextResponse.json(rows);
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
  const assigneeIds = body.assignee_ids ?? (body.assignee_id ? [body.assignee_id] : []);
  const leadAssignee = body.assignee_id ?? assigneeIds[0] ?? null;

  const { data, error } = await admin
    .from("ad_requests")
    .insert({
      title: body.title,
      brief: body.brief ?? null,
      requester_id: currentUser.id,
      assignee_id: leadAssignee,
      status: "submitted",
      target_date: body.target_date ?? null,
      notes: body.notes ?? null,
      inspo_link: body.inspo_link ?? null,
      additional_notes: body.additional_notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (assigneeIds.length > 0) {
    await admin.from("ad_request_assignees").insert(
      assigneeIds.map((assignee_id) => ({ ad_request_id: data.id, assignee_id })),
    );
  }

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

  // Authorization: manager+/creatives can do anything; requester can only edit
  // their own request while it's still in {submitted, review}, and never change
  // status/deny_reason/assignee_ids.
  const { data: existing } = await supabase
    .from("ad_requests")
    .select("requester_id, status")
    .eq("id", id)
    .single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isCreatives = currentUser.department?.slug === "creatives";
  const canManage = isManagerOrAbove(currentUser) || isCreatives;
  const isRequester = existing.requester_id === currentUser.id;

  if (!canManage) {
    if (!isRequester) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!REQUESTER_EDITABLE_STATUSES.has(existing.status)) {
      return NextResponse.json({ error: "Cannot edit a request in this state" }, { status: 403 });
    }
    if (body.status !== undefined || body.deny_reason !== undefined || body.assignee_ids !== undefined) {
      return NextResponse.json({ error: "Cannot change workflow fields as requester" }, { status: 403 });
    }
  }

  // Peel assignee_ids off — it doesn't exist on ad_requests; we sync the junction separately.
  const { assignee_ids, ...patch } = body;

  // Keep ad_requests.assignee_id as a "lead" hint: first id in assignee_ids wins if provided.
  if (assignee_ids !== undefined) {
    patch.assignee_id = assignee_ids[0] ?? null;
  }

  const { data, error } = await supabase
    .from("ad_requests")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync junction table if assignee_ids was provided.
  if (assignee_ids !== undefined) {
    const admin = createAdminClient();
    await admin.from("ad_request_assignees").delete().eq("ad_request_id", id);
    if (assignee_ids.length > 0) {
      await admin.from("ad_request_assignees").insert(
        assignee_ids.map((assignee_id) => ({ ad_request_id: id, assignee_id })),
      );
    }
  }

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

const REQUESTER_EDITABLE_STATUSES = new Set(["submitted", "review"]);

// DELETE /api/ad-ops/requests?id=...
// Allowed: manager+ always; requester on their own request when status is
// not yet in fulfillment (draft, submitted, cancelled, rejected).
const REQUESTER_DELETABLE_STATUSES = new Set(["submitted", "review"]);

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();

  if (!isManagerOrAbove(currentUser)) {
    const { data: existing } = await admin
      .from("ad_requests")
      .select("requester_id, status")
      .eq("id", id)
      .maybeSingle();
    if (!existing || existing.requester_id !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!REQUESTER_DELETABLE_STATUSES.has(existing.status)) {
      return NextResponse.json({ error: "Cannot delete a request that is already in progress" }, { status: 403 });
    }
  }

  const { error } = await admin.from("ad_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
