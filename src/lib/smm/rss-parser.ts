export type FeedType = "rss" | "atom" | "unknown";

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  imageUrl: string | null;
}

export interface FeedMeta {
  feed_type: FeedType;
  title: string;
  description: string;
  items: FeedItem[];
}

function extractBetween(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";
}

function extractRssItems(xml: string): FeedItem[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
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

function extractAtomEntries(xml: string): FeedItem[] {
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

export function parseFeed(xml: string): FeedMeta {
  const rssItems = extractRssItems(xml);
  if (rssItems.length > 0) {
    return {
      feed_type: "rss",
      title: extractBetween(xml.split("<item")[0] ?? xml, "title"),
      description: extractBetween(xml.split("<item")[0] ?? xml, "description"),
      items: rssItems,
    };
  }
  const atomEntries = extractAtomEntries(xml);
  if (atomEntries.length > 0) {
    return {
      feed_type: "atom",
      title: extractBetween(xml.split("<entry")[0] ?? xml, "title"),
      description: extractBetween(xml.split("<entry")[0] ?? xml, "subtitle"),
      items: atomEntries,
    };
  }
  return { feed_type: "unknown", title: "", description: "", items: [] };
}

export async function fetchFeed(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const isReddit = url.includes("reddit.com");
    const fetchUrl = isReddit
      ? url.replace(/\/\/(?:www\.)?reddit\.com/, "//old.reddit.com")
      : url;
    const headers: Record<string, string> = {
      "User-Agent": isReddit
        ? "Mozilla/5.0 (compatible; Avalon/1.0; +https://finncotton.com)"
        : "AvalonRSSBot/1.0",
    };
    const res = await fetch(fetchUrl, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeoutId);
  }
}
