// Resolves a Philippine province NAME for Shopify's address.province
// field given the structured PSGC fields Avalon stores on customers.
//
// Shopify validates province against the country's real province list
// (Cebu, Bulacan, Abra, etc.). Sending the PSA region label ("Region V",
// "NCR") returns 422 ("addresses.province: is invalid"). The resolver
// here drives off ph_cities.province_code → ph_provinces.name with a
// few overrides for known PSGC-vs-Shopify name mismatches.

const NCR_REGION_CODE = "130000000";

// PSGC name → Shopify name overrides. Update as new mismatches surface.
//   Davao de Oro: PSGC renamed Compostela Valley in 2019; Shopify may
//     still list the old name.
//   Maguindanao del Norte / del Sur: split from Maguindanao in 2022;
//     Shopify likely has only the legacy "Maguindanao".
const PROVINCE_NAME_OVERRIDES: Record<string, string> = {
  "Davao de Oro": "Compostela Valley",
  "Maguindanao del Norte": "Maguindanao",
  "Maguindanao del Sur": "Maguindanao",
};

function applyOverride(psgcName: string): string {
  return PROVINCE_NAME_OVERRIDES[psgcName] ?? psgcName;
}

/**
 * Look up a province name from a PSGC city code. Returns null when
 * the resolution doesn't yield a usable Shopify-acceptable name (e.g.
 * the code is missing, or the row has no province_code, or the city
 * is in NCR — caller handles NCR separately).
 *
 * Uses ph_cities.province_code → ph_provinces.name. NCR cities have
 * province_code=NULL by design; the caller passes their region_code
 * to get "Metro Manila" back via resolveShopifyProvinceName().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveShopifyProvinceName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  input: { city_code?: string | null; region_code?: string | null },
): Promise<string | null> {
  // NCR fast-path — no province in PSGC, but Shopify accepts "Metro Manila".
  if (input.region_code === NCR_REGION_CODE) {
    return "Metro Manila";
  }
  if (!input.city_code) return null;
  const { data: city } = await admin
    .from("ph_cities")
    .select("province_code, region_code")
    .eq("code", input.city_code)
    .maybeSingle();
  const cityRow = city as {
    province_code?: string | null;
    region_code?: string | null;
  } | null;
  if (cityRow?.region_code === NCR_REGION_CODE) {
    return "Metro Manila";
  }
  if (!cityRow?.province_code) return null;
  const { data: province } = await admin
    .from("ph_provinces")
    .select("name")
    .eq("code", cityRow.province_code)
    .maybeSingle();
  const name = (province as { name?: string } | null)?.name;
  return name ? applyOverride(name) : null;
}
