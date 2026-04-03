import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { redirect, notFound } from "next/navigation";
import { KopDetailView } from "./kop-detail-view";

export default async function KopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: kop, error } = await supabase
    .from("kops")
    .select(`
      id, title, description, category, current_version, created_at, updated_at,
      department:departments(id, name, slug),
      created_by_profile:profiles!created_by(first_name, last_name),
      kop_versions(id, version_number, file_url, file_type, change_notes, created_at,
        uploaded_by_profile:profiles!uploaded_by(first_name, last_name))
    `)
    .eq("id", id)
    .single();

  if (error || !kop) notFound();

  // Generate signed URLs for all versions
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versionsRaw = (kop.kop_versions as any[]) ?? [];
  const versions = await Promise.all(
    versionsRaw
      .sort((a, b) => b.version_number - a.version_number)
      .map(async (v) => {
        const { data: signed } = await admin.storage
          .from("kops")
          .createSignedUrl(v.file_url, 3600);
        return { ...v, signed_url: signed?.signedUrl ?? null };
      })
  );

  const currentVersion = versions.find((v) => v.version_number === kop.current_version) ?? versions[0];

  return (
    <KopDetailView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      kop={kop as any}
      versions={versions}
      currentVersion={currentVersion}
      canManage={isManagerOrAbove(currentUser)}
      canDelete={isOps(currentUser)}
    />
  );
}
