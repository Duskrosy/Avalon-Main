import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import TeamActivityView from "./team-activity-view";

export default async function TeamActivityPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  if (!isManagerOrAbove(user)) redirect("/");

  return (
    <TeamActivityView
      currentUser={{
        id: user.id,
        department_id: user.department_id,
        department_name: user.department?.name ?? "Department",
      }}
    />
  );
}
