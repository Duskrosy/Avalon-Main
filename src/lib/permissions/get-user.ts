import { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWithRelations } from "@/types/database";

export async function getCurrentUser(
  supabase: SupabaseClient
): Promise<ProfileWithRelations | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      `
      *,
      department:departments(*),
      role:roles(*)
    `
    )
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;

  return profile as unknown as ProfileWithRelations;
}

// OPS = tier 0 (super_admin) or tier 1 (ops_admin)
export function isOps(profile: ProfileWithRelations): boolean {
  return profile.role.tier <= 1;
}

// Manager or above = tier 0, 1, or 2
export function isManagerOrAbove(profile: ProfileWithRelations): boolean {
  return profile.role.tier <= 2;
}

export function getUserTier(profile: ProfileWithRelations): number {
  return profile.role.tier;
}
