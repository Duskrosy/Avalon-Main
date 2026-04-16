import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { resolveToken, updateAdStatus } from "@/lib/meta/client";
import { z } from "zod";

async function guard(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null, supabase: null };
  if (!isManagerOrAbove(user)) return { error: NextResponse.json({ error: "Managers or above only" }, { status: 403 }), user: null, supabase: null };
  return { error: null, user, supabase };
  void req;
}

// POST — toggle individual ad status
const toggleSchema = z.object({
  ad_id: z.string().min(1),
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

  const { ad_id, action } = parsed.data;
  const admin = createAdminClient();

  // Find account via meta_ad_stats
  const { data: stat } = await admin
    .from("meta_ad_stats")
    .select("meta_account_id")
    .eq("ad_id", ad_id)
    .limit(1)
    .single();
  if (!stat?.meta_account_id) return NextResponse.json({ error: "Ad not found in stats" }, { status: 404 });

  const { data: acct } = await admin
    .from("ad_meta_accounts")
    .select("account_id, meta_access_token")
    .eq("id", stat.meta_account_id)
    .single();

  const token = resolveToken(acct ?? {});
  if (!token) return NextResponse.json({ error: "No access token" }, { status: 400 });

  await updateAdStatus(ad_id, token, action === "pause" ? "PAUSED" : "ACTIVE");
  return NextResponse.json({ ok: true });
}
