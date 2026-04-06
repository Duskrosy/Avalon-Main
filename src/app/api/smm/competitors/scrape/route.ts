import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function isAdOpsAccess(req: NextRequest): Promise<boolean> {
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

// ─── Platform scrapers ────────────────────────────────────────────────────────

type ScrapeResult = {
  follower_count: number | null;
  post_count: number | null;
};

async function scrapeFacebook(externalId: string): Promise<ScrapeResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not configured.");

  const url = `https://graph.facebook.com/v21.0/${externalId}?fields=fan_count,posts.limit(1).summary(true)&access_token=${token}`;
  const res = await fetch(url);
  const json = await res.json();

  if (!res.ok || json.error) throw new Error(json.error?.message ?? "Facebook API error");

  return {
    follower_count: json.fan_count ?? null,
    post_count:     json.posts?.summary?.total_count ?? null,
  };
}

async function scrapeInstagram(externalId: string): Promise<ScrapeResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not configured.");

  const url = `https://graph.facebook.com/v21.0/${externalId}?fields=followers_count,media_count&access_token=${token}`;
  const res = await fetch(url);
  const json = await res.json();

  if (!res.ok || json.error) throw new Error(json.error?.message ?? "Instagram API error");

  return {
    follower_count: json.followers_count ?? null,
    post_count:     json.media_count     ?? null,
  };
}

async function scrapeYouTube(externalId: string): Promise<ScrapeResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not configured.");

  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${externalId}&key=${apiKey}`;
  const res = await fetch(url);
  const json = await res.json();

  if (!res.ok || json.error) throw new Error(json.error?.message ?? "YouTube API error");

  const stats = json.items?.[0]?.statistics;
  if (!stats) throw new Error(`YouTube channel not found for ID: ${externalId}`);

  return {
    follower_count: parseInt(stats.subscriberCount ?? "0", 10),
    post_count:     parseInt(stats.videoCount      ?? "0", 10),
  };
}

async function scrapeTikTok(handle: string): Promise<ScrapeResult> {
  try {
    const url = `https://www.tiktok.com/@${handle}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) throw new Error(`TikTok fetch failed: ${res.status}`);

    const html = await res.text();

    // Extract __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob
    const match = html.match(
      /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match) throw new Error("TikTok: rehydration data not found");

    const data = JSON.parse(match[1]);

    // Traverse to followerCount — path may vary but is typically nested under userInfo
    const followerCount: number | null =
      data?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.stats?.followerCount ??
      null;

    return {
      follower_count: followerCount,
      post_count:     null,
    };
  } catch {
    return { follower_count: null, post_count: null };
  }
}

// ─── POST /api/smm/competitors/scrape ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const fromCron = isCronRequest(req);

  if (!fromCron) {
    const allowed = await isAdOpsAccess(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const { competitor_id } = body as { competitor_id?: string };

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // ── Fetch active accounts ──────────────────────────────────────────────────
  let query = admin
    .from("smm_competitor_accounts")
    .select("id, competitor_id, platform, handle, external_id")
    .eq("is_active", true);

  if (competitor_id) {
    query = query.eq("competitor_id", competitor_id);
  }

  const { data: accounts, error: fetchErr } = await query;

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, scraped_date: today, results: [] });
  }

  // ── Scrape each account concurrently ──────────────────────────────────────
  type AccountRow = {
    id: string;
    competitor_id: string;
    platform: string;
    handle: string | null;
    external_id: string | null;
  };

  type PerAccountResult =
    | { account_id: string; platform: string; ok: true; follower_count: number | null; post_count: number | null }
    | { account_id: string; platform: string; ok: false; error: string };

  const settled = await Promise.allSettled(
    accounts.map(async (acc: AccountRow): Promise<PerAccountResult> => {
      const { id: account_id, platform, handle, external_id } = acc;

      try {
        let result: ScrapeResult;

        if (platform === "facebook") {
          if (!external_id) throw new Error("No external_id configured for Facebook account.");
          result = await scrapeFacebook(external_id);
        } else if (platform === "instagram") {
          if (!external_id) throw new Error("No external_id configured for Instagram account.");
          result = await scrapeInstagram(external_id);
        } else if (platform === "youtube") {
          if (!external_id) throw new Error("No external_id configured for YouTube channel.");
          result = await scrapeYouTube(external_id);
        } else if (platform === "tiktok") {
          const tiktokHandle = handle ?? external_id;
          if (!tiktokHandle) throw new Error("No handle configured for TikTok account.");
          result = await scrapeTikTok(tiktokHandle);
        } else {
          throw new Error(`Unsupported platform: ${platform}`);
        }

        // Upsert snapshot
        const { error: upsertErr } = await admin
          .from("smm_competitor_snapshots")
          .upsert(
            {
              account_id,
              snapshot_date:  today,
              follower_count: result.follower_count,
              post_count:     result.post_count,
              data_source:    "auto",
            },
            { onConflict: "account_id,snapshot_date" }
          );

        if (upsertErr) throw new Error(upsertErr.message);

        // Update last_scraped_at on the account row
        await admin
          .from("smm_competitor_accounts")
          .update({ last_scraped_at: new Date().toISOString() })
          .eq("id", account_id);

        return { account_id, platform, ok: true, follower_count: result.follower_count, post_count: result.post_count };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return { account_id, platform, ok: false, error };
      }
    })
  );

  const results: PerAccountResult[] = settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : { account_id: "unknown", platform: "unknown", ok: false, error: String((s as PromiseRejectedResult).reason) }
  );

  const scraped = results.filter((r) => r.ok).length;
  const failed  = results.filter((r) => !r.ok).length;

  return NextResponse.json({ ok: true, scraped_date: today, scraped, failed, results });
}
