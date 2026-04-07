import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/permissions/nav?userId=xxx
// Returns all nav_page_overrides for a specific user. OPS only.
export async function GET(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as ReturnType<typeof createAdminClient>)
    .from("nav_page_overrides")
    .select("nav_slug, visible")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ overrides: data ?? [] });
}

// POST /api/permissions/nav
// Upserts or removes nav overrides for one or many users. OPS only.
//
// Body: {
//   userIds: string[],
//   changes: { slug: string, visible: boolean | null }[]
// }
// visible = true  → Grant  (force show)
// visible = false → Deny   (force hide)
// visible = null  → Remove override (revert to inherited default)
export async function POST(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { userIds, changes } = body as {
    userIds: string[];
    changes: { slug: string; visible: boolean | null }[];
  };

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "userIds must be a non-empty array" }, { status: 400 });
  }
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: "changes must be a non-empty array" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Split changes into upserts and removals
  const toUpsert = changes.filter((c) => c.visible !== null);
  const toRemove = changes.filter((c) => c.visible === null).map((c) => c.slug);

  const errors: string[] = [];

  // Upsert rows
  if (toUpsert.length > 0) {
    const rows = userIds.flatMap((userId) =>
      toUpsert.map((c) => ({
        user_id: userId,
        nav_slug: c.slug,
        visible: c.visible as boolean,
        created_by: currentUser.id,
      }))
    );

    const { error } = await (admin as ReturnType<typeof createAdminClient>)
      .from("nav_page_overrides")
      .upsert(rows, { onConflict: "user_id,nav_slug" });

    if (error) errors.push(`upsert: ${error.message}`);
  }

  // Delete removed overrides for all target users
  if (toRemove.length > 0) {
    for (const userId of userIds) {
      const { error } = await (admin as ReturnType<typeof createAdminClient>)
        .from("nav_page_overrides")
        .delete()
        .eq("user_id", userId)
        .in("nav_slug", toRemove);

      if (error) errors.push(`delete(${userId}): ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
