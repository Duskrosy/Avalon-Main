import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { resolveToken, updateAdsetStatus, setAdsetDailyBudget } from "@/lib/meta/client";
import { z } from "zod";

async function guard(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null };
  if (!isManagerOrAbove(user)) return { error: NextResponse.json({ error: "Managers or above only" }, { status: 403 }), user: null };
  return { error: null, user };
  void req;
}

async function getToken(adsetId: string) {
  const admin = createAdminClient();
  // Find any stat row for this adset to get the account
  const { data: stat } = await admin
    .from("meta_ad_stats")
    .select("meta_account_id")
    .eq("adset_id", adsetId)
    .limit(1)
    .single();
  if (!stat?.meta_account_id) return null;

  const { data: acct } = await admin
    .from("ad_meta_accounts")
    .select("account_id, meta_access_token")
    .eq("id", stat.meta_account_id)
    .single();
  return acct ? resolveToken(acct) : null;
}

// POST — toggle adset status
const toggleSchema = z.object({
  adset_id: z.string().min(1),
  action: z.enum(["pause", "resume"]),
});

export async function POST(req: NextRequest) {
  const { error } = await guard(req);
  if (error) return error;

  const parsed = toggleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { adset_id, action } = parsed.data;
  const token = await getToken(adset_id);
  if (!token) return NextResponse.json({ error: "No access token for this adset" }, { status: 400 });

  await updateAdsetStatus(adset_id, token, action === "pause" ? "PAUSED" : "ACTIVE");
  return NextResponse.json({ ok: true });
}

// PATCH — set adset daily budget
const budgetSchema = z.object({
  adset_id: z.string().min(1),
  daily_budget: z.number().positive(),
});

export async function PATCH(req: NextRequest) {
  const { error } = await guard(req);
  if (error) return error;

  const parsed = budgetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { adset_id, daily_budget } = parsed.data;
  const token = await getToken(adset_id);
  if (!token) return NextResponse.json({ error: "No access token for this adset" }, { status: 400 });

  await setAdsetDailyBudget(adset_id, token, daily_budget);
  return NextResponse.json({ ok: true });
}
