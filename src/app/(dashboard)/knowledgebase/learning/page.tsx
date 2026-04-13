import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { LearningView } from "./learning-view";

export default async function LearningPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const [{ data: materials }, { data: departments }, { data: completions }, { data: views }] = await Promise.all([
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
    supabase
      .from("learning_views")
      .select("material_id, viewed_at, duration_s")
      .eq("user_id", currentUser.id),
  ]);

  const admin = createAdminClient();
  const completedIds = new Set((completions ?? []).map((c) => c.material_id));
  const viewMap = new Map(
    (views ?? []).map((v) => [v.material_id, { viewed_at: v.viewed_at, duration_s: v.duration_s }])
  );

  const materialsWithUrls = await Promise.all(
    (materials ?? []).map(async (m) => {
      let signedUrl: string | null = null;
      if (m.file_url) {
        const { data: signed } = await admin.storage
          .from("learning")
          .createSignedUrl(m.file_url, 3600);
        signedUrl = signed?.signedUrl ?? null;
      }
      const view = viewMap.get(m.id);
      return {
        ...m,
        signed_url: signedUrl,
        completed: completedIds.has(m.id),
        viewed: !!view,
        viewed_at: view?.viewed_at ?? null,
        view_duration_s: view?.duration_s ?? 0,
      };
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
