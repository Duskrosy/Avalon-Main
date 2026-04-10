// Server-only TikTok helpers — never import from client components.
// Shared between social-sync and any other server route that needs TikTok tokens.

import { createAdminClient } from "@/lib/supabase/admin";
import { refreshTikTokToken } from "./client";

type PlatformTokenRow = {
  id: string;
  access_token: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
};

/**
 * Returns a valid TikTok access token for the given platform row.
 * If the token is expired or expiring in < 5 minutes, it is refreshed
 * automatically and the new tokens are persisted to the DB.
 */
export async function getValidTikTokToken(
  platform: PlatformTokenRow,
  admin: ReturnType<typeof createAdminClient>,
): Promise<string> {
  if (!platform.access_token) {
    throw new Error("No TikTok access token stored. Connect via Settings → ⚙ Groups → TikTok.");
  }

  const expiresAt   = platform.token_expires_at ? new Date(platform.token_expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!needsRefresh) return platform.access_token;

  if (!platform.refresh_token) {
    throw new Error("TikTok refresh token missing. Reconnect in Settings → ⚙ Groups → TikTok.");
  }

  console.info(`[tiktok/server] Refreshing access token for platform ${platform.id}`);
  const tokens    = await refreshTikTokToken(platform.refresh_token);
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await admin
    .from("smm_group_platforms")
    .update({
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token,
      token_expires_at: newExpiry,
    })
    .eq("id", platform.id);

  return tokens.access_token;
}
