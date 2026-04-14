import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { RemittanceView } from "./remittance-view";

export default async function RemittancePage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: batches } = await admin
    .from("remittance_batches")
    .select(`
      *,
      creator:profiles!created_by(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false });

  return (
    <RemittanceView
      initialBatches={batches ?? []}
      currentUserId={user.id}
    />
  );
}
