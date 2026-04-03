import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { MemoDetailView } from "./memo-detail-view";

export default async function MemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: memo, error } = await supabase
    .from("memos")
    .select(`
      id, title, content, created_at, updated_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(first_name, last_name),
      memo_signatures(id, user_id, signed_at,
        profile:profiles!user_id(first_name, last_name))
    `)
    .eq("id", id)
    .single();

  if (error || !memo) notFound();

  // Get total active staff count for signature progress
  const { count: totalStaff } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .is("deleted_at", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signatures = (memo.memo_signatures as any[]) ?? [];
  const hasSigned = signatures.some((s) => s.user_id === currentUser.id);

  return (
    <MemoDetailView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      memo={memo as any}
      signatures={signatures}
      hasSigned={hasSigned}
      totalStaff={totalStaff ?? 0}
      currentUserId={currentUser.id}
      canDelete={isOps(currentUser)}
    />
  );
}
