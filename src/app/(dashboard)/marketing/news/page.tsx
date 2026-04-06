import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function MarketingNewsPage() {
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
    if (!["marketing", "creatives"].includes(dept?.slug ?? "")) redirect("/");
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">News Feed</h1>
      <p className="text-sm text-gray-500 mb-8">
        RSS news aggregator. Requires migration 00017 to be applied.
      </p>
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-16 text-center">
        <p className="text-4xl mb-4">📰</p>
        <p className="text-sm font-medium text-gray-700">Coming soon</p>
        <p className="text-xs text-gray-400 mt-1">
          Industry news and trends aggregated from RSS feeds.
        </p>
      </div>
    </div>
  );
}
