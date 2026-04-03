import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { NotificationsList } from "./notifications-list";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, message, link_url, is_read, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return <NotificationsList initialNotifications={notifications ?? []} />;
}
