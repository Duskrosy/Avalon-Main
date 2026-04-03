import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { LearningView } from "./learning-view";

export default async function LearningPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const [{ data: materials }, { data: departments }, { data: completions }] = await Promise.all([
    supabase
      .from("learning_materials")
      .select(`
        id, title, description, material_type, file_url, external_link, sort_order, created_at,
        department:departments(id, name, slug),
        created_by_profile:profiles!created_by(first_name, last_name)
      `)
      .order("sort_order")
      .order("created_at"),
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
    supabase
      .from("learning_completions")
      .select("material_id")
      .eq("user_id", currentUser.id),
  ]);

  // Generate signed URLs for file-based materials
  const admin = createAdminClient();
  const completedIds = new Set((completions ?? []).map((c) => c.material_id));

  const materialsWithUrls = await Promise.all(
    (materials ?? []).map(async (m) => {
      let signedUrl: string | null = null;
      if (m.file_url) {
        const { data: signed } = await admin.storage
          .from("learning")
          .createSignedUrl(m.file_url, 3600);
        signedUrl = signed?.signedUrl ?? null;
      }
      return { ...m, signed_url: signedUrl, completed: completedIds.has(m.id) };
    })
  );

  return (
    <LearningView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      materials={materialsWithUrls as any}
      departments={departments ?? []}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
