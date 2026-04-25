// Seed PSGC reference tables from psgc.gitlab.io.
//
// Run AFTER migration 00087 applies:
//   bun scripts/sales/seed-psgc.ts
//
// Idempotent — uses ON CONFLICT DO UPDATE on every row, so re-running just
// refreshes the dataset. Safe to schedule yearly (PSGC updates ~once/year).
//
// Source: https://psgc.gitlab.io — free public API, no auth, no rate limits
// for the bulk endpoints used here. ~5MB total payload, ~30-60s wall clock
// depending on network.
//
// Tables seeded (created by 00087_psgc_address_phase15.sql):
//   ph_regions    (~17 rows)
//   ph_cities     (~1,500 rows)
//   ph_barangays  (~42,000 rows)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local (bun doesn't auto-load it).
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* ignore */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

// psgc.gitlab.io response shapes
type PsgcRegion = {
  code: string;
  name: string;
  regionName: string;
};
type PsgcCity = {
  code: string;
  name: string;
  regionCode: string;
  type: string; // "City" | "Mun" | "SubMun"
};
type PsgcBarangay = {
  code: string;
  name: string;
  cityCode?: string;
  municipalityCode?: string;
  // PSGC barangays come from either cities or municipalities; one of these
  // will be the parent code we want to FK on.
};

const BASE = "https://psgc.gitlab.io/api";

// Map PSGC long region code (e.g. "130000000") to short label (e.g. "NCR").
// PSGC region codes are stable; this dictionary is small enough to hardcode.
const REGION_SHORT: Record<string, string> = {
  "010000000": "R-I",
  "020000000": "R-II",
  "030000000": "R-III",
  "040000000": "R-IV-A",
  "170000000": "R-IV-B",
  "050000000": "R-V",
  "060000000": "R-VI",
  "070000000": "R-VII",
  "080000000": "R-VIII",
  "090000000": "R-IX",
  "100000000": "R-X",
  "110000000": "R-XI",
  "120000000": "R-XII",
  "130000000": "NCR",
  "140000000": "CAR",
  "150000000": "BARMM",
  "160000000": "R-XIII",
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`PSGC fetch ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function chunkedUpsert(
  table: string,
  rows: Record<string, unknown>[],
  chunk = 500,
) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from(table).upsert(slice, {
      onConflict: "code",
    });
    if (error) {
      console.error(`upsert ${table} ${i}-${i + slice.length} failed:`, error.message);
      process.exit(1);
    }
    process.stdout.write(`\r  ${table}: ${Math.min(i + chunk, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log("Seeding PSGC reference tables from psgc.gitlab.io...\n");

  // 1. Regions
  console.log("[1/3] regions");
  const regions = await fetchJson<PsgcRegion[]>("/regions/");
  const regionRows = regions.map((r) => ({
    code: r.code,
    short_code: REGION_SHORT[r.code] ?? r.code,
    name: r.regionName ?? r.name,
  }));
  await chunkedUpsert("ph_regions", regionRows);

  // 2. Cities + municipalities (combined endpoint)
  console.log("[2/3] cities + municipalities");
  const cities = await fetchJson<PsgcCity[]>("/cities-municipalities/");
  const cityRows = cities.map((c) => ({
    code: c.code,
    region_code: c.regionCode,
    name: c.name,
    city_class: c.type ?? null,
  }));
  await chunkedUpsert("ph_cities", cityRows);

  // 3. Barangays
  console.log("[3/3] barangays (this is the slow one — ~42k rows)");
  const barangays = await fetchJson<PsgcBarangay[]>("/barangays/");
  const barangayRows = barangays.map((b) => {
    const cityCode = b.cityCode ?? b.municipalityCode ?? "";
    return {
      code: b.code,
      city_code: cityCode,
      name: b.name,
      postal_code: null,
    };
  });
  // Filter out barangays whose parent city/municipality wasn't in the cities
  // table (PSGC has a few orphaned barangays under sub-municipalities the
  // /cities-municipalities/ endpoint doesn't include). We skip those rather
  // than fail the FK.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingCities } = await (admin as any)
    .from("ph_cities")
    .select("code");
  const validCityCodes = new Set(
    (existingCities ?? []).map((c: { code: string }) => c.code),
  );
  const valid = barangayRows.filter((b) => validCityCodes.has(b.city_code));
  const skipped = barangayRows.length - valid.length;
  if (skipped > 0) {
    console.log(`  (skipping ${skipped} orphaned barangays w/o matching city)`);
  }
  await chunkedUpsert("ph_barangays", valid);

  console.log("\nDone. Counts:");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = ["ph_regions", "ph_cities", "ph_barangays"];
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (admin as any)
      .from(t)
      .select("*", { count: "exact", head: true });
    console.log(`  ${t}: ${count ?? 0}`);
  }
}

main().catch((err) => {
  console.error("\nseed-psgc failed:", err);
  process.exit(1);
});
