// src/app/api/customer-service/orders/[id]/notes/route.ts
//
// POST /api/customer-service/orders/[id]/notes
//
// Appends a CS team note to the shared notes feed for an order.
// Notes are append-only (no UPDATE/DELETE). The existing orders.notes column
// is the immutable sales-agent note set at order-confirm time; this endpoint
// writes to the separate cs_order_notes feed table (migration 00103).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  // 1. Auth — use user-scoped client for getCurrentUser, admin for writes.
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate id
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  // 3. Parse and validate body
  const raw = await req.json().catch(() => null);
  const bodyText = typeof raw?.body === "string" ? raw.body.trim() : "";
  if (!bodyText) {
    return NextResponse.json({ error: "Note body cannot be empty" }, { status: 400 });
  }

  // 4. Compose author name from profile fields (full_name is a DB view column,
  //    not present on ProfileWithRelations — build from first_name + last_name).
  const authorName =
    `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
    user.email ||
    "Unknown";

  // 5. INSERT the note using admin client (consistent with the established
  //    pattern; RLS is defense-in-depth for direct DB connections).
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: note, error } = await (admin as any)
    .from("cs_order_notes")
    .insert({
      order_id: id,
      author_user_id: user.id,
      author_name_snapshot: authorName,
      body: bodyText,
    })
    .select("id, author_name_snapshot, body, created_at")
    .single();

  if (error || !note) {
    console.error("[cs-notes] insert failed", {
      code: error?.code,
      message: error?.message,
      hint: error?.hint,
      details: error?.details,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // 6. Return the new row
  return NextResponse.json({
    note: {
      id: note.id,
      author_name_snapshot: note.author_name_snapshot,
      body: note.body,
      created_at: note.created_at,
    },
  });
}
