import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createCampaignSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  campaign_name: z.string().min(1).max(300),
  organic_target: z.number().int().min(0).optional(),
  ads_target: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateCampaignSchema = z.object({
  id: z.string().uuid(),
  campaign_name: z.string().min(1).max(300).optional(),
  organic_target: z.number().int().min(0).optional(),
  ads_target: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function currentWeekMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Read access: creatives / marketing / ad-ops / OPS (matches is_ad_ops_access)

async function guardRead() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null,
      user: null,
    };
  }

  const ops = isOps(user);
  if (!ops && user.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", user.department_id)
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) {
      return {
        error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        supabase: null,
        user: null,
      };
    }
  }

  return { error: null, supabase, user };
}

// ─── GET /api/creatives/campaigns?week_start=YYYY-MM-DD ───────────────────────
// Returns the campaign for the given week (defaults to current week's Monday).
// Returns null if none exists.

export async function GET(req: NextRequest) {
  const { error, supabase } = await guardRead();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("week_start") ?? currentWeekMonday();

  const { data, error: dbErr } = await createAdminClient()
    .from("creatives_campaigns")
    .select(
      "id, week_start, campaign_name, organic_target, ads_target, notes, created_by, created_at, updated_at"
    )
    .eq("week_start", weekStart)
    .maybeSingle();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}

// ─── POST /api/creatives/campaigns ────────────────────────────────────────────
// Body: { week_start, campaign_name, organic_target, ads_target, notes? }
// Creates a new campaign for the week. Managers+ only.

export async function POST(req: NextRequest) {
  const { error, supabase, user } = await guardRead();
  if (error) return error;

  if (!isManagerOrAbove(user!)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = createCampaignSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { week_start, campaign_name, organic_target, ads_target, notes } = parsed.data;

  const { data, error: dbErr } = await createAdminClient()
    .from("creatives_campaigns")
    .insert({
      week_start,
      campaign_name: campaign_name.trim(),
      organic_target: organic_target ?? 25,
      ads_target: ads_target ?? 10,
      notes: notes?.trim() || null,
      created_by: user!.id,
    })
    .select(
      "id, week_start, campaign_name, organic_target, ads_target, notes, created_by, created_at, updated_at"
    )
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// ─── PATCH /api/creatives/campaigns ───────────────────────────────────────────
// Body: { id, campaign_name?, organic_target?, ads_target?, notes? }
// Updates an existing campaign. Managers+ only.

export async function PATCH(req: NextRequest) {
  const { error, supabase, user } = await guardRead();
  if (error) return error;

  if (!isManagerOrAbove(user!)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = updateCampaignSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id, campaign_name, organic_target, ads_target, notes } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (campaign_name !== undefined) updates.campaign_name = campaign_name.trim();
  if (organic_target !== undefined) updates.organic_target = organic_target;
  if (ads_target !== undefined) updates.ads_target = ads_target;
  if (notes !== undefined) updates.notes = notes?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error: dbErr } = await createAdminClient()
    .from("creatives_campaigns")
    .update(updates)
    .eq("id", id)
    .select(
      "id, week_start, campaign_name, organic_target, ads_target, notes, created_by, created_at, updated_at"
    )
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}
