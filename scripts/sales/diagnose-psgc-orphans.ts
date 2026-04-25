// Diagnostic: fetch barangays from psgc.gitlab.io and show which regions
// have barangay-parent codes that DON'T match a city/sub-municipality
// already in the DB. Run after seed-psgc.ts to figure out which parents
// are missing.
//
// Run: bun scripts/sales/diagnose-psgc-orphans.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

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
const admin = createClient(url, key, { auth: { persistSession: false } });

type Barangay = {
  code: string;
  name: string;
  regionCode?: string;
  provinceCode?: string;
  cityCode?: string | null;
  municipalityCode?: string | null;
  subMunicipalityCode?: string | null;
};

async function main() {
  console.log("Fetching barangays from psgc.gitlab.io...");
  const res = await fetch("https://psgc.gitlab.io/api/barangays/");
  const all = (await res.json()) as Barangay[];
  console.log(`Total barangays from API: ${all.length}`);

  // CRITICAL: paginate — PostgREST caps SELECT at 1000 rows by default,
  // and ph_cities has ~1,650 rows (cities + sub-municipalities). Without
  // pagination NCR / CAR / BARMM cities never enter the set.
  const cities = new Set<string>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page } = await (admin as any)
      .from("ph_cities")
      .select("code")
      .range(offset, offset + PAGE - 1);
    const rows = (page ?? []) as Array<{ code: string }>;
    for (const r of rows) cities.add(r.code);
    if (rows.length < PAGE) break;
  }
  console.log(`Total cities/sub-munis in DB: ${cities.size}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: regionRows } = await (admin as any)
    .from("ph_regions")
    .select("code, name, short_code");
  const regionLookup = new Map<string, string>();
  for (const r of (regionRows ?? []) as Array<{
    code: string;
    name: string;
    short_code: string;
  }>) {
    regionLookup.set(r.code, `${r.short_code} (${r.name})`);
  }

  let matched = 0;
  let orphan = 0;
  // Group orphans by region
  const orphansByRegion = new Map<
    string,
    { count: number; samples: Barangay[]; parentCodes: Set<string> }
  >();

  for (const b of all) {
    const structural = b.code.length >= 9 ? b.code.slice(0, 6) + "000" : null;
    const apiParent =
      b.subMunicipalityCode ||
      b.cityCode ||
      b.municipalityCode ||
      null;
    const parent =
      structural && cities.has(structural)
        ? structural
        : apiParent && cities.has(apiParent)
          ? apiParent
          : null;
    if (parent) {
      matched++;
    } else {
      orphan++;
      const region = b.regionCode ?? "unknown";
      const entry = orphansByRegion.get(region) ?? {
        count: 0,
        samples: [],
        parentCodes: new Set<string>(),
      };
      entry.count++;
      if (entry.samples.length < 3) entry.samples.push(b);
      if (structural) entry.parentCodes.add(structural);
      orphansByRegion.set(region, entry);
    }
  }

  console.log(`\nMatched: ${matched} / Orphans: ${orphan}\n`);
  console.log("Orphan distribution by region:");
  const sorted = [...orphansByRegion.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );
  for (const [regionCode, entry] of sorted) {
    const regionLabel = regionLookup.get(regionCode) ?? regionCode;
    console.log(`\n${regionLabel}: ${entry.count} orphans`);
    console.log(
      `  Distinct parent codes attempted: ${entry.parentCodes.size}`,
    );
    console.log("  Sample orphans:");
    for (const s of entry.samples) {
      console.log(
        `    code=${s.code} name="${s.name}" province=${s.provinceCode ?? "-"} city=${s.cityCode ?? "-"} muni=${s.municipalityCode ?? "-"} subMuni=${s.subMunicipalityCode ?? "-"}`,
      );
    }
    // Show which structural parent codes are most common among orphans
    const sampleParents = [...entry.parentCodes].slice(0, 5);
    console.log(`  Sample structural parents (not in ph_cities): ${sampleParents.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("\ndiagnose-psgc-orphans failed:", err);
  process.exit(1);
});
