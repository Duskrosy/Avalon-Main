// src/lib/auth/cron-auth.ts
//
// Timing-safe CRON_SECRET Bearer token comparison.
// Using timingSafeEqual prevents timing-oracle attacks against the secret.

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export function authCron(req: Request | NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
