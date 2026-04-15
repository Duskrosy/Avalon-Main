"use client";

import { useState, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import { Avatar } from "@/components/ui/avatar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Department = { id: string; name: string; slug: string };
type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  job_title: string | null;
  fun_fact: string | null;
  avatar_require_approval: boolean;
  department: Department | null;
  role: { name: string; tier: number } | null;
};

type Point = { x: number; y: number };
type Area  = { x: number; y: number; width: number; height: number };

type Props = {
  profiles: Profile[];
  departments: Department[];
  currentUserId: string;
  currentDeptId: string | null;
  canManageProfiles: boolean;
  isOps: boolean;
};

// ─── Canvas crop helper ───────────────────────────────────────────────────────

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width  = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Canvas is empty")),
      "image/jpeg",
      0.92
    )
  );
}

// ─── Drawer avatar uploader (manager / OPS editing another user) ──────────────

function DrawerAvatarUploader({
  targetId,
  currentUrl,
  initials,
  requireApproval,
  canManage,
  isOps,
  onUpdated,
  onApprovalToggled,
}: {
  targetId: string;
  currentUrl: string | null;
  initials: string;
  requireApproval: boolean;
  canManage: boolean;
  isOps: boolean;
  onUpdated: (url: string | null) => void;
  onApprovalToggled: (val: boolean) => void;
}) {
  const [imageSrc, setImageSrc]       = useState<string | null>(null);
  const [crop, setCrop]               = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom]               = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [removing, setRemoving]       = useState(false);
  const [toggling, setToggling]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_MB  = 10;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_MB} MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  async function handleUpload() {
    if (!imageSrc || !croppedArea) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea);
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const res  = await fetch(`/api/users/${targetId}/avatar`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onUpdated(data.avatar_url);
      setImageSrc(null);
    } catch {
      setError("Upload failed — please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!confirm("Remove this profile picture?")) return;
    setRemoving(true);
    const res = await fetch(`/api/users/${targetId}/avatar`, { method: "DELETE" });
    setRemoving(false);
    if (res.ok) onUpdated(null);
    else { const d = await res.json(); setError(d.error); }
  }

  async function handleToggleApproval() {
    setToggling(true);
    const res = await fetch(`/api/users/${targetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_require_approval: !requireApproval }),
    });
    setToggling(false);
    if (res.ok) onApprovalToggled(!requireApproval);
    else { const d = await res.json(); setError(d.error); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar url={currentUrl} initials={initials} size="xl" />
        {canManage && (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-xs font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-text-secondary)] transition-colors"
              >
                {currentUrl ? "Change photo" : "Add photo"}
              </button>
              {currentUrl && (
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="px-3 py-1.5 border border-red-200 text-[var(--color-error)] text-xs font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-error-light)] transition-colors disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)]">JPEG, PNG or WebP · max {MAX_MB} MB</p>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileChange} />

      {/* Crop UI */}
      {imageSrc && (
        <div className="border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden bg-[var(--color-text-primary)]">
          <div className="relative h-56 w-full">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="bg-[var(--color-bg-primary)] px-4 py-3 flex items-center gap-3 border-t border-[var(--color-border-secondary)]">
            <span className="text-xs text-[var(--color-text-secondary)] shrink-0">Zoom</span>
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-gray-900"
            />
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setImageSrc(null)}
                className="px-3 py-1.5 border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] text-xs rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-1.5 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-xs font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
              >
                {uploading ? "Saving…" : "Save photo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Require approval toggle — managers/OPS only */}
      {(canManage || isOps) && (
        <button
          onClick={handleToggleApproval}
          disabled={toggling}
          className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50 self-start"
        >
          <span className={`w-8 h-4 rounded-full flex items-center transition-colors ${requireApproval ? "bg-amber-500" : "bg-[var(--color-border-primary)]"}`}>
            <span className={`w-3 h-3 rounded-full bg-[var(--color-bg-primary)] shadow-[var(--shadow-sm)] mx-0.5 transition-transform ${requireApproval ? "translate-x-4" : "translate-x-0"}`} />
          </span>
          <span>Require approval for photo changes</span>
        </button>
      )}

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  );
}

// ─── Profile drawer ───────────────────────────────────────────────────────────

function ProfileDrawer({
  person,
  currentUserId,
  canManageProfiles,
  isOps,
  onClose,
  onProfileUpdated,
}: {
  person: Profile;
  currentUserId: string;
  canManageProfiles: boolean;
  isOps: boolean;
  onClose: () => void;
  onProfileUpdated: (id: string, changes: Partial<Profile>) => void;
}) {
  const initials  = `${person.first_name[0]}${person.last_name[0]}`.toUpperCase();
  const canManage = canManageProfiles || isOps;

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: person.first_name,
    last_name:  person.last_name,
    job_title:  person.job_title  ?? "",
    bio:        person.bio        ?? "",
    fun_fact:   person.fun_fact   ?? "",
    phone:      person.phone      ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/users/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: editForm.first_name,
        last_name:  editForm.last_name,
        job_title:  editForm.job_title  || null,
        bio:        editForm.bio        || null,
        fun_fact:   editForm.fun_fact   || null,
        phone:      editForm.phone      || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveError(data.error); return; }
    onProfileUpdated(person.id, {
      first_name: editForm.first_name,
      last_name:  editForm.last_name,
      job_title:  editForm.job_title  || null,
      bio:        editForm.bio        || null,
      fun_fact:   editForm.fun_fact   || null,
      phone:      editForm.phone      || null,
    });
    setEditing(false);
  }

  const tierLabel = (tier: number) => {
    if (tier <= 1) return { label: "OPS",     color: "bg-purple-100 text-purple-700" };
    if (tier === 2) return { label: "Manager", color: "bg-[var(--color-accent-light)] text-[var(--color-accent)]" };
    return { label: "Staff", color: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]" };
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-[var(--color-bg-primary)] shadow-xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-secondary)] sticky top-0 bg-[var(--color-bg-primary)]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Profile</h2>
            {canManage && !editing && (
              <button
                onClick={() => { setEditing(true); setSaveError(null); }}
                className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] px-2 py-1 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-active)] transition-colors"
              >
                Edit
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-active)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Avatar */}
          <DrawerAvatarUploader
            targetId={person.id}
            currentUrl={person.avatar_url}
            initials={initials}
            requireApproval={person.avatar_require_approval}
            canManage={canManage}
            isOps={isOps}
            onUpdated={(url) => onProfileUpdated(person.id, { avatar_url: url })}
            onApprovalToggled={(val) => onProfileUpdated(person.id, { avatar_require_approval: val })}
          />

          {editing ? (
            /* ── Edit mode ──────────────────────────────────────── */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">First name</label>
                  <input
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Last name</label>
                  <input
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Phone</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. +63 912 345 6789"
                  className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Display title <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span></label>
                <input
                  maxLength={100}
                  value={editForm.job_title}
                  onChange={(e) => setEditForm((f) => ({ ...f, job_title: e.target.value }))}
                  placeholder="e.g. Senior Sales Agent"
                  className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Bio <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span></label>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={editForm.bio}
                  onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="A short intro…"
                  className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
                />
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1 text-right">{editForm.bio.length}/300</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Fun fact <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span></label>
                <input
                  maxLength={150}
                  value={editForm.fun_fact}
                  onChange={(e) => setEditForm((f) => ({ ...f, fun_fact: e.target.value }))}
                  placeholder="e.g. Can solve a Rubik's cube in under 2 minutes"
                  className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              {saveError && <p className="text-xs text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-[var(--radius-md)]">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] py-2 rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2 rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          ) : (
            /* ── View mode ──────────────────────────────────────── */
            <>
              <div>
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {person.first_name} {person.last_name}
                </h3>
                {person.job_title && (
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{person.job_title}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {person.role && (() => {
                    const { label, color } = tierLabel(person.role.tier);
                    return (
                      <>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>{label}</span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">{person.role.name}</span>
                      </>
                    );
                  })()}
                  {person.department && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border-primary)]">
                      {person.department.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Contact</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <svg className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <a href={`mailto:${person.email}`} className="hover:text-[var(--color-text-primary)] truncate">{person.email}</a>
                  </div>
                  {person.phone && (
                    <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                      <svg className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      <span>{person.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {person.bio && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">About</h4>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{person.bio}</p>
                </div>
              )}

              {person.fun_fact && (
                <div className="bg-[var(--color-warning-light)] border border-amber-100 rounded-[var(--radius-lg)] p-4">
                  <p className="text-xs font-semibold text-[var(--color-warning-text)] mb-1">Fun fact</p>
                  <p className="text-sm text-[var(--color-warning-text)]">{person.fun_fact}</p>
                </div>
              )}

              {!person.bio && !person.fun_fact && !person.job_title && (
                <div className="text-center py-4">
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {person.first_name} hasn&apos;t added any personalizations yet.
                    {canManage && " Click Edit above to fill them in."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Person card ──────────────────────────────────────────────────────────────

function PersonCard({ person, onClick }: { person: Profile; onClick: () => void }) {
  const initials = `${person.first_name[0]}${person.last_name[0]}`.toUpperCase();

  return (
    <button
      onClick={onClick}
      className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-4 flex items-center gap-3 hover:border-[var(--color-border-primary)] hover:shadow-[var(--shadow-sm)] transition-all w-full text-left"
    >
      <Avatar url={person.avatar_url} initials={initials} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {person.first_name} {person.last_name}
        </p>
        {person.job_title ? (
          <p className="text-xs text-[var(--color-text-secondary)] truncate">{person.job_title}</p>
        ) : (
          <p className="text-xs text-[var(--color-text-tertiary)] truncate">{person.email}</p>
        )}
        {person.role && (
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 truncate">{person.role.name}</p>
        )}
      </div>
      <svg className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function DirectoryView({
  profiles: initialProfiles,
  departments,
  currentUserId,
  currentDeptId,
  canManageProfiles,
  isOps,
}: Props) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [search, setSearch]     = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);

  function handleProfileUpdated(id: string, changes: Partial<Profile>) {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...changes } : p))
    );
    setSelected((prev) => (prev?.id === id ? { ...prev, ...changes } : prev));
  }

  const filtered = profiles.filter((p) => {
    const matchesSearch =
      `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase());
    const matchesDept = !deptFilter || p.department?.id === deptFilter;
    return matchesSearch && matchesDept;
  });

  // Group by department
  const grouped = filtered.reduce<Record<string, Profile[]>>((acc, p) => {
    const key = p.department?.name ?? "No Department";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Employee Directory</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{profiles.length} people</p>
      </div>

      <div className="flex gap-3 mb-6">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--color-bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">
          No people found
        </div>
      ) : deptFilter ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <PersonCard key={p.id} person={p} onClick={() => setSelected(p)} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([dept, people]) => (
            <div key={dept}>
              <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">{dept}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {people.map((p) => (
                  <PersonCard key={p.id} person={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <ProfileDrawer
          person={selected}
          currentUserId={currentUserId}
          canManageProfiles={canManageProfiles}
          isOps={isOps}
          onClose={() => setSelected(null)}
          onProfileUpdated={handleProfileUpdated}
        />
      )}
    </div>
  );
}
