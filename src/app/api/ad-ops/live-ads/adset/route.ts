import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { resolveToken, updateAdsetStatus } from "@/lib/meta/client";
import { z } from "zod";

async function guard(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null, supabase: null };
  if (!isManagerOrAbove(user)) return { error: NextResponse.json({ error: "Managers or above only" }, { status: 403 }), user: null, supabase: null };
  return { error: null, user, supabase };
  void req;
}

async function getAccountInfo(adsetId: string) {
  const admin = createAdminClient();
  const { data: stat } = await admin
    .from("meta_ad_stats")
    .select("meta_account_id, campaign_id, adset_name")
    .eq("adset_id", adsetId)
    .limit(1)
    .single();
  if (!stat?.meta_account_id) return null;

  const { data: acct } = await admin
    .from("ad_meta_accounts")
    .select("id, account_id, meta_access_token")
    .eq("id", stat.meta_account_id)
    .single();

  return acct ? { acct, stat } : null;
}

// POST — toggle adset status (pause / resume)
const toggleSchema = z.object({
  adset_id: z.string().min(1),
  action: z.enum(["pause", "resume"]),
});

export async function POST(req: NextRequest) {
  const { error, user, supabase } = await guard(req);
  if (error) return error;

  if (!isOps(user!)) {
    const { data: dept } = await supabase!
      .from("departments")
      .select("slug")
      .eq("id", user!.department_id)
      .maybeSingle();
    if (!["ad-ops", "marketing"].includes(dept?.slug ?? "")) {
      return NextResponse.json({ error: "Only ad-ops and marketing can modify live ads" }, { status: 403 });
    }
  }

  const parsed = toggleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { adset_id, action } = parsed.data;
  const info = await getAccountInfo(adset_id);
  if (!info) return NextResponse.json({ error: "Adset not found in stats" }, { status: 404 });

  const token = resolveToken(info.acct);
  if (!token) return NextResponse.json({ error: "No access token" }, { status: 400 });

  await updateAdsetStatus(adset_id, token, action === "pause" ? "PAUSED" : "ACTIVE");

  // If resuming, clear any auto_paused_at on the cap record
  if (action === "resume") {
    const admin = createAdminClient();
    await admin.from("meta_adset_caps")
      .update({ auto_paused_at: null, auto_paused_reason: null })
      .eq("adset_id", adset_id);
  }

  return NextResponse.json({ ok: true });
}

// PATCH — set or clear adset spend cap (stored in our DB, not Meta's budget)
const capSchema = z.object({
  adset_id: z.string().min(1),
  spend_cap: z.number().positive().nullable(),
  spend_cap_period: z.enum(["lifetime", "monthly", "daily"]).default("lifetime"),
});

export async function PATCH(req: NextRequest) {
  const { error, user, supabase } = await guard(req);
  if (error) return error;

  if (!isOps(user!)) {
    const { data: dept } = await supabase!
      .from("departments")
      .select("slug")
      .eq("id", user!.department_id)
      .maybeSingle();
    if (!["ad-ops", "marketing"].includes(dept?.slug ?? "")) {
      return NextResponse.json({ error: "Only ad-ops and marketing can modify live ads" }, { status: 403 });
    }
  }

  const parsed = capSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { adset_id, spend_cap, spend_cap_period } = parsed.data;
  const admin = createAdminClient();

  if (spend_cap === null) {
    // Clear cap
    await admin.from("meta_adset_caps").delete().eq("adset_id", adset_id);
    return NextResponse.json({ ok: true });
  }

  // Upsert cap — look up account/campaign context for future enforce-caps use
  const info = await getAccountInfo(adset_id);

  await admin.from("meta_adset_caps").upsert({
    adset_id,
    spend_cap,
    spend_cap_period,
    meta_account_id: info?.acct.id ?? null,
    campaign_id: info?.stat.campaign_id ?? null,
    adset_name: info?.stat.adset_name ?? null,
  }, { onConflict: "adset_id" });

  return NextResponse.json({ ok: true });
}
