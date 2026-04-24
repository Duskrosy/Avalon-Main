import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { loadCampaignsWindow } from "@/lib/ad-ops/campaigns-window";

// Thin wrapper around loadCampaignsWindow — the same helper is used directly
// by the /ad-ops/campaigns server component so the table paints on first byte.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preset = req.nextUrl.searchParams.get("preset");
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");

  try {
    const payload = await loadCampaignsWindow(preset, startParam, endParam);
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
