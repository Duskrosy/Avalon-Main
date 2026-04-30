import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { signedReceiptUploadUrl } from "@/lib/storage/order-receipts";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  filename: z.string().min(1).max(200),
});

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ext = parsed.data.filename.split(".").pop() ?? "bin";

  const result = await signedReceiptUploadUrl(id, ext);
  if (!result) return NextResponse.json({ error: "Could not sign upload" }, { status: 500 });
  return NextResponse.json(result);
}
