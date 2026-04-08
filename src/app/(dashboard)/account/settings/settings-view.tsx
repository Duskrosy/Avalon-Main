"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { SecurityView } from "@/app/(dashboard)/account/security/security-view";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  first_name: string;
  last_name:  string;
  avatar_url: string | null;
  bio:        string | null;
  job_title:  string | null;
  fun_fact:   string | null;
};

type Point = { x: number; y: number };
type Area  = { x: number; y: number; width: number; height: number };

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
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas is empty")), "image/jpeg", 0.92)
  );
}

// ─── Avatar uploader ─────────────────────────────────────────────────────────

function AvatarUploader({ userId, currentUrl, initials, onUpdated }: {
  userId: string;
  currentUrl: string | null;
  initials: string;
  onUpdated: (url: string | null) => void;
}) {
  const [imageSrc, setImageSrc]       = useState<string | null>(null);
  const [crop, setCrop]               = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom]               = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [removing, setRemoving]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 10 * 1024 * 1024) { setError("File must be under 10 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => setCroppedArea(pixels), []);

  async function handleUpload() {
    if (!imageSrc || !croppedArea) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea);
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const res  = await fetch(`/api/users/${userId}/avatar`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onUpdated(data.avatar_url);
      setImageSrc(null);
    } catch { setError("Upload failed — please try again."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleRemove() {
    if (!confirm("Remove your profile picture?")) return;
    setRemoving(true);
    const res = await fetch(`/api/users/${userId}/avatar`, { method: "DELETE" });
    setRemoving(false);
    if (res.ok) onUpdated(null);
    else { const d = await res.json(); setError(d.error); }
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex items-center gap-4">
        <Avatar url={currentUrl} initials={initials} size="xl" />
        <div className="space-y-2">
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors">
              {currentUrl ? "Change photo" : "Upload photo"}
            </button>
            {currentUrl && (
              <button onClick={handleRemove} disabled={removing} className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                {removing ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">JPEG, PNG or WebP · max 10 MB · cropped to circle</p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileChange} />
      {imageSrc && (
        <div className="w-full border border-gray-200 rounded-xl overflow-hidden bg-gray-900">
          <div className="relative h-64 w-full">
            <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
          </div>
          <div className="bg-white px-4 py-3 flex items-center gap-3 border-t border-gray-100">
            <span className="text-xs text-gray-500 shrink-0">Zoom</span>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-gray-900" />
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setImageSrc(null)} className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleUpload} disabled={uploading} className="px-4 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {uploading ? "Saving…" : "Save photo"}
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── Change password section ──────────────────────────────────────────────────

function ChangePasswordSection({ userId, allowed }: { userId: string; allowed: boolean }) {
  const [form, setForm]   = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [done, setDone]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.next !== form.confirm) { setError("New passwords don't match."); return; }
    if (form.next.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSaving(true);
    setError(null);

    const supabase = createClient();
    // Verify current password by re-signing in
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user?.email) { setError("Could not verify current user."); setSaving(false); return; }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: form.current,
    });
    if (signInError) { setError("Current password is incorrect."); setSaving(false); return; }

    const { error: updateError } = await supabase.auth.updateUser({ password: form.next });
    if (updateError) { setError(updateError.message); setSaving(false); return; }

    // Clear must_change_password flag
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ must_change_password: false }),
    });

    setSaving(false);
    setDone(true);
    setForm({ current: "", next: "", confirm: "" });
    setTimeout(() => setDone(false), 4000);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Change Password</h2>
      {!allowed ? (
        <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mt-3">
          <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-700">Password changes are restricted</p>
            <p className="text-xs text-gray-500 mt-0.5">Your account has been configured to prevent self-service password changes. Contact your manager or OPS Admin.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 mt-3 max-w-sm">
          {done && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
              Password updated successfully.
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current password</label>
            <input
              type="password"
              required
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm new password</label>
            <input
              type="password"
              required
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </section>
  );
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

function ProfileTab({ userId, profile, allowPasswordChange, requireMfa, mustChangePassword }: {
  userId: string;
  profile: Profile;
  allowPasswordChange: boolean;
  requireMfa: boolean;
  mustChangePassword: boolean;
}) {
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [form, setForm]           = useState({
    bio:       profile.bio       ?? "",
    job_title: profile.job_title ?? "",
    fun_fact:  profile.fun_fact  ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const initials = `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bio:       form.bio       || null,
        job_title: form.job_title || null,
        fun_fact:  form.fun_fact  || null,
      }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setError(d.error); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="max-w-xl space-y-8">

      {/* Must-change-password banner */}
      {mustChangePassword && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">You need to change your password</p>
            <p className="text-xs text-amber-700 mt-0.5">Your admin has requested a password reset. Go to the <strong>Security & 2FA</strong> tab to update it.</p>
          </div>
        </div>
      )}

      {/* Profile picture */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Profile picture</h2>
        <AvatarUploader userId={userId} currentUrl={avatarUrl} initials={initials} onUpdated={setAvatarUrl} />
      </section>

      {/* About me */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">About me</h2>
        <p className="text-xs text-gray-400 mb-4">Shown on your directory card. Keep it professional — a little personality goes a long way.</p>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Display title <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              maxLength={100}
              value={form.job_title}
              onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
              placeholder="e.g. Senior Sales Agent · Team Lead"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">Appears below your name — separate from your system role.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bio <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={3}
              maxLength={300}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="A short intro — what you do, what you're focused on…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{form.bio.length}/300</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fun fact <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              maxLength={150}
              value={form.fun_fact}
              onChange={(e) => setForm((f) => ({ ...f, fun_fact: e.target.value }))}
              placeholder="e.g. Can solve a Rubik's cube in under 2 minutes"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
              saved ? "bg-green-600 text-white" : "bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
            )}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
          </button>
        </form>
      </section>
    </div>
  );
}

// ─── Security tab ─────────────────────────────────────────────────────────────

function SecurityTab({ userId, allowPasswordChange, requireMfa, mustChangePassword }: {
  userId: string;
  allowPasswordChange: boolean;
  requireMfa: boolean;
  mustChangePassword: boolean;
}) {
  return (
    <div className="max-w-lg space-y-8">
      {mustChangePassword && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Password change required</p>
            <p className="text-xs text-amber-700 mt-0.5">Your admin has requested you update your password before continuing.</p>
          </div>
        </div>
      )}

      <ChangePasswordSection userId={userId} allowed={allowPasswordChange} />

      {requireMfa && (
        <>
          <div className="border-t border-gray-100" />
          <SecurityView />
        </>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AccountSettingsView({
  userId,
  initialProfile,
  allowPasswordChange,
  requireMfa,
  mustChangePassword,
}: {
  userId: string;
  initialProfile: Profile;
  allowPasswordChange: boolean;
  requireMfa: boolean;
  mustChangePassword: boolean;
}) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const tabParam     = searchParams.get("tab");
  const [tab, setTab] = useState<"profile" | "security">(
    tabParam === "security" ? "security" : "profile"
  );

  useEffect(() => {
    if (tabParam === "profile")  setTab("profile");
    if (tabParam === "security") setTab("security");
  }, [tabParam]);

  function switchTab(t: "profile" | "security") {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    router.replace(url.pathname + url.search, { scroll: false });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Account Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile and security preferences.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-8">
        {([
          { key: "profile",  label: "My Profile" },
          { key: "security", label: "Security & 2FA" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700"
            )}
          >
            {label}
            {key === "security" && mustChangePassword && (
              <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            )}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <ProfileTab
          userId={userId}
          profile={initialProfile}
          allowPasswordChange={allowPasswordChange}
          requireMfa={requireMfa}
          mustChangePassword={mustChangePassword}
        />
      )}
      {tab === "security" && (
        <SecurityTab
          userId={userId}
          allowPasswordChange={allowPasswordChange}
          requireMfa={requireMfa}
          mustChangePassword={mustChangePassword}
        />
      )}
    </div>
  );
}
