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
type PsgcSubMunicipality = {
  code: string;
  name: string;
  cityCode: string;       // parent city
  regionCode: string;
};
type PsgcBarangay = {
  code: string;
  name: string;
  // PSGC barangays carry a parent code in one of these fields. Order of
  // precedence: subMunicipality (Manila districts) → city → municipality.
  subMunicipalityCode?: string;
  cityCode?: string;
  cityMunicipalityCode?: string;
  municipalityCode?: string;
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

  // 2. Cities + municipalities + sub-municipalities
  // ─────────────────────────────────────────────────────────────────────
  // PSGC has cities, municipalities, AND sub-municipalities (the latter is
  // mostly Manila's 14 districts: Binondo, Tondo I/II, Sampaloc, etc.).
  // Manila's ~897 barangays sit under its sub-municipalities, NOT under
  // Manila City directly. We load all three into ph_cities so the picker
  // shows them as selectable parents for their barangays.
  console.log("[2a/4] cities + municipalities");
  const cities = await fetchJson<PsgcCity[]>("/cities-municipalities/");
  const cityRows = cities.map((c) => ({
    code: c.code,
    region_code: c.regionCode,
    name: c.name,
    city_class: c.type ?? null,
  }));
  await chunkedUpsert("ph_cities", cityRows);

  console.log("[2b/4] sub-municipalities (Manila districts)");
  let subMunis: PsgcSubMunicipality[] = [];
  try {
    subMunis = await fetchJson<PsgcSubMunicipality[]>("/sub-municipalities/");
  } catch (err) {
    console.log("  (skipping — endpoint unavailable:", String(err), ")");
  }
  // Resolve each sub-municipality's region from its parent city. The
  // /sub-municipalities/ endpoint may or may not include regionCode directly,
  // so we look up via cityCode for safety.
  const cityRegionLookup = new Map<string, string>();
  for (const c of cities) cityRegionLookup.set(c.code, c.regionCode);
  const subMuniRows = subMunis
    .map((sm) => {
      const regionCode = sm.regionCode ?? cityRegionLookup.get(sm.cityCode);
      if (!regionCode) return null;
      return {
        code: sm.code,
        region_code: regionCode,
        name: sm.name,
        city_class: "SubMunicipality",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (subMuniRows.length > 0) {
    await chunkedUpsert("ph_cities", subMuniRows);
  }
  console.log(`  added ${subMuniRows.length} sub-municipalities`);

  // 3. Barangays
  // ─────────────────────────────────────────────────────────────────────
  // PSGC code structure is canonical 9 digits: PPCCMMMBBB (region/prov/
  // city/barangay). A barangay's parent city/municipality/sub-municipality
  // code = the barangay's first 6 digits + "000". This holds regardless of
  // what the API populates in the cityCode/municipalityCode/etc fields
  // (psgc.gitlab.io's v1 leaves most of them null and only sets
  // provinceCode/regionCode). API field is a fallback only.
  console.log("[3/4] barangays (this is the slow one — ~42k rows)");
  const barangays = await fetchJson<PsgcBarangay[]>("/barangays/");
  // CRITICAL: paginate. PostgREST defaults to 1000 rows per SELECT, and we
  // have ~1,650 cities (incl. sub-municipalities). Without pagination the
  // set silently caps at 1,000, dropping NCR / CAR / BARMM / R-IX-XIII
  // barangays as false orphans (their parent city codes sort late).
  const validCityCodes = new Set<string>();
  const CITY_PAGE = 1000;
  for (let offset = 0; ; offset += CITY_PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page } = await (admin as any)
      .from("ph_cities")
      .select("code")
      .range(offset, offset + CITY_PAGE - 1);
    const rows = (page ?? []) as Array<{ code: string }>;
    for (const r of rows) validCityCodes.add(r.code);
    if (rows.length < CITY_PAGE) break;
  }
  console.log(`  loaded ${validCityCodes.size} city codes for parent matching`);

  const barangayRows = barangays.map((b) => {
    // PSGC-structured parent: replace last 3 digits with "000".
    const structuralParent =
      b.code.length >= 9 ? b.code.slice(0, 6) + "000" : null;
    // Fallback to API fields if structural code doesn't match a known city
    // (some edge cases in PSGC's coding — e.g., cities with non-standard
    // 6-digit prefixes).
    const apiParent =
      b.subMunicipalityCode ??
      b.cityCode ??
      b.cityMunicipalityCode ??
      b.municipalityCode ??
      null;

    let parentCode = "";
    if (structuralParent && validCityCodes.has(structuralParent)) {
      parentCode = structuralParent;
    } else if (apiParent && validCityCodes.has(apiParent)) {
      parentCode = apiParent;
    }

    return {
      code: b.code,
      city_code: parentCode,
      name: b.name,
      postal_code: null,
    };
  });

  const valid = barangayRows.filter((b) => b.city_code !== "");
  const skipped = barangayRows.length - valid.length;
  if (skipped > 0) {
    console.log(`  (skipping ${skipped} barangays w/ no matching parent city)`);
  }
  await chunkedUpsert("ph_barangays", valid);

  // 4. Postal codes (matched by city/sub-municipality NAME, not PSGC code)
  // ─────────────────────────────────────────────────────────────────────
  // psgc.gitlab.io doesn't expose Phlpost data, so postal_code is null for
  // every barangay from the API. We populate from a NAME-matched lookup
  // so we don't need to memorize exact PSGC codes (which can shift between
  // API versions). Names below match PSGC city/sub-municipality records.
  // Coverage: NCR (Manila districts + 17 cities) + major provincial
  // capitals. Provincial barangays outside this map fall back to manual
  // entry until you bundle broader Phlpost data.
  console.log("[4/4] postal codes (NCR + major cities, name-matched)");
  const postalByCityName: Record<string, string> = {
    // Manila sub-municipalities (these come from /sub-municipalities/)
    "Binondo": "1006",
    "Ermita": "1000",
    "Intramuros": "1002",
    "Malate": "1004",
    "Paco": "1007",
    "Pandacan": "1011",
    "Port Area": "1018",
    "Quiapo": "1001",
    "Sampaloc": "1008",
    "San Andres": "1017",
    "San Miguel": "1005",
    "San Nicolas": "1010",
    "Santa Ana": "1009",
    "Santa Cruz": "1003",
    "Santa Mesa": "1016",
    "Tondo I / I": "1012",
    "Tondo II": "1013",
    // Manila City catch-all (in case the user picks Manila City directly)
    "City of Manila": "1000",
    // NCR cities
    "Quezon City": "1100",
    "City of Mandaluyong": "1550",
    "City of Makati": "1200",
    "Pasay City": "1300",
    "Caloocan City": "1400",
    "City of Malabon": "1440",
    "City of Navotas": "1485",
    "City of Parañaque": "1700",
    "City of Las Piñas": "1740",
    "City of Muntinlupa": "1770",
    "City of Marikina": "1800",
    "Pasig City": "1600",
    "City of Taguig": "1630",
    "Pateros": "1620",
    "City of San Juan": "1500",
    "City of Valenzuela": "1440",
    // Major provincial capitals
    "City of Cebu": "6000",
    "Davao City": "8000",
    "Cagayan De Oro City": "9000",
    "Iloilo City": "5000",
    "City of Iligan": "9200",
    "General Santos City (Dadiangas)": "9500",
    "Bacolod City": "6100",
    "Zamboanga City": "7000",
    "Baguio City": "2600",
  };

  // Fuzzy name matching: PSGC returns city names with various conventions
  // ("City of Manila" vs "Manila" vs "Manila City" vs "MANILA"). Try
  // multiple variants per key + ilike fallback so we don't miss obvious
  // matches just due to formatting differences.
  function nameVariants(name: string): string[] {
    const stripped = name
      .replace(/^City of /i, "")
      .replace(/ City$/i, "")
      .trim();
    return Array.from(
      new Set([
        name,
        stripped,
        `City of ${stripped}`,
        `${stripped} City`,
        `CITY OF ${stripped.toUpperCase()}`,
      ]),
    );
  }

  let postalUpdated = 0;
  let cityMatches = 0;
  for (const [cityName, postal] of Object.entries(postalByCityName)) {
    const variants = nameVariants(cityName);
    // ilike comparisons via .or() — matches case-insensitively.
    const orClause = variants
      .map((v) => `name.ilike.${v.replace(/,/g, "")}`)
      .join(",");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cityRows } = await (admin as any)
      .from("ph_cities")
      .select("code, name")
      .or(orClause);
    if (!cityRows || cityRows.length === 0) continue;
    cityMatches += cityRows.length;
    for (const city of cityRows as Array<{ code: string; name: string }>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error, count } = await (admin as any)
        .from("ph_barangays")
        .update({ postal_code: postal }, { count: "exact" })
        .eq("city_code", city.code);
      if (!error && typeof count === "number") postalUpdated += count;
    }
  }
  console.log(
    `  matched ${cityMatches} cities/sub-municipalities, updated postal on ${postalUpdated} barangays`,
  );

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
  // Also report how many barangays now have postal_code populated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: withPostal } = await (admin as any)
    .from("ph_barangays")
    .select("*", { count: "exact", head: true })
    .not("postal_code", "is", null);
  console.log(`  ph_barangays w/ postal_code: ${withPostal ?? 0}`);
}

main().catch((err) => {
  console.error("\nseed-psgc failed:", err);
  process.exit(1);
});
