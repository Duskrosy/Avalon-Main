import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/ph-address?level=region|city|submunicipality|barangay ───
//
// Cascading PSGC dropdown data for the Customer step of the Create Order
// drawer. Single endpoint with a `level` selector keeps the round-trip
// surface small.
//
// Modes:
//   level=region                       → all regions
//   level=city&parent=<region_code>    → top-level cities/munis in that region
//                                        (sub-munis excluded; folded under
//                                        their parent city via `has_submunicipalities`)
//   level=city&q=<search>              → global city search (cities + sub-munis)
//                                        across all regions; each row carries
//                                        region_code + parent_city_code so the
//                                        picker can auto-fill the cascade
//   level=submunicipality&parent=<city>→ sub-munis under that chartered city
//                                        (Manila → Sampaloc, Tondo I, …)
//   level=barangay&parent=<city|submuni>→ barangays under the immediate parent
//                                        (Manila's barangays sit under its
//                                        sub-munis, not under Manila itself)
//
// Reads from local ph_regions / ph_cities / ph_barangays tables (seeded by
// scripts/sales/seed-psgc.ts after migrations 00087 + 00088).

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const level = req.nextUrl.searchParams.get("level");
  const parent = req.nextUrl.searchParams.get("parent");
  const search = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const admin = createAdminClient();

  if (level === "region") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("ph_regions")
      .select("code, short_code, name")
      .order("short_code");
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  }

  if (level === "city") {
    // Global-search mode: no parent given. Include sub-munis so picking
    // "Sampaloc" can fill the whole region/city/submuni cascade. Returns
    // up to 50 results, ordered by name.
    if (!parent) {
      if (search.length < 2) {
        return NextResponse.json({ items: [] });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from("ph_cities")
        .select("code, name, city_class, region_code, parent_city_code")
        .ilike("name", `%${search}%`)
        .order("name")
        .limit(50);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ items: data ?? [] });
    }

    // Region-scoped mode: only top-level cities/munis (sub-munis excluded —
    // they're reached via the dedicated submunicipality level).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (admin as any)
      .from("ph_cities")
      .select("code, name, city_class")
      .eq("region_code", parent)
      .is("parent_city_code", null)
      .order("name")
      .limit(2000);
    if (search.length >= 2) q = q.ilike("name", `%${search}%`);
    const { data: cities, error } = await q;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Annotate which cities have sub-munis so the UI can pre-render the
    // sub-muni step without an extra round-trip on pick. Cheap join via
    // DISTINCT on parent_city_code.
    const cityCodes = (cities ?? []).map((c: { code: string }) => c.code);
    let parentCodesSet = new Set<string>();
    if (cityCodes.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: parentRows } = await (admin as any)
        .from("ph_cities")
        .select("parent_city_code")
        .in("parent_city_code", cityCodes);
      parentCodesSet = new Set(
        ((parentRows ?? []) as Array<{ parent_city_code: string }>)
          .map((r) => r.parent_city_code)
          .filter(Boolean),
      );
    }
    const items = (cities ?? []).map(
      (c: { code: string; name: string; city_class: string | null }) => ({
        ...c,
        has_submunicipalities: parentCodesSet.has(c.code),
      }),
    );
    return NextResponse.json({ items });
  }

  if (level === "submunicipality") {
    if (!parent) {
      return NextResponse.json(
        { error: "parent (city code) required" },
        { status: 400 },
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (admin as any)
      .from("ph_cities")
      .select("code, name, region_code, parent_city_code")
      .eq("parent_city_code", parent)
      .order("name")
      .limit(2000);
    if (search.length >= 2) q = q.ilike("name", `%${search}%`);
    const { data, error } = await q;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  }

  if (level === "barangay") {
    if (!parent) {
      return NextResponse.json(
        { error: "parent (city code) required" },
        { status: 400 },
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (admin as any)
      .from("ph_barangays")
      .select("code, name, postal_code")
      .eq("city_code", parent)
      .order("name")
      .limit(2000);
    if (search.length >= 2) q = q.ilike("name", `%${search}%`);
    const { data, error } = await q;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  }

  return NextResponse.json(
    { error: "level must be region, city, submunicipality, or barangay" },
    { status: 400 },
  );
}
