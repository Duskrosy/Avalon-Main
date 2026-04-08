import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AccountSettingsView } from "./settings-view";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const u = user as unknown as Record<string, unknown>;

  return (
    <AccountSettingsView
      userId={user.id}
      initialProfile={{
        first_name:  user.first_name,
        last_name:   user.last_name,
        avatar_url:  user.avatar_url ?? null,
        bio:         u.bio       as string | null ?? null,
        job_title:   u.job_title as string | null ?? null,
        fun_fact:    u.fun_fact  as string | null ?? null,
      }}
      allowPasswordChange={(u.allow_password_change as boolean | null) ?? true}
      requireMfa={(u.require_mfa as boolean | null) ?? true}
      mustChangePassword={(u.must_change_password as boolean | null) ?? false}
    />
  );
}
