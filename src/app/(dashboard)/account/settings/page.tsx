import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AccountSettingsView } from "./settings-view";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  return (
    <AccountSettingsView
      userId={user.id}
      initialProfile={{
        first_name:  user.first_name,
        last_name:   user.last_name,
        avatar_url:  user.avatar_url ?? null,
        bio:         (user as Record<string, unknown>).bio as string | null ?? null,
        job_title:   (user as Record<string, unknown>).job_title as string | null ?? null,
        fun_fact:    (user as Record<string, unknown>).fun_fact as string | null ?? null,
      }}
    />
  );
}
