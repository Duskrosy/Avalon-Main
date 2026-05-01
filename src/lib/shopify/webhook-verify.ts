// src/lib/shopify/webhook-verify.ts
//
// HMAC-SHA256 verification for Shopify webhooks.
// Uses Node's built-in `crypto` — no external deps.
//
// Usage:
//   const ok = verifyShopifyWebhook(rawBody, req.headers.get('X-Shopify-Hmac-Sha256'), secret);
//   if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a Shopify webhook request using HMAC-SHA256.
 *
 * @param rawBody    - The raw request body (string or Buffer). Must NOT be parsed.
 * @param hmacHeader - The value of the X-Shopify-Hmac-Sha256 header.
 * @param secret     - The Shopify webhook signing secret (shpss_... or SHOPIFY_WEBHOOK_SECRET).
 * @returns          true if the signature matches, false otherwise.
 */
export function verifyShopifyWebhook(
  rawBody: string | Buffer,
  hmacHeader: string | null,
  secret: string,
): boolean {
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  // Compare byte-by-byte with timing-safe equal to prevent timing attacks.
  // Both buffers must be the same length; if lengths differ the signature is
  // wrong — early-return false rather than risking a length-revealing error.
  const digestBuf = Buffer.from(digest, "utf8");
  const headerBuf = Buffer.from(hmacHeader, "utf8");

  if (digestBuf.length !== headerBuf.length) return false;

  return timingSafeEqual(digestBuf, headerBuf);
}
