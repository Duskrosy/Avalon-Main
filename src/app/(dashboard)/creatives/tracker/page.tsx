import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { TrackerView } from "./tracker-view";

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; group?: string; platform?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  if (!ops) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", currentUser.department_id ?? "")
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  // Default month = current UTC month (YYYY-MM), passed as initial value so
  // the client hydrates without a wasted fetch + URL rewrite.
  const now = new Date();
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const initialMonth = sp?.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : defaultMonth;
  const initialGroup = sp?.group ?? "";
  const initialPlatform = sp?.platform ?? "";

  return (
    <div className="max-w-6xl mx-auto">
      <TrackerView
        initialMonth={initialMonth}
        initialGroup={initialGroup}
        initialPlatform={initialPlatform}
      />
    </div>
  );
}
