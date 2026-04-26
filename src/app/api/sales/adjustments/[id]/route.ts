import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";

type RouteContext = { params: Promise<{ id: string }> };

const STATUSES = ["open", "in_progress", "resolved", "cancelled"] as const;

const schema = z.object({
  status: z.enum(STATUSES).optional(),
  assigned_to_user_id: z.string().uuid().nullable().optional(),
  assigned_to_label: z.string().max(120).nullable().optional(),
  resolution_notes: z.string().max(2000).nullable().optional(),
});

// ─── PATCH /api/sales/adjustments/[id] ──────────────────────────────────────
//
// Update an adjustment ticket. Common ops:
//   • Claim:           { status: "in_progress", assigned_to_user_id: <me> }
//   • Resolve:         { status: "resolved",    resolution_notes: "..." }
//   • Cancel:          { status: "cancelled" }
//   • Reassign:        { assigned_to_user_id|label: ... }

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const { data: body, error: validationError } = validateBody(schema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from("order_adjustments")
    .select("id, status, adjustment_type")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // bundle_split_pricing rows are immutable audit records.
  if (existing.adjustment_type === "bundle_split_pricing") {
    return NextResponse.json(
      { error: "Bundle split adjustments are audit records and cannot be edited." },
      { status: 409 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.assigned_to_user_id !== undefined)
    patch.assigned_to_user_id = body.assigned_to_user_id;
  if (body.assigned_to_label !== undefined)
    patch.assigned_to_label = body.assigned_to_label;
  if (body.resolution_notes !== undefined)
    patch.resolution_notes = body.resolution_notes;

  // Resolve transition: stamp resolver + timestamp.
  if (body.status === "resolved" && existing.status !== "resolved") {
    patch.resolved_by_user_id = currentUser.id;
    patch.resolved_at = new Date().toISOString();
  }
  // Un-resolve (resolved → in_progress/open): clear stamps.
  if (
    existing.status === "resolved" &&
    body.status !== undefined &&
    body.status !== "resolved"
  ) {
    patch.resolved_by_user_id = null;
    patch.resolved_at = null;
    patch.resolution_notes = null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (admin as any)
    .from("order_adjustments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ adjustment: updated });
}
