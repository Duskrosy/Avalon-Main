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
        // Persist the chartered-city parent so the picker can fold sub-munis
        // under it (Manila → Sampaloc → barangays).
        parent_city_code: sm.cityCode,
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
  console.log("[4/4] postal codes (all regions, name-matched + region-scoped)");

  // Region-scoped postal map. Keys are "<short_code>::<city name>" so that
  // ambiguous names (Naga in Cam Sur vs Cebu, San Carlos in Pangasinan vs
  // NegOcc, Santiago in Isabela vs Ilocos Sur, etc.) resolve to the right
  // postal code without cross-region bleed. Lookup filters ph_cities by
  // region_code so .or() ilike on a name only matches inside that region.
  type PostalEntry = { region: string; postal: string };
  const postalEntries: Array<PostalEntry & { name: string }> = [
    // ── NCR (Manila districts via /sub-municipalities/) ─────────────
    { region: "NCR", name: "Binondo", postal: "1006" },
    { region: "NCR", name: "Ermita", postal: "1000" },
    { region: "NCR", name: "Intramuros", postal: "1002" },
    { region: "NCR", name: "Malate", postal: "1004" },
    { region: "NCR", name: "Paco", postal: "1007" },
    { region: "NCR", name: "Pandacan", postal: "1011" },
    { region: "NCR", name: "Port Area", postal: "1018" },
    { region: "NCR", name: "Quiapo", postal: "1001" },
    { region: "NCR", name: "Sampaloc", postal: "1008" },
    { region: "NCR", name: "San Andres", postal: "1017" },
    { region: "NCR", name: "San Miguel", postal: "1005" },
    { region: "NCR", name: "San Nicolas", postal: "1010" },
    { region: "NCR", name: "Santa Ana", postal: "1009" },
    { region: "NCR", name: "Santa Cruz", postal: "1003" },
    { region: "NCR", name: "Santa Mesa", postal: "1016" },
    { region: "NCR", name: "Tondo I / I", postal: "1012" },
    { region: "NCR", name: "Tondo II", postal: "1013" },
    { region: "NCR", name: "City of Manila", postal: "1000" },
    // NCR cities
    { region: "NCR", name: "Quezon City", postal: "1100" },
    { region: "NCR", name: "City of Mandaluyong", postal: "1550" },
    { region: "NCR", name: "City of Makati", postal: "1200" },
    { region: "NCR", name: "Pasay City", postal: "1300" },
    { region: "NCR", name: "Caloocan City", postal: "1400" },
    { region: "NCR", name: "City of Malabon", postal: "1440" },
    { region: "NCR", name: "City of Navotas", postal: "1485" },
    { region: "NCR", name: "City of Parañaque", postal: "1700" },
    { region: "NCR", name: "City of Las Piñas", postal: "1740" },
    { region: "NCR", name: "City of Muntinlupa", postal: "1770" },
    { region: "NCR", name: "City of Marikina", postal: "1800" },
    { region: "NCR", name: "Pasig City", postal: "1600" },
    { region: "NCR", name: "City of Taguig", postal: "1630" },
    { region: "NCR", name: "Pateros", postal: "1620" },
    { region: "NCR", name: "City of San Juan", postal: "1500" },
    { region: "NCR", name: "City of Valenzuela", postal: "1440" },
    // ── CAR ─────────────────────────────────────────────────────────
    { region: "CAR", name: "Baguio", postal: "2600" },
    { region: "CAR", name: "Tabuk", postal: "3800" },
    // ── Region I — Ilocos ───────────────────────────────────────────
    { region: "R-I", name: "Laoag", postal: "2900" },
    { region: "R-I", name: "Batac", postal: "2906" },
    { region: "R-I", name: "Vigan", postal: "2700" },
    { region: "R-I", name: "Candon", postal: "2710" },
    { region: "R-I", name: "Dagupan", postal: "2400" },
    { region: "R-I", name: "San Carlos", postal: "2420" }, // Pangasinan
    { region: "R-I", name: "Urdaneta", postal: "2428" },
    { region: "R-I", name: "Alaminos", postal: "2404" },
    { region: "R-I", name: "San Fernando", postal: "2500" }, // La Union
    // ── Region II — Cagayan Valley ──────────────────────────────────
    { region: "R-II", name: "Tuguegarao", postal: "3500" },
    { region: "R-II", name: "Cauayan", postal: "3305" },
    { region: "R-II", name: "Ilagan", postal: "3300" },
    { region: "R-II", name: "Santiago", postal: "3311" }, // Isabela
    // ── Region III — Central Luzon ──────────────────────────────────
    { region: "R-III", name: "Balanga", postal: "2100" },
    { region: "R-III", name: "Malolos", postal: "3000" },
    { region: "R-III", name: "Meycauayan", postal: "3020" },
    { region: "R-III", name: "San Jose Del Monte", postal: "3023" },
    { region: "R-III", name: "Cabanatuan", postal: "3100" },
    { region: "R-III", name: "Gapan", postal: "3105" },
    { region: "R-III", name: "Muñoz", postal: "3119" },
    { region: "R-III", name: "Palayan", postal: "3132" },
    { region: "R-III", name: "San Jose", postal: "3121" }, // Nueva Ecija
    { region: "R-III", name: "Mabalacat", postal: "2010" },
    { region: "R-III", name: "Angeles", postal: "2009" },
    { region: "R-III", name: "Olongapo", postal: "2200" },
    { region: "R-III", name: "San Fernando", postal: "2000" }, // Pampanga
    { region: "R-III", name: "Tarlac", postal: "2300" },
    // ── Region IV-A — CALABARZON ────────────────────────────────────
    { region: "R-IV-A", name: "Bacoor", postal: "4102" },
    { region: "R-IV-A", name: "Cavite", postal: "4100" },
    { region: "R-IV-A", name: "Dasmariñas", postal: "4114" },
    { region: "R-IV-A", name: "Imus", postal: "4103" },
    { region: "R-IV-A", name: "General Trias", postal: "4107" },
    { region: "R-IV-A", name: "Tagaytay", postal: "4120" },
    { region: "R-IV-A", name: "Trece Martires", postal: "4109" },
    { region: "R-IV-A", name: "Calamba", postal: "4027" },
    { region: "R-IV-A", name: "Biñan", postal: "4024" },
    { region: "R-IV-A", name: "San Pedro", postal: "4023" },
    { region: "R-IV-A", name: "Santa Rosa", postal: "4026" },
    { region: "R-IV-A", name: "San Pablo", postal: "4000" },
    { region: "R-IV-A", name: "Cabuyao", postal: "4025" },
    { region: "R-IV-A", name: "Lucena", postal: "4301" },
    { region: "R-IV-A", name: "Antipolo", postal: "1870" },
    { region: "R-IV-A", name: "Batangas", postal: "4200" },
    { region: "R-IV-A", name: "Lipa", postal: "4217" },
    { region: "R-IV-A", name: "Tanauan", postal: "4232" }, // Batangas
    // ── Region IV-B — MIMAROPA ──────────────────────────────────────
    { region: "R-IV-B", name: "Calapan", postal: "5200" },
    { region: "R-IV-B", name: "Puerto Princesa", postal: "5300" },
    // ── Region V — Bicol ────────────────────────────────────────────
    { region: "R-V", name: "Legazpi", postal: "4500" },
    { region: "R-V", name: "Ligao", postal: "4504" },
    { region: "R-V", name: "Tabaco", postal: "4511" },
    { region: "R-V", name: "Naga", postal: "4400" }, // Camarines Sur
    { region: "R-V", name: "Iriga", postal: "4431" },
    { region: "R-V", name: "Sorsogon", postal: "4700" },
    { region: "R-V", name: "Masbate", postal: "5400" },
    // ── Region VI — Western Visayas ─────────────────────────────────
    { region: "R-VI", name: "Iloilo", postal: "5000" },
    { region: "R-VI", name: "Passi", postal: "5037" },
    { region: "R-VI", name: "Bacolod", postal: "6100" },
    { region: "R-VI", name: "Roxas", postal: "5800" }, // Capiz
    { region: "R-VI", name: "Bago", postal: "6101" },
    { region: "R-VI", name: "Cadiz", postal: "6121" },
    { region: "R-VI", name: "Escalante", postal: "6124" },
    { region: "R-VI", name: "Himamaylan", postal: "6108" },
    { region: "R-VI", name: "Kabankalan", postal: "6111" },
    { region: "R-VI", name: "La Carlota", postal: "6130" },
    { region: "R-VI", name: "Sagay", postal: "6122" },
    { region: "R-VI", name: "San Carlos", postal: "6127" }, // NegOcc
    { region: "R-VI", name: "Silay", postal: "6116" },
    { region: "R-VI", name: "Sipalay", postal: "6113" },
    { region: "R-VI", name: "Talisay", postal: "6115" }, // NegOcc
    { region: "R-VI", name: "Victorias", postal: "6119" },
    // ── Region VII — Central Visayas ────────────────────────────────
    { region: "R-VII", name: "Cebu", postal: "6000" },
    { region: "R-VII", name: "Lapu-Lapu", postal: "6015" },
    { region: "R-VII", name: "Mandaue", postal: "6014" },
    { region: "R-VII", name: "Talisay", postal: "6045" }, // Cebu
    { region: "R-VII", name: "Bogo", postal: "6010" },
    { region: "R-VII", name: "Carcar", postal: "6019" },
    { region: "R-VII", name: "Danao", postal: "6004" },
    { region: "R-VII", name: "Naga", postal: "6037" }, // Cebu
    { region: "R-VII", name: "Toledo", postal: "6038" },
    { region: "R-VII", name: "Tagbilaran", postal: "6300" },
    { region: "R-VII", name: "Dumaguete", postal: "6200" },
    { region: "R-VII", name: "Bais", postal: "6206" },
    { region: "R-VII", name: "Bayawan", postal: "6221" },
    { region: "R-VII", name: "Canlaon", postal: "6223" },
    { region: "R-VII", name: "Guihulngan", postal: "6214" },
    { region: "R-VII", name: "Tanjay", postal: "6203" },
    // ── Region VIII — Eastern Visayas ───────────────────────────────
    { region: "R-VIII", name: "Tacloban", postal: "6500" },
    { region: "R-VIII", name: "Ormoc", postal: "6541" },
    { region: "R-VIII", name: "Baybay", postal: "6521" },
    { region: "R-VIII", name: "Calbayog", postal: "6710" },
    { region: "R-VIII", name: "Catbalogan", postal: "6700" },
    { region: "R-VIII", name: "Borongan", postal: "6800" },
    { region: "R-VIII", name: "Maasin", postal: "6600" },
    // ── Region IX — Zamboanga Peninsula ─────────────────────────────
    { region: "R-IX", name: "Zamboanga", postal: "7000" },
    { region: "R-IX", name: "Pagadian", postal: "7016" },
    { region: "R-IX", name: "Dipolog", postal: "7100" },
    { region: "R-IX", name: "Dapitan", postal: "7101" },
    { region: "R-IX", name: "Isabela", postal: "7300" }, // Basilan
    // ── Region X — Northern Mindanao ────────────────────────────────
    { region: "R-X", name: "Cagayan De Oro", postal: "9000" },
    { region: "R-X", name: "Iligan", postal: "9200" },
    { region: "R-X", name: "Malaybalay", postal: "8700" },
    { region: "R-X", name: "Valencia", postal: "8709" },
    { region: "R-X", name: "Gingoog", postal: "9014" },
    { region: "R-X", name: "Oroquieta", postal: "7207" },
    { region: "R-X", name: "Ozamiz", postal: "7200" },
    { region: "R-X", name: "Tangub", postal: "7214" },
    { region: "R-X", name: "El Salvador", postal: "9017" },
    // ── Region XI — Davao ───────────────────────────────────────────
    { region: "R-XI", name: "Davao", postal: "8000" },
    { region: "R-XI", name: "Tagum", postal: "8100" },
    { region: "R-XI", name: "Panabo", postal: "8105" },
    { region: "R-XI", name: "Island Garden City Of Samal", postal: "8119" },
    { region: "R-XI", name: "Digos", postal: "8002" },
    { region: "R-XI", name: "Mati", postal: "8200" },
    // ── Region XII — SOCCSKSARGEN ───────────────────────────────────
    { region: "R-XII", name: "General Santos", postal: "9500" },
    { region: "R-XII", name: "Koronadal", postal: "9506" },
    { region: "R-XII", name: "Tacurong", postal: "9800" },
    { region: "R-XII", name: "Kidapawan", postal: "9400" },
    { region: "R-XII", name: "Cotabato", postal: "9600" },
    // ── Region XIII — Caraga ────────────────────────────────────────
    { region: "R-XIII", name: "Butuan", postal: "8600" },
    { region: "R-XIII", name: "Cabadbaran", postal: "8605" },
    { region: "R-XIII", name: "Bayugan", postal: "8502" },
    { region: "R-XIII", name: "Bislig", postal: "8311" },
    { region: "R-XIII", name: "Tandag", postal: "8300" },
    { region: "R-XIII", name: "Surigao", postal: "8400" },
    // ── BARMM ───────────────────────────────────────────────────────
    { region: "BARMM", name: "Marawi", postal: "9700" },
    { region: "BARMM", name: "Lamitan", postal: "7302" },
  ];

  // Resolve region short_code → 9-digit code (filter for ph_cities query).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: regionLookup } = await (admin as any)
    .from("ph_regions")
    .select("code, short_code");
  const regionCodeByShort = new Map<string, string>(
    ((regionLookup ?? []) as Array<{ code: string; short_code: string }>).map(
      (r) => [r.short_code, r.code],
    ),
  );

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
  let unresolvedRegions = 0;
  for (const entry of postalEntries) {
    const regionCode = regionCodeByShort.get(entry.region);
    if (!regionCode) {
      unresolvedRegions++;
      continue;
    }
    const variants = nameVariants(entry.name);
    // ilike comparisons via .or() — matches case-insensitively. Constrained
    // to the entry's region so "Naga" only matches Naga in R-V (Cam Sur),
    // not Naga in R-VII (Cebu) — and vice versa.
    const orClause = variants
      .map((v) => `name.ilike.${v.replace(/,/g, "")}`)
      .join(",");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cityRows } = await (admin as any)
      .from("ph_cities")
      .select("code, name")
      .eq("region_code", regionCode)
      .or(orClause);
    if (!cityRows || cityRows.length === 0) continue;
    cityMatches += cityRows.length;
    for (const city of cityRows as Array<{ code: string; name: string }>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error, count } = await (admin as any)
        .from("ph_barangays")
        .update({ postal_code: entry.postal }, { count: "exact" })
        .eq("city_code", city.code);
      if (!error && typeof count === "number") postalUpdated += count;
    }
  }
  if (unresolvedRegions > 0) {
    console.log(
      `  warn: ${unresolvedRegions} entries had unknown region short_codes`,
    );
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
