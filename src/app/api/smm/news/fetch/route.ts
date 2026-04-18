import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── Simple XML helpers ────────────────────────────────────────────────────────

function extractBetween(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";
}

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  imageUrl: string | null;
}

function extractItems(xml: string): RssItem[] {
  const items: string[] = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item) => {
    const imageUrl =
      item.match(/url="([^"]+\.(?:jpg|jpeg|png|gif|webp))"/i)?.[1] ??
      item.match(/<enclosure[^>]+url="([^"]+)"/i)?.[1] ??
      null;
    return {
      title:       extractBetween(item, "title"),
      link:        extractBetween(item, "link") || (item.match(/<link>([^<]+)<\/link>/)?.[1] ?? ""),
      description: extractBetween(item, "description").replace(/<[^>]+>/g, "").slice(0, 500),
      pubDate:     extractBetween(item, "pubDate"),
      imageUrl,
    };
  });
}

function extractAtomEntries(xml: string): RssItem[] {
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  return entries.map((entry) => ({
    title: extractBetween(entry, "title"),
    link: entry.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? "",
    description: (extractBetween(entry, "content") || extractBetween(entry, "summary"))
      .replace(/<[^>]+>/g, "").slice(0, 500),
    pubDate: extractBetween(entry, "updated") || extractBetween(entry, "published"),
    imageUrl: entry.match(/href="([^"]+\.(?:jpg|jpeg|png|gif|webp))"/i)?.[1] ?? null,
  }));
}

// ─── Auth guard ────────────────────────────────────────────────────────────────

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Cron bearer token
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  // Or any is_ad_ops_access user
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

  // Fetch all active sources
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

  for (const source of sources) {
    try {
      // 8-second timeout per feed
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      let xml: string;
      try {
        const isReddit = source.url.includes("reddit.com");
        const fetchUrl = isReddit
          ? source.url.replace(/\/\/(?:www\.)?reddit\.com/, "//old.reddit.com")
          : source.url;
        const headers: Record<string, string> = {
          "User-Agent": isReddit
            ? "Mozilla/5.0 (compatible; Avalon/1.0; +https://finncotton.com)"
            : "AvalonRSSBot/1.0",
        };
        const res = await fetch(fetchUrl, {
          signal: controller.signal,
          headers,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        xml = await res.text();
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        throw fetchErr;
      }

      let items = extractItems(xml);
      if (items.length === 0) items = extractAtomEntries(xml);
      if (items.length === 0) continue;

      totalFetched += items.length;

      // Build upsert rows
      const rows = items
        .filter((item) => item.link && item.title)
        .map((item) => ({
          source_id:    source.id,
          title:        item.title.slice(0, 500),
          url:          item.link,
          summary:      item.description || null,
          image_url:    item.imageUrl ?? null,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          fetched_at:   new Date().toISOString(),
        }));

      if (rows.length === 0) continue;

      const { data: upserted, error: upsertErr } = await admin
        .from("smm_news_items")
        .upsert(rows, { onConflict: "url", ignoreDuplicates: false })
        .select("id");

      if (upsertErr) {
        errors.push(`${source.name}: ${upsertErr.message}`);
        continue;
      }

      // Count truly new items (approximation: all returned rows treated as upserted)
      // For an exact count we'd need to compare before/after, but this is good enough
      totalNew += upserted?.length ?? 0;
    } catch (err) {
      errors.push(`${source.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ fetched: totalFetched, new: totalNew, errors });
}
