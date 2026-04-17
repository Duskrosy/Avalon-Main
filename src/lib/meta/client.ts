// Meta (Facebook) Marketing API v21.0 client
// All functions are server-side only — never import from client components.

const BASE = "https://graph.facebook.com/v21.0";

// ─── Token resolution ─────────────────────────────────────────────────────────

/** Returns the per-account token if set, otherwise falls back to the global system-user token. */
export function resolveToken(account: { meta_access_token?: string | null }): string {
  return account.meta_access_token ?? process.env.META_ACCESS_TOKEN ?? "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetaAccountInsight = {
  account_id: string;
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  reach: string;
};

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
  updated_time: string;
};

export type MetaAdInsight = {
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  date_start: string;
  date_stop: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  // Video actions are nested arrays in the Meta response
  video_plays?: string;           // 3-second plays
  video_plays_25pct?: string;     // 25% completion
  conversions?: string;
  purchase_roas?: { action_type: string; value: string }[];
  // Raw action arrays — used to extract custom conversion data
  raw_actions?: { action_type: string; value: string }[];
  raw_action_values?: { action_type: string; value: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function metaGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function buildInsightsUrl(
  accountId: string,
  token: string,
  fields: string,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams({
    access_token: token,
    fields,
    // async=false is REQUIRED — without it Meta returns a job ID, not data
    async: "false",
    ...extra,
  });
  return `${BASE}/act_${accountId}/insights?${params}`;
}

// ─── Account-level summary ────────────────────────────────────────────────────

/**
 * Fetch account-level spend + impressions for yesterday (or the specified date preset).
 * Returns a single object (the first edge from the paged response).
 */
export async function fetchAccountInsights(
  accountId: string,
  token: string,
  datePreset = "yesterday",
): Promise<MetaAccountInsight | null> {
  const fields = "account_id,spend,impressions,clicks,reach";
  const url = buildInsightsUrl(accountId, token, fields, { date_preset: datePreset });

  const json = await metaGet<{ data: MetaAccountInsight[] }>(url);
  return json.data?.[0] ?? null;
}

// ─── Active campaigns ─────────────────────────────────────────────────────────

/**
 * Fetch all ACTIVE campaigns for an account.
 * Uses effective_status to filter — only returns campaigns that are actually running.
 */
export async function fetchCampaigns(
  accountId: string,
  token: string,
): Promise<MetaCampaign[]> {
  const fields = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time";
  const params = new URLSearchParams({
    access_token: token,
    fields,
    effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
    limit: "200",
  });
  const url = `${BASE}/act_${accountId}/campaigns?${params}`;

  const json = await metaGet<{ data: MetaCampaign[] }>(url);
  return json.data ?? [];
}

// ─── Ad-level performance ─────────────────────────────────────────────────────

/**
 * Fetch per-ad metrics for yesterday (or specified date preset).
 * Returns one row per ad.
 */
export async function fetchAdInsights(
  accountId: string,
  token: string,
  datePreset = "yesterday",
): Promise<MetaAdInsight[]> {
  const fields = [
    "ad_id",
    "ad_name",
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "impressions",
    "clicks",
    "spend",
    "reach",
    // Video action breakdowns
    "video_play_actions",
    "video_p25_watched_actions",
    // Conversions + ROAS
    "actions",
    "action_values",   // monetary value per action type (needed for custom conversions)
    "purchase_roas",
  ].join(",");

  const url = buildInsightsUrl(accountId, token, fields, {
    date_preset: datePreset,
    level: "ad",
    limit: "500",
  });

  const json = await metaGet<{ data: RawAdInsight[] }>(url);

  // Normalise the nested action arrays into flat numbers
  return (json.data ?? []).map(normaliseAdInsight);
}

// ─── Normaliser ───────────────────────────────────────────────────────────────

type ActionEntry = { action_type: string; value: string };
type RawAdInsight = Omit<MetaAdInsight, "video_plays" | "video_plays_25pct" | "conversions" | "raw_actions" | "raw_action_values"> & {
  video_play_actions?: ActionEntry[];
  video_p25_watched_actions?: ActionEntry[];
  actions?: ActionEntry[];
  action_values?: ActionEntry[];
  purchase_roas?: { action_type: string; value: string }[];
};

function sumAction(actions: ActionEntry[] | undefined, type: string): string {
  if (!actions) return "0";
  const entry = actions.find((a) => a.action_type === type);
  return entry?.value ?? "0";
}

function normaliseAdInsight(raw: RawAdInsight): MetaAdInsight {
  return {
    ad_id: raw.ad_id,
    ad_name: raw.ad_name,
    campaign_id: raw.campaign_id,
    campaign_name: raw.campaign_name,
    adset_id: raw.adset_id,
    adset_name: raw.adset_name,
    date_start: raw.date_start,
    date_stop: raw.date_stop,
    impressions: raw.impressions,
    clicks: raw.clicks,
    spend: raw.spend,
    reach: raw.reach,
    video_plays: sumAction(raw.video_play_actions, "video_view"),
    video_plays_25pct: sumAction(raw.video_p25_watched_actions, "video_p25_watched"),
    conversions: sumAction(raw.actions, "purchase"),
    purchase_roas: raw.purchase_roas,
    // Pass raw arrays through so callers can extract custom conversion data
    raw_actions: raw.actions,
    raw_action_values: raw.action_values,
  };
}

// ─── Ad thumbnail fetching ────────────────────────────────────────────────────

/**
 * Fetch thumbnail URLs for a list of ad IDs.
 * Returns a map of adId → thumbnailUrl (omits ads with no thumbnail).
 */
export async function fetchAdThumbnails(
  adIds: string[],
  token: string,
): Promise<Record<string, string>> {
  if (!adIds.length) return {};
  const results: Record<string, string> = {};
  await Promise.allSettled(
    adIds.map(async (adId) => {
      try {
        const url = `${BASE}/${adId}?fields=creative%7Bthumbnail_url%7D&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json() as { creative?: { thumbnail_url?: string } };
        const thumb = json?.creative?.thumbnail_url;
        if (thumb) results[adId] = thumb;
      } catch { /* skip */ }
    }),
  );
  return results;
}

// ─── Campaign status management ───────────────────────────────────────────────

/**
 * Pause or resume a campaign via Meta Ads API.
 * status: "ACTIVE" | "PAUSED"
 */
export async function updateCampaignStatus(
  campaignId: string,
  token: string,
  status: "ACTIVE" | "PAUSED",
): Promise<void> {
  const res = await fetch(`${BASE}/${campaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API error ${res.status}: ${body}`);
  }
}

/**
 * Pause or resume an adset.
 */
export async function updateAdsetStatus(
  adsetId: string,
  token: string,
  status: "ACTIVE" | "PAUSED",
): Promise<void> {
  const res = await fetch(`${BASE}/${adsetId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API error ${res.status}: ${body}`);
  }
}

/**
 * Pause or resume an individual ad.
 */
export async function updateAdStatus(
  adId: string,
  token: string,
  status: "ACTIVE" | "PAUSED",
): Promise<void> {
  const res = await fetch(`${BASE}/${adId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API error ${res.status}: ${body}`);
  }
}

/**
 * Set an adset's daily budget (amount in the account's currency, NOT cents).
 * Meta API expects the value in the minor unit (cents/pence/centavos).
 */
export async function setAdsetDailyBudget(
  adsetId: string,
  token: string,
  dailyBudget: number, // in major currency units (e.g. PHP 500)
): Promise<void> {
  const budgetMinorUnit = Math.round(dailyBudget * 100); // convert to cents
  const res = await fetch(`${BASE}/${adsetId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ daily_budget: budgetMinorUnit, access_token: token }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API error ${res.status}: ${body}`);
  }
}

/**
 * Fetch spend for a list of adset IDs from one ad account.
 * Returns a map of adsetId → spend (number).
 */
export async function fetchAdsetSpend(
  accountId: string,
  token: string,
  adsetIds: string[],
  period: "lifetime" | "monthly" | "daily" = "lifetime",
): Promise<Record<string, number>> {
  if (!adsetIds.length) return {};

  const datePreset =
    period === "monthly" ? "this_month" :
    period === "daily"   ? "today" :
    undefined;

  const params = new URLSearchParams({
    access_token: token,
    fields: "adset_id,spend",
    level: "adset",
    async: "false",
    filtering: JSON.stringify([{ field: "adset.id", operator: "IN", value: adsetIds }]),
    limit: "500",
  });

  if (datePreset) {
    params.set("date_preset", datePreset);
  } else {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    params.set("time_range", JSON.stringify({ since: "2015-01-01", until: tomorrow }));
  }

  const url = `${BASE}/act_${accountId}/insights?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta adset spend error ${res.status}: ${body}`);
  }
  const json = await res.json() as { data: { adset_id: string; spend: string }[] };
  const map: Record<string, number> = {};
  for (const row of json.data ?? []) {
    map[row.adset_id] = parseFloat(row.spend ?? "0");
  }
  return map;
}

/**
 * Fetch lifetime spend for a list of campaign IDs from one ad account.
 * Returns a map of campaignId → spend (number).
 */
export async function fetchCampaignSpend(
  accountId: string,
  token: string,
  campaignIds: string[],
  period: "lifetime" | "monthly" | "daily" = "lifetime",
): Promise<Record<string, number>> {
  if (campaignIds.length === 0) return {};

  const datePreset =
    period === "monthly" ? "this_month" :
    period === "daily"   ? "today" :
    undefined; // lifetime uses date_range instead

  const params = new URLSearchParams({
    access_token: token,
    fields: "campaign_id,spend",
    level: "campaign",
    async: "false",
    filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]),
    limit: "500",
  });

  if (datePreset) {
    params.set("date_preset", datePreset);
  } else {
    // Lifetime: use a wide date range from 2015 to tomorrow
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    params.set("time_range", JSON.stringify({ since: "2015-01-01", until: tomorrow }));
  }

  const url = `${BASE}/act_${accountId}/insights?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta spend fetch error ${res.status}: ${body}`);
  }
  const json = await res.json() as { data: { campaign_id: string; spend: string }[] };

  const map: Record<string, number> = {};
  for (const row of json.data ?? []) {
    map[row.campaign_id] = parseFloat(row.spend ?? "0");
  }
  return map;
}

// ─── Demographics (gender/age breakdown) ─────────────────────────────────────────

export type AdDemographicRow = {
  campaign_id:   string;
  campaign_name: string | null;
  adset_id:      string | null;
  adset_name:    string | null;
  ad_id:         string | null;
  ad_name:       string | null;
  gender:        string | null;
  age_group:     string | null;
  spend:         number;
  impressions:   number;
  conversions:   number;
  messages:      number;
};

export async function fetchAdDemographics(
  accountId: string,
  campaignId: string,
  date: string,
  token: string,
  breakdown: "gender" | "age" = "gender"
): Promise<AdDemographicRow[]> {
  const params = new URLSearchParams({
    fields: "spend,impressions,actions,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name",
    breakdowns: breakdown === "age" ? "age" : "gender",
    time_range: JSON.stringify({ since: date, until: date }),
    level: "ad",
    async: "false", // REQUIRED — without this Meta returns a job ID instead of data
    access_token: token,
  });
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${campaignId}/insights?${params}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Meta demographics fetch failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return (json.data ?? []).map((row: Record<string, unknown>) => {
    const actions = (row.actions ?? []) as { action_type: string; value: string }[];
    const conversions = Number(
      // "purchase" is Meta's normalized action type covering both on-site and off-site purchases
      actions.find((a) => a.action_type === "purchase")?.value ?? 0
    );
    const messages = Number(
      actions.find((a) =>
        a.action_type === "onsite_conversion.messaging_conversation_started_7d"
      )?.value ?? 0
    );
    return {
      campaign_id:   (row.campaign_id   as string) ?? campaignId,
      campaign_name: (row.campaign_name as string) ?? null,
      adset_id:      (row.adset_id      as string) ?? null,
      adset_name:    (row.adset_name    as string) ?? null,
      ad_id:         (row.ad_id         as string) ?? null,
      ad_name:       (row.ad_name       as string) ?? null,
      gender:    breakdown === "gender" ? ((row.gender as string) ?? "unknown") : null,
      age_group: breakdown === "age"    ? ((row.age    as string) ?? null)      : null,
      spend:       Number(row.spend       ?? 0),
      impressions: Number(row.impressions ?? 0),
      conversions,
      messages,
    };
  });
}
