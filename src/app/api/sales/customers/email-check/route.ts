import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = req.nextUrl.searchParams.get("email")?.trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, reason: "Invalid email format" });
  }
  const domain = email.split("@")[1];
  if (!domain) {
    return NextResponse.json({ ok: false, reason: "No domain" });
  }
  try {
    const records = await dns.resolveMx(domain);
    if (records.length === 0) {
      return NextResponse.json({ ok: false, reason: `No MX records for '${domain}'` });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: `Couldn't resolve domain '${domain}'` });
  }
}

export const runtime = "nodejs";
