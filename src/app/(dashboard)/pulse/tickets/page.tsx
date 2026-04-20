import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { TicketsView } from "./tickets-view";

export type PublicTicket = {
  id: string;
  category: string;
  status: string;
  priority: "low" | "medium" | "high" | "urgent";
  created_at: string;
  updated_at: string | null;
  department_id: string | null;
  body: string;
  merged_into_id: string | null;
  user_id: string | null; // redacted to null unless OPS or self
  comment_count: number;
};

export default async function PulseTicketsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const [{ data: tickets }, { data: departments }] = await Promise.all([
    supabase
      .from("feedback_public")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <TicketsView
      initialTickets={(tickets ?? []) as PublicTicket[]}
      departments={departments ?? []}
      currentUserId={user.id}
      currentUserIsOps={isOps(user)}
    />
  );
}
