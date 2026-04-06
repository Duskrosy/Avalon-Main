import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── Auth guard ───────────────────────────────────────────────────────────────
// is_ad_ops_access = OPS or department in [creatives, marketing, ad-ops]

async function guard() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user)
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null,
      user: null,
    };

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

// ─── GET ──────────────────────────────────────────────────────────────────────
// GET /api/smm/competitors
//   → returns all competitors with accounts + latest snapshot per account
// GET /api/smm/competitors?type=snapshots&account_id=...
//   → returns last 30 snapshots for that account

export async function GET(req: NextRequest) {
  const { error, supabase } = await guard();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const accountId = searchParams.get("account_id");

  // ── Snapshot history for a single account ──
  if (type === "snapshots") {
    if (!accountId)
      return NextResponse.json({ error: "account_id required" }, { status: 400 });

    const { data, error: dbErr } = await supabase!
      .from("smm_competitor_snapshots")
      .select(
        "id, snapshot_date, follower_count, post_count, avg_engagement_rate, posting_frequency_week, notes, data_source, created_at"
      )
      .eq("account_id", accountId)
      .order("snapshot_date", { ascending: false })
      .limit(30);

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  // ── Full competitor list with accounts ──
  const { data: competitors, error: compErr } = await supabase!
    .from("smm_competitors")
    .select(
      `id, name, notes, created_at,
       smm_competitor_accounts(id, competitor_id, platform, handle, external_id, is_active, last_scraped_at)`
    )
    .order("created_at", { ascending: true });

  if (compErr) return NextResponse.json({ error: compErr.message }, { status: 500 });
  if (!competitors || competitors.length === 0) return NextResponse.json([]);

  // Collect all account IDs
  const allAccountIds: string[] = [];
  for (const comp of competitors) {
    const accounts = comp.smm_competitor_accounts as Array<{ id: string }>;
    for (const acc of accounts ?? []) {
      allAccountIds.push(acc.id);
    }
  }

  // Fetch latest snapshot for every account in one query (ordered by date desc)
  const latestByAccount: Record<
    string,
    {
      follower_count: number | null;
      post_count: number | null;
      avg_engagement_rate: number | null;
      posting_frequency_week: number | null;
      snapshot_date: string;
      notes: string | null;
      data_source: string;
    }
  > = {};

  if (allAccountIds.length > 0) {
    const { data: snapshots } = await supabase!
      .from("smm_competitor_snapshots")
      .select(
        "account_id, snapshot_date, follower_count, post_count, avg_engagement_rate, posting_frequency_week, notes, data_source"
      )
      .in("account_id", allAccountIds)
      .order("snapshot_date", { ascending: false });

    // Keep only the first (latest) snapshot per account
    for (const snap of snapshots ?? []) {
      const s = snap as typeof snap & { account_id: string };
      if (!latestByAccount[s.account_id]) {
        latestByAccount[s.account_id] = {
          follower_count: s.follower_count,
          post_count: s.post_count,
          avg_engagement_rate: s.avg_engagement_rate,
          posting_frequency_week: s.posting_frequency_week,
          snapshot_date: s.snapshot_date,
          notes: s.notes,
          data_source: s.data_source,
        };
      }
    }
  }

  // Merge
  const result = competitors.map((comp) => {
    const accounts = (comp.smm_competitor_accounts as Array<{
      id: string;
      competitor_id: string;
      platform: string;
      handle: string | null;
      external_id: string | null;
      is_active: boolean;
      last_scraped_at: string | null;
    }>).map((acc) => ({
      ...acc,
      latest_snapshot: latestByAccount[acc.id] ?? null,
    }));

    return {
      id: comp.id,
      name: comp.name,
      notes: comp.notes,
      created_at: comp.created_at,
      accounts,
    };
  });

  return NextResponse.json(result);
}

// ─── POST — create competitor ─────────────────────────────────────────────────
// Body: { name, notes? }

export async function POST(req: NextRequest) {
  const { error, supabase, user } = await guard();
  if (error) return error;

  const body = await req.json();
  const { name, notes } = body;

  if (!name?.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error: dbErr } = await supabase!
    .from("smm_competitors")
    .insert({
      name: name.trim(),
      notes: notes?.trim() || null,
      created_by: user!.id,
    })
    .select("id, name, notes, created_at")
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// ─── PATCH — update competitor / account / upsert snapshot ───────────────────
// Body: { type: "competitor"|"account"|"snapshot", id?, ...fields }

export async function PATCH(req: NextRequest) {
  const { error, supabase } = await guard();
  if (error) return error;

  const body = await req.json();
  const { type, ...rest } = body;

  // ── Competitor update ──
  if (type === "competitor") {
    const { id, name, notes } = rest;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name?.trim() || null;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const { data, error: dbErr } = await supabase!
      .from("smm_competitors")
      .update(updates)
      .eq("id", id)
      .select("id, name, notes, created_at")
      .single();

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // ── Account upsert ──
  if (type === "account") {
    const { id, competitor_id, platform, handle, external_id, is_active } = rest;

    // If no id, insert new account
    if (!id) {
      if (!competitor_id || !platform)
        return NextResponse.json({ error: "competitor_id and platform required" }, { status: 400 });

      const { data, error: dbErr } = await supabase!
        .from("smm_competitor_accounts")
        .upsert(
          {
            competitor_id,
            platform,
            handle: handle?.trim() || null,
            external_id: external_id?.trim() || null,
            is_active: is_active ?? true,
          },
          { onConflict: "competitor_id,platform" }
        )
        .select("id, competitor_id, platform, handle, external_id, is_active, last_scraped_at")
        .single();

      if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
      return NextResponse.json(data, { status: 201 });
    }

    // Update existing account
    const updates: Record<string, unknown> = {};
    if (handle !== undefined)      updates.handle      = handle?.trim() || null;
    if (external_id !== undefined) updates.external_id = external_id?.trim() || null;
    if (is_active !== undefined)   updates.is_active   = is_active;

    const { data, error: dbErr } = await supabase!
      .from("smm_competitor_accounts")
      .update(updates)
      .eq("id", id)
      .select("id, competitor_id, platform, handle, external_id, is_active, last_scraped_at")
      .single();

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // ── Snapshot upsert ──
  if (type === "snapshot") {
    const {
      account_id,
      snapshot_date,
      follower_count,
      post_count,
      avg_engagement_rate,
      posting_frequency_week,
      notes,
    } = rest;

    if (!account_id)
      return NextResponse.json({ error: "account_id required" }, { status: 400 });

    const date = snapshot_date ?? new Date().toISOString().split("T")[0];

    const { data, error: dbErr } = await supabase!
      .from("smm_competitor_snapshots")
      .upsert(
        {
          account_id,
          snapshot_date: date,
          follower_count:          follower_count          != null ? Number(follower_count)          : null,
          post_count:              post_count              != null ? Number(post_count)              : null,
          avg_engagement_rate:     avg_engagement_rate     != null ? Number(avg_engagement_rate)     : null,
          posting_frequency_week:  posting_frequency_week  != null ? Number(posting_frequency_week)  : null,
          notes:                   notes?.trim() || null,
          data_source: "manual",
        },
        { onConflict: "account_id,snapshot_date" }
      )
      .select(
        "id, account_id, snapshot_date, follower_count, post_count, avg_engagement_rate, posting_frequency_week, notes, data_source"
      )
      .single();

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

// ─── DELETE — delete competitor or account (is_ops required) ─────────────────
// Body: { type: "competitor"|"account", id }

export async function DELETE(req: NextRequest) {
  const { error, supabase, user } = await guard();
  if (error) return error;

  if (!isOps(user!))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { type, id } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (type === "competitor") {
    const { error: dbErr } = await supabase!
      .from("smm_competitors")
      .delete()
      .eq("id", id);

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (type === "account") {
    const { error: dbErr } = await supabase!
      .from("smm_competitor_accounts")
      .delete()
      .eq("id", id);

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
