// src/lib/shopify/__tests__/v-webhook-verify.test.ts
//
// Unit tests for verifyShopifyWebhook().
// Pure crypto — no DB, no env vars, no mocks needed.
//
// Run: npx vitest run src/lib/shopify/__tests__/v-webhook-verify.test.ts

import { createHmac } from "crypto";
import { describe, it, expect } from "vitest";
import { verifyShopifyWebhook } from "../webhook-verify";

const SECRET = "test_webhook_secret_abc123";

function makeHmac(body: string | Buffer, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

describe("verifyShopifyWebhook", () => {
  it("returns true for a valid HMAC (string body)", () => {
    const body = JSON.stringify({ id: 1234, source_name: "web" });
    const hmac = makeHmac(body);
    expect(verifyShopifyWebhook(body, hmac, SECRET)).toBe(true);
  });

  it("returns true for a valid HMAC (Buffer body)", () => {
    const body = Buffer.from(JSON.stringify({ id: 5678 }));
    const hmac = makeHmac(body);
    expect(verifyShopifyWebhook(body, hmac, SECRET)).toBe(true);
  });

  it("returns false for an invalid HMAC (tampered body)", () => {
    const body = JSON.stringify({ id: 1234 });
    const hmac = makeHmac(body);
    const tamperedBody = JSON.stringify({ id: 9999 }); // different body
    expect(verifyShopifyWebhook(tamperedBody, hmac, SECRET)).toBe(false);
  });

  it("returns false for an invalid HMAC (wrong secret)", () => {
    const body = JSON.stringify({ id: 1234 });
    const hmac = makeHmac(body, "correct_secret");
    expect(verifyShopifyWebhook(body, hmac, "wrong_secret")).toBe(false);
  });

  it("returns false when hmacHeader is null", () => {
    const body = JSON.stringify({ id: 1234 });
    expect(verifyShopifyWebhook(body, null, SECRET)).toBe(false);
  });

  it("returns false when hmacHeader is empty string", () => {
    const body = JSON.stringify({ id: 1234 });
    expect(verifyShopifyWebhook(body, "", SECRET)).toBe(false);
  });

  it("returns true for an empty body with correct HMAC", () => {
    const body = "";
    const hmac = makeHmac(body);
    expect(verifyShopifyWebhook(body, hmac, SECRET)).toBe(true);
  });

  it("returns false for a truncated/corrupted HMAC header", () => {
    const body = JSON.stringify({ id: 1234 });
    const hmac = makeHmac(body).slice(0, 10); // truncated
    expect(verifyShopifyWebhook(body, hmac, SECRET)).toBe(false);
  });
});
