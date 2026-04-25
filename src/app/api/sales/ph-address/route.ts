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
    // up to 50 results, ordered by name. Each row carries the
    // Shopify-acceptable province name (joined from ph_provinces; or
    // "Metro Manila" for NCR cities which have province_code NULL).
    if (!parent) {
      if (search.length < 2) {
        return NextResponse.json({ items: [] });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from("ph_cities")
        .select(
          "code, name, city_class, region_code, parent_city_code, province_code",
        )
        .ilike("name", `%${search}%`)
        .order("name")
        .limit(50);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      const rows = (data ?? []) as Array<{
        code: string;
        name: string;
        city_class: string | null;
        region_code: string;
        parent_city_code: string | null;
        province_code: string | null;
      }>;
      const parentCodes = [
        ...new Set(rows.map((r) => r.parent_city_code).filter(Boolean)),
      ] as string[];
      const provinceCodes = [
        ...new Set(rows.map((r) => r.province_code).filter(Boolean)),
      ] as string[];
      // Sub-muni rows have province_code NULL — they inherit from parent
      // city, so we also need to lookup parents' province_codes.
      const subMuniParentCodes = rows
        .filter((r) => r.parent_city_code && !r.province_code)
        .map((r) => r.parent_city_code as string);
      const allCodesToLook = [
        ...new Set([...parentCodes, ...subMuniParentCodes]),
      ];
      const parentInfo = new Map<
        string,
        { name: string; province_code: string | null; region_code: string }
      >();
      if (allCodesToLook.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parents } = await (admin as any)
          .from("ph_cities")
          .select("code, name, province_code, region_code")
          .in("code", allCodesToLook);
        for (const p of (parents ?? []) as Array<{
          code: string;
          name: string;
          province_code: string | null;
          region_code: string;
        }>) {
          parentInfo.set(p.code, {
            name: p.name,
            province_code: p.province_code,
            region_code: p.region_code,
          });
        }
      }
      const allProvinceCodes = [
        ...new Set([
          ...provinceCodes,
          ...Array.from(parentInfo.values())
            .map((p) => p.province_code)
            .filter(Boolean) as string[],
        ]),
      ];
      const provinceNames = new Map<string, string>();
      if (allProvinceCodes.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: provs } = await (admin as any)
          .from("ph_provinces")
          .select("code, name")
          .in("code", allProvinceCodes);
        for (const p of (provs ?? []) as Array<{
          code: string;
          name: string;
        }>) {
          provinceNames.set(p.code, p.name);
        }
      }
      const items = rows.map((r) => {
        // Resolve province name: own province_code → else parent's →
        // else NCR override → else null.
        let provinceName: string | null = null;
        if (r.province_code) {
          provinceName = provinceNames.get(r.province_code) ?? null;
        } else if (r.parent_city_code) {
          const parent = parentInfo.get(r.parent_city_code);
          if (parent?.province_code) {
            provinceName = provinceNames.get(parent.province_code) ?? null;
          } else if (parent?.region_code === "130000000") {
            provinceName = "Metro Manila";
          }
        }
        if (!provinceName && r.region_code === "130000000") {
          provinceName = "Metro Manila";
        }
        return {
          ...r,
          parent_city_name: r.parent_city_code
            ? (parentInfo.get(r.parent_city_code)?.name ?? null)
            : null,
          province_name: provinceName,
        };
      });
      return NextResponse.json({ items });
    }

    // Region-scoped mode: only top-level cities/munis (sub-munis excluded —
    // they're reached via the dedicated submunicipality level).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (admin as any)
      .from("ph_cities")
      .select("code, name, city_class, province_code, region_code")
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
    // Resolve Shopify-acceptable province names for each city in one
    // batched lookup against ph_provinces.
    const provinceCodes = [
      ...new Set(
        (cities ?? [])
          .map((c: { province_code: string | null }) => c.province_code)
          .filter(Boolean),
      ),
    ] as string[];
    const provinceNames = new Map<string, string>();
    if (provinceCodes.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: provs } = await (admin as any)
        .from("ph_provinces")
        .select("code, name")
        .in("code", provinceCodes);
      for (const p of (provs ?? []) as Array<{ code: string; name: string }>) {
        provinceNames.set(p.code, p.name);
      }
    }
    const items = (cities ?? []).map(
      (c: {
        code: string;
        name: string;
        city_class: string | null;
        province_code: string | null;
        region_code: string;
      }) => ({
        ...c,
        has_submunicipalities: parentCodesSet.has(c.code),
        // Province name = ph_provinces.name, or "Metro Manila" for NCR.
        // Frontend uses this to seed the editable Shopify Region field.
        province_name: c.province_code
          ? (provinceNames.get(c.province_code) ?? null)
          : c.region_code === "130000000"
            ? "Metro Manila"
            : null,
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

    // Sub-munis inherit the chartered city's province. Resolve once for
    // the whole list (one parent → one province lookup).
    let provinceName: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: parentCity } = await (admin as any)
      .from("ph_cities")
      .select("province_code, region_code")
      .eq("code", parent)
      .maybeSingle();
    const pc = parentCity as {
      province_code?: string | null;
      region_code?: string;
    } | null;
    if (pc?.province_code) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prov } = await (admin as any)
        .from("ph_provinces")
        .select("name")
        .eq("code", pc.province_code)
        .maybeSingle();
      provinceName = (prov as { name?: string } | null)?.name ?? null;
    }
    if (!provinceName && pc?.region_code === "130000000") {
      provinceName = "Metro Manila";
    }
    const items = ((data ?? []) as Array<Record<string, unknown>>).map(
      (r) => ({ ...r, province_name: provinceName }),
    );
    return NextResponse.json({ items });
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
