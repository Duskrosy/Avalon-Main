import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/ph-address?level=region|city|barangay&parent=CODE ───────
//
// Cascading PSGC dropdown data for the Customer step of the Create Order
// drawer. Single endpoint with a `level` selector keeps the round-trip
// surface small; clients fetch level=region first (no parent), then
// level=city when a region is picked, then level=barangay when a city is.
//
// Reads from local ph_regions / ph_cities / ph_barangays tables (seeded by
// scripts/sales/seed-psgc.ts after migration 00087).

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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  }

  if (level === "city") {
    if (!parent) {
      return NextResponse.json({ error: "parent (region code) required" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (admin as any)
      .from("ph_cities")
      .select("code, name, city_class")
      .eq("region_code", parent)
      .order("name")
      .limit(2000);
    if (search.length >= 2) q = q.ilike("name", `%${search}%`);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  }

  if (level === "barangay") {
    if (!parent) {
      return NextResponse.json({ error: "parent (city code) required" }, { status: 400 });
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  }

  return NextResponse.json(
    { error: "level must be region, city, or barangay" },
    { status: 400 },
  );
}
