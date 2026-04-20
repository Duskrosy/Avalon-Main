import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchFeed, parseFeed, type FeedType } from "@/lib/smm/rss-parser";

const CATEGORY = z.enum(["shoes", "height", "viral_ph", "general"]);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
  category: CATEGORY.optional().default("general"),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  url: z.string().url().max(2000).optional(),
  category: CATEGORY.optional(),
  is_active: z.boolean().optional(),
}).refine(
  (v) =>
    v.name !== undefined ||
    v.url !== undefined ||
    v.category !== undefined ||
    v.is_active !== undefined,
  { message: "At least one field (name/url/category/is_active) is required" },
);

const deleteSchema = z.object({
  id: z.string().uuid(),
});

async function guardRead() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user)
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };

  const ops = isOps(user);
  if (!ops && user.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", user.department_id)
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), supabase: null };
    }
  }

  return { error: null, supabase };
}

async function guardOps() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user))
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };
  return { error: null, supabase };
}

async function testUrl(url: string): Promise<{ ok: true; feed_type: FeedType } | { ok: false; error: string }> {
  try {
    const xml = await fetchFeed(url, 5000);
    const feed = parseFeed(xml);
    if (feed.feed_type === "unknown" || feed.items.length === 0) {
      return { ok: false, error: "No RSS or Atom items found at this URL." };
    }
    return { ok: true, feed_type: feed.feed_type };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

// GET /api/smm/news/sources — list sources with health
export async function GET() {
  const { error } = await guardRead();
  if (error) return error;

  const { data, error: dbErr } = await createAdminClient()
    .from("smm_news_sources")
    .select(
      "id, name, url, category, is_active, created_at, feed_type, last_fetched_at, last_fetch_status, last_fetch_error, last_item_count",
    )
    .order("created_at", { ascending: true });

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/smm/news/sources — add source (re-tests before insert)
export async function POST(req: NextRequest) {
  const { error } = await guardOps();
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { name, url, category } = parsed.data;

  const test = await testUrl(url.trim());
  if (!test.ok) {
    return NextResponse.json({ error: `Feed test failed: ${test.error}` }, { status: 400 });
  }

  const { data, error: dbErr } = await createAdminClient()
    .from("smm_news_sources")
    .insert({
      name: name.trim(),
      url: url.trim(),
      category,
      feed_type: test.feed_type,
      last_fetch_status: "never",
    })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/smm/news/sources — edit source (name/url/category/is_active)
export async function PATCH(req: NextRequest) {
  const { error } = await guardOps();
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, name, url, category, is_active } = parsed.data;

  const admin = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name.trim();
  if (category !== undefined) patch.category = category;
  if (is_active !== undefined) patch.is_active = is_active;

  if (url !== undefined) {
    const test = await testUrl(url.trim());
    if (!test.ok) {
      return NextResponse.json({ error: `Feed test failed: ${test.error}` }, { status: 400 });
    }
    patch.url = url.trim();
    patch.feed_type = test.feed_type;
    patch.last_fetch_status = "never";
    patch.last_fetch_error = null;
    patch.last_fetched_at = null;
    patch.last_item_count = 0;
  }

  const { data, error: dbErr } = await admin
    .from("smm_news_sources")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/smm/news/sources — remove source
export async function DELETE(req: NextRequest) {
  const { error } = await guardOps();
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id } = parsed.data;

  const { error: dbErr } = await createAdminClient()
    .from("smm_news_sources")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
