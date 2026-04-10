// TikTok for Developers — Display API v2
// All functions are server-side only. Never import from client components.
// Docs: https://developers.tiktok.com/doc/display-api-overview

const TIKTOK_BASE = "https://open.tiktokapis.com/v2";
const TIKTOK_AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize";

// ─── Auth URL ─────────────────────────────────────────────────────────────────

/**
 * Builds the TikTok OAuth authorization URL.
 * `state` should be the smm_group_platforms.id to update after callback.
 */
export function getTikTokAuthUrl(state: string, redirectUri: string): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) throw new Error("TIKTOK_CLIENT_KEY environment variable not set");

  const params = new URLSearchParams({
    client_key:    clientKey,
    scope:         "user.info.basic,user.info.stats,video.list",
    response_type: "code",
    redirect_uri:  redirectUri,
    state,
  });
  return `${TIKTOK_AUTH_BASE}/?${params}`;
}

// ─── Token exchange ────────────────────────────────────────────────────────────

export type TikTokTokenResponse = {
  access_token:       string;
  refresh_token:      string;
  open_id:            string;
  scope:              string;
  expires_in:         number;  // seconds — typically 86400 (24 h)
  refresh_expires_in: number;  // seconds — typically 31536000 (365 days)
  token_type:         string;
};

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TikTokTokenResponse> {
  const res = await fetch(`${TIKTOK_BASE}/oauth/token/`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_key:    process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type:    "authorization_code",
      redirect_uri:  redirectUri,
    }),
  });

  const json = await res.json() as TikTokTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || json.error) {
    throw new Error(`TikTok token exchange failed: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json;
}

/** Refresh an expired access token using the refresh token. */
export async function refreshTikTokToken(refreshToken: string): Promise<TikTokTokenResponse> {
  const res = await fetch(`${TIKTOK_BASE}/oauth/token/`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_key:    process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const json = await res.json() as TikTokTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || json.error) {
    throw new Error(`TikTok token refresh failed: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TikTokUser = {
  open_id:       string;
  display_name:  string;
  avatar_url:    string;
  follower_count:  number;
  following_count: number;
  likes_count:   number;
  video_count:   number;
};

export type TikTokVideoStub = {
  id:              string;
  title?:          string;
  cover_image_url?: string;
  create_time?:    number; // Unix timestamp
  duration?:       number; // seconds
};

export type TikTokVideoStats = TikTokVideoStub & {
  like_count?:    number;
  comment_count?: number;
  share_count?:   number;
  view_count?:    number;
  share_url?:     string;
};

// ─── API helpers ──────────────────────────────────────────────────────────────

function checkTikTokError(json: { error?: { code?: string; message?: string } }) {
  if (json.error?.code && json.error.code !== "ok") {
    throw new Error(`TikTok API error: ${json.error.message ?? json.error.code}`);
  }
}

// ─── User info ────────────────────────────────────────────────────────────────

/**
 * Fetch the authorized user's profile and follower stats.
 * Used after OAuth and during nightly sync for follower_count.
 */
export async function fetchTikTokUserInfo(accessToken: string): Promise<TikTokUser> {
  const fields = "open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count";
  const res = await fetch(`${TIKTOK_BASE}/user/info/?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache:   "no-store",
  });

  const json = await res.json() as { data?: { user?: TikTokUser }; error?: { code?: string; message?: string } };
  if (!res.ok) throw new Error(`TikTok user info failed: ${res.status}`);
  checkTikTokError(json);

  const user = json.data?.user;
  if (!user) throw new Error("TikTok user info: empty response");
  return user;
}

// ─── Video list ───────────────────────────────────────────────────────────────

/**
 * Fetch a page of the authorized user's public videos.
 * Returns id + cover_image_url only — pass IDs to fetchTikTokVideoStats for metrics.
 */
export async function fetchTikTokVideoList(
  accessToken: string,
  maxCount = 20,
  cursor = 0,
): Promise<{ videos: TikTokVideoStub[]; cursor: number; has_more: boolean }> {
  const fields = "id,title,cover_image_url,create_time,duration";
  const res = await fetch(`${TIKTOK_BASE}/video/list/?fields=${fields}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body:    JSON.stringify({ max_count: maxCount, cursor }),
    cache:   "no-store",
  });

  const json = await res.json() as {
    data?: { videos?: TikTokVideoStub[]; cursor?: number; has_more?: boolean };
    error?: { code?: string; message?: string };
  };
  if (!res.ok) throw new Error(`TikTok video list failed: ${res.status}`);
  checkTikTokError(json);

  return {
    videos:   json.data?.videos   ?? [],
    cursor:   json.data?.cursor   ?? 0,
    has_more: json.data?.has_more ?? false,
  };
}

// ─── Video stats ──────────────────────────────────────────────────────────────

/**
 * Fetch engagement stats for up to 20 video IDs at a time.
 * Returns view_count, like_count, comment_count, share_count, share_url per video.
 */
export async function fetchTikTokVideoStats(
  accessToken: string,
  videoIds: string[],
): Promise<TikTokVideoStats[]> {
  if (!videoIds.length) return [];

  const fields = "id,title,cover_image_url,like_count,comment_count,share_count,view_count,create_time,share_url";
  const res = await fetch(`${TIKTOK_BASE}/video/query/?fields=${fields}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body:    JSON.stringify({ filters: { video_ids: videoIds } }),
    cache:   "no-store",
  });

  const json = await res.json() as {
    data?: { videos?: TikTokVideoStats[] };
    error?: { code?: string; message?: string };
  };
  if (!res.ok) throw new Error(`TikTok video stats failed: ${res.status}`);
  checkTikTokError(json);

  return json.data?.videos ?? [];
}
