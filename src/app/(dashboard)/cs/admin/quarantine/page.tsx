// src/app/(dashboard)/cs/admin/quarantine/page.tsx
//
// Thin server component — handles auth redirect then hands off to the
// interactive client view. The view fetches data client-side so the
// page stays fresh without ISR complexity.

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { QuarantineView } from "./quarantine-view";

export default async function QuarantinePage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  // Non-admin users will get 403 from the API — the view handles it gracefully.
  return <QuarantineView />;
}
