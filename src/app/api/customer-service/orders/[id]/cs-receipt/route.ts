// src/app/api/customer-service/orders/[id]/cs-receipt/route.ts
//
// CS-side receipt attachment for an order. Lives alongside the original
// sales-uploaded receipt — distinct DB column (orders.cs_payment_receipt_path)
// + distinct storage path prefix ("cs-receipt-..."). Same bucket as sales.
//
// GET   → returns a 5-min signed URL for the current cs_payment_receipt_path
//          (or { url: null } if not set).
// POST  → returns a signed UPLOAD URL the client PUTs the file to.
//          Body: { filename: string }. Returns { signedUrl, path }.
// PATCH → commits a path to orders.cs_payment_receipt_path after upload.
//          Body: { path: string }.
//
// Auth: any authenticated user (matches the existing CS endpoints' pattern).
// The order itself must exist for any of these to succeed.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import {
  signedCsReceiptUploadUrl,
  signedReceiptUrl,
} from "@/lib/storage/order-receipts";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const FILENAME_RE = /\.([a-z0-9]+)$/i;

// Storage path we hand out the client must always be one we minted, never
// arbitrary input — guard against path traversal via this prefix check.
function isOurCsPath(orderId: string, path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith(`orders/${orderId}/cs-receipt-`) &&
    !path.includes("..")
  );
}

// ── GET — display URL for the currently-stored CS receipt ───────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (admin as any)
    .from("orders")
    .select("cs_payment_receipt_path")
    .eq("id", id)
    .maybeSingle();

  if (!order?.cs_payment_receipt_path) {
    return NextResponse.json({ url: null }, { status: 404 });
  }
  const url = await signedReceiptUrl(order.cs_payment_receipt_path);
  return NextResponse.json({ url });
}

// ── POST — request a signed UPLOAD URL ──────────────────────────────────────

const uploadBodySchema = z.object({ filename: z.string().min(1) });

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = uploadBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  // Existence + access check: order must exist. RLS isn't enforced for the
  // service-role client, but we still validate to avoid signing an upload
  // for a fictitious order id.
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (admin as any)
    .from("orders").select("id").eq("id", id).maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const ext = (parsed.data.filename.match(FILENAME_RE)?.[1] ?? "bin").toLowerCase();
  const result = await signedCsReceiptUploadUrl(id, ext);
  if (!result) {
    console.error("[cs-receipt] sign upload URL failed", { orderId: id });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  return NextResponse.json({ signedUrl: result.signedUrl, path: result.path });
}

// ── PATCH — commit the path to orders.cs_payment_receipt_path ───────────────

const commitBodySchema = z.object({ path: z.string().min(1) });

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = commitBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  if (!isOurCsPath(id, parsed.data.path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (admin as any)
    .from("orders")
    .update({ cs_payment_receipt_path: parsed.data.path })
    .eq("id", id)
    .select("id, cs_payment_receipt_path")
    .single();

  if (error || !updated) {
    console.error("[cs-receipt] commit failed", { code: error?.code, message: error?.message, hint: error?.hint, details: error?.details });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, path: updated.cs_payment_receipt_path });
}
