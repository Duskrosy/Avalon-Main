import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

export default async function ExecDevelopmentPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  return (
    <div className="text-center py-12">
      <p className="text-sm text-[var(--color-text-tertiary)]">Development progress will appear here once feature goals are set up in Admin → Development.</p>
    </div>
  );
}
