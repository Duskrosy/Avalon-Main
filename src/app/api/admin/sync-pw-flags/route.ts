import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// POST /api/admin/sync-pw-flags
// One-time endpoint: syncs must_change_password from profiles table to
// Supabase app_metadata for all users who have the flag set in profiles
// but missing in app_metadata. OPS only.
export async function POST() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find all profiles with must_change_password = true
  const { data: flaggedProfiles, error: queryError } = await admin
    .from("profiles")
    .select("id, email, must_change_password")
    .eq("must_change_password", true);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  if (!flaggedProfiles || flaggedProfiles.length === 0) {
    return NextResponse.json({ message: "No users with must_change_password flag", synced: 0 });
  }

  // Sync each to app_metadata
  const results: { id: string; email: string; status: string }[] = [];

  for (const profile of flaggedProfiles) {
    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
      app_metadata: { must_change_password: true },
    });

    results.push({
      id: profile.id,
      email: profile.email,
      status: updateError ? `error: ${updateError.message}` : "synced",
    });
  }

  const synced = results.filter((r) => r.status === "synced").length;
  const failed = results.filter((r) => r.status !== "synced").length;

  return NextResponse.json({
    message: `Synced ${synced} users, ${failed} failed`,
    synced,
    failed,
    results,
  });
}
