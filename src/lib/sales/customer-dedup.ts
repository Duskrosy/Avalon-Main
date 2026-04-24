/**
 * Customer dedup helpers — UI-side only.
 *
 * The authoritative phone canonicalization lives in Postgres
 * (public.canonicalize_phone) and is referenced by both the
 * customers.canonical_phone GENERATED column and the server-side dedup query
 * in POST /api/sales/customers. The TS helpers below are for client-side UI
 * hints (showing the canonical form as the agent types) — they are NOT
 * authoritative. Server queries always go through the SQL function so the
 * two implementations cannot drift.
 *
 * Reference: design doc rev 2, "How to keep phone-number canonicalization
 * consistent" — single source of truth in Postgres.
 */

/**
 * Mirror of public.canonicalize_phone for client-side UI hints.
 *
 *   "09171234567"          → "+639171234567"
 *   "+63 917 123 4567"     → "+639171234567"
 *   "917-123-4567"         → "+639171234567"
 *   "63 917 123 4567"      → "+639171234567"
 *   ""                     → null
 *   null/undefined         → null
 *
 * Keep in lockstep with the SQL function. If the SQL changes, change this too
 * AND add a passing test for both.
 */
export function canonicalPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let normalized: string;
  if (trimmed.startsWith("+")) {
    normalized = trimmed;
  } else if (trimmed.startsWith("63")) {
    normalized = "+" + trimmed;
  } else if (trimmed.startsWith("0")) {
    normalized = "+63" + trimmed.slice(1);
  } else {
    normalized = "+" + trimmed;
  }
  return normalized.replace(/[^0-9+]/g, "");
}

/**
 * Normalize a name for dedup comparison: trim, lowercase, collapse whitespace,
 * strip combining diacritics. The server-side query does the same in SQL via
 * lower(regexp_replace(...)) — keep them aligned if Filipino name conventions
 * change (current rule: case-insensitive, whitespace-collapsed equality).
 */
export function canonicalName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Fields a /api/sales/customers POST handler should accept. Empty strings
 * coerced to null so the GENERATED canonical_phone column doesn't get junk.
 */
export type CustomerDedupInput = {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
};

/**
 * Convenience: returns the canonicalized fields the dedup query expects,
 * matching the SQL form exactly.
 */
export function buildDedupKeys(input: CustomerDedupInput): {
  canonical_phone: string | null;
  email_lower: string | null;
  canonical_full_name: string | null;
} {
  return {
    canonical_phone: canonicalPhone(input.phone),
    email_lower: input.email ? input.email.trim().toLowerCase() || null : null,
    canonical_full_name: canonicalName(`${input.first_name} ${input.last_name}`),
  };
}
