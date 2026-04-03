import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { LeavesView } from "./leaves-view";

export default async function LeavesPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) redirect("/login");

  const userIsOps = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);

  return (
    <LeavesView
      currentUserId={currentUser.id}
      currentUserName={`${currentUser.first_name} ${currentUser.last_name}`}
      isOps={userIsOps}
      isManager={userIsManager}
    />
  );
}
