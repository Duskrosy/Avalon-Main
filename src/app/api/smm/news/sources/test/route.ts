import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { fetchFeed, parseFeed } from "@/lib/smm/rss-parser";

const testSchema = z.object({
  url: z.string().url().max(2000),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = testSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid URL" },
      { status: 400 },
    );
  }

  try {
    const xml = await fetchFeed(parsed.data.url, 5000);
    const feed = parseFeed(xml);

    if (feed.feed_type === "unknown" || feed.items.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "No RSS or Atom items found at this URL.",
      });
    }

    return NextResponse.json({
      ok: true,
      feed_type: feed.feed_type,
      title: feed.title || null,
      description: feed.description || null,
      total_count: feed.items.length,
      sample_items: feed.items.slice(0, 3).map((i) => ({
        title: i.title,
        link: i.link,
        published_at: i.pubDate || null,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Fetch failed",
    });
  }
}
