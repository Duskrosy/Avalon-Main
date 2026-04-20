import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { fetchFeed, parseFeed } from "@/lib/smm/rss-parser";

// ─── Auth guard ────────────────────────────────────────────────────────────────

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  try {
    const supabase = await createClient();
    const user = await getCurrentUser(supabase);
    if (!user) return false;
    if (isOps(user)) return true;

    if (user.department_id) {
      const { data: dept } = await supabase
        .from("departments")
        .select("slug")
        .eq("id", user.department_id)
        .maybeSingle();
      return ["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "");
    }
    return false;
  } catch {
    return false;
  }
}

// ─── POST /api/smm/news/fetch ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: sources, error: srcErr } = await admin
    .from("smm_news_sources")
    .select("id, name, url, category")
    .eq("is_active", true);

  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
  if (!sources || sources.length === 0) {
    return NextResponse.json({ fetched: 0, new: 0, errors: [] });
  }

  let totalFetched = 0;
  let totalNew = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const source of sources) {
    try {
      const xml = await fetchFeed(source.url, 8000);
      const feed = parseFeed(xml);

      if (feed.feed_type === "unknown" || feed.items.length === 0) {
        await admin
          .from("smm_news_sources")
          .update({
            feed_type: "unknown",
            last_fetched_at: now,
            last_fetch_status: "error",
            last_fetch_error: "No RSS or Atom items found.",
            last_item_count: 0,
          })
          .eq("id", source.id);
        errors.push(`${source.name}: no items`);
        continue;
      }

      totalFetched += feed.items.length;

      const rows = feed.items
        .filter((item) => item.link && item.title)
        .map((item) => ({
          source_id:    source.id,
          title:        item.title.slice(0, 500),
          url:          item.link,
          summary:      item.description || null,
          image_url:    item.imageUrl ?? null,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          fetched_at:   now,
        }));

      if (rows.length === 0) {
        await admin
          .from("smm_news_sources")
          .update({
            feed_type: feed.feed_type,
            last_fetched_at: now,
            last_fetch_status: "ok",
            last_fetch_error: null,
            last_item_count: 0,
          })
          .eq("id", source.id);
        continue;
      }

      const { data: upserted, error: upsertErr } = await admin
        .from("smm_news_items")
        .upsert(rows, { onConflict: "url", ignoreDuplicates: false })
        .select("id");

      if (upsertErr) {
        await admin
          .from("smm_news_sources")
          .update({
            feed_type: feed.feed_type,
            last_fetched_at: now,
            last_fetch_status: "error",
            last_fetch_error: upsertErr.message,
          })
          .eq("id", source.id);
        errors.push(`${source.name}: ${upsertErr.message}`);
        continue;
      }

      totalNew += upserted?.length ?? 0;

      await admin
        .from("smm_news_sources")
        .update({
          feed_type: feed.feed_type,
          last_fetched_at: now,
          last_fetch_status: "ok",
          last_fetch_error: null,
          last_item_count: rows.length,
        })
        .eq("id", source.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await admin
        .from("smm_news_sources")
        .update({
          last_fetched_at: now,
          last_fetch_status: "error",
          last_fetch_error: message,
        })
        .eq("id", source.id);
      errors.push(`${source.name}: ${message}`);
    }
  }

  return NextResponse.json({ fetched: totalFetched, new: totalNew, errors });
}
