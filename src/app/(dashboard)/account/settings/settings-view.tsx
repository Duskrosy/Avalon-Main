"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { SecurityView } from "@/app/(dashboard)/account/security/security-view";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/ui/password-input";
import { useTheme } from "@/components/providers/theme-provider";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import type { UserPreferences } from "@/types/database";

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
            <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] text-xs font-medium rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors">
              {currentUrl ? "Change photo" : "Upload photo"}
            </button>
            {currentUrl && (
              <button onClick={handleRemove} disabled={removing} className="px-3 py-1.5 border border-[var(--color-error-light)] text-[var(--color-error)] text-xs font-medium rounded-lg hover:bg-[var(--color-error-light)] transition-colors disabled:opacity-50">
                {removing ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">JPEG, PNG or WebP · max 10 MB · cropped to circle</p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileChange} />
      {imageSrc && (
        <div className="w-full border border-[var(--color-border-primary)] rounded-xl overflow-hidden bg-[var(--color-text-primary)]">
          <div className="relative h-64 w-full">
            <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
          </div>
          <div className="bg-[var(--color-bg-primary)] px-4 py-3 flex items-center gap-3 border-t border-[var(--color-border-secondary)]">
            <span className="text-xs text-[var(--color-text-secondary)] shrink-0">Zoom</span>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--color-accent)]" />
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setImageSrc(null)} className="px-3 py-1.5 border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] text-xs rounded-lg hover:bg-[var(--color-bg-secondary)]">Cancel</button>
              <button onClick={handleUpload} disabled={uploading} className="px-4 py-1.5 bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] text-xs font-medium rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors">
                {uploading ? "Saving…" : "Save photo"}
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
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
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Change Password</h2>
      {!allowed ? (
        <div className="flex items-start gap-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl px-4 py-3 mt-3">
          <svg className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Password changes are restricted</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Your account has been configured to prevent self-service password changes. Contact your manager or OPS Admin.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 mt-3 max-w-sm">
          {done && (
            <div className="bg-[var(--color-success-light)] border border-[var(--color-success-border)] rounded-xl px-4 py-3 text-sm text-[var(--color-success-text)] font-medium">
              Password updated successfully.
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Current password</label>
            <PasswordInput
              required
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">New password</label>
            <PasswordInput
              required
              minLength={8}
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Confirm new password</label>
            <PasswordInput
              required
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-lg">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
          >
            {saving ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </section>
  );
}

// ─── Discord / Connected accounts ────────────────────────────────────────────

function DiscordSection({ userId }: { userId: string }) {
  const [identity, setIdentity]   = useState<Record<string, unknown> | null>(null);
  const [loading,  setLoading]    = useState(true);
  const [working,  setWorking]    = useState(false);
  const [error,    setError]      = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUserIdentities().then(({ data }) => {
      const discord = data?.identities?.find((i) => i.provider === "discord") ?? null;
      setIdentity(discord as Record<string, unknown> | null);
      setLoading(false);
    });
  }, [userId]);

  async function handleLink() {
    setWorking(true);
    setError(null);
    const supabase   = createClient();
    const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/account/settings")}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: linkError } = await (supabase.auth.linkIdentity as any)({
      provider: "discord",
      options:  { redirectTo },
    });
    if (linkError) { setError(linkError.message); setWorking(false); }
    // On success the browser redirects to Discord — no further handling needed
  }

  async function handleUnlink() {
    if (!identity) return;
    if (!confirm("Disconnect your Discord account?")) return;
    setWorking(true);
    setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: unlinkError } = await (supabase.auth.unlinkIdentity as any)(identity);
    if (unlinkError) {
      setError(unlinkError.message);
    } else {
      setIdentity(null);
    }
    setWorking(false);
  }

  const discordName =
    (identity?.identity_data as Record<string, string> | undefined)?.full_name ??
    (identity?.identity_data as Record<string, string> | undefined)?.name ??
    (identity?.identity_data as Record<string, string> | undefined)?.user_name ??
    "Connected";

  return (
    <section>
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Connected Accounts</h2>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
        Link your Discord account to sign in without a password.
      </p>
      {loading ? (
        <div className="h-14 animate-pulse bg-[var(--color-bg-tertiary)] rounded-xl" />
      ) : (
        <div className="flex items-center justify-between border border-[var(--color-border-primary)] rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Discord logo */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#5865F2" }}>
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Discord</p>
              {identity ? (
                <p className="text-xs text-[var(--color-text-tertiary)]">{discordName}</p>
              ) : (
                <p className="text-xs text-[var(--color-text-tertiary)]">Not connected</p>
              )}
            </div>
          </div>

          {identity ? (
            <button
              onClick={handleUnlink}
              disabled={working}
              className="text-xs text-[var(--color-error)] hover:opacity-80 font-medium disabled:opacity-50 transition-colors"
            >
              {working ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              onClick={handleLink}
              disabled={working}
              className="px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: "#5865F2" }}
            >
              {working ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-[var(--color-error)] mt-2">{error}</p>}
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
        <div className="flex items-start gap-3 bg-[var(--color-warning-light)] border border-[var(--color-border-primary)] rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-[var(--color-warning-text)] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[var(--color-warning-text)]">You need to change your password</p>
            <p className="text-xs text-[var(--color-warning-text)] mt-0.5 opacity-80">Your admin has requested a password reset. Go to the <strong>Security & 2FA</strong> tab to update it.</p>
          </div>
        </div>
      )}

      {/* Profile picture */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Profile picture</h2>
        <AvatarUploader userId={userId} currentUrl={avatarUrl} initials={initials} onUpdated={setAvatarUrl} />
      </section>

      {/* About me */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">About me</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Shown on your directory card. Keep it professional — a little personality goes a long way.</p>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Display title <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span></label>
            <input
              type="text"
              maxLength={100}
              value={form.job_title}
              onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
              placeholder="e.g. Senior Sales Agent · Team Lead"
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
            />
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Appears below your name — separate from your system role.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Bio <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span></label>
            <textarea
              rows={3}
              maxLength={300}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="A short intro — what you do, what you're focused on…"
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
            />
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1 text-right">{form.bio.length}/300</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Fun fact <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span></label>
            <input
              type="text"
              maxLength={150}
              value={form.fun_fact}
              onChange={(e) => setForm((f) => ({ ...f, fun_fact: e.target.value }))}
              placeholder="e.g. Can solve a Rubik's cube in under 2 minutes"
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
            />
          </div>
          {error && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-lg">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
              saved ? "bg-[var(--color-success)] text-white" : "bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
            )}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
          </button>
        </form>
      </section>

      <div className="border-t border-[var(--color-border-secondary)]" />
      <DiscordSection userId={userId} />
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
        <div className="flex items-start gap-3 bg-[var(--color-warning-light)] border border-[var(--color-border-primary)] rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-[var(--color-warning-text)] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[var(--color-warning-text)]">Password change required</p>
            <p className="text-xs text-[var(--color-warning-text)] mt-0.5 opacity-80">Your admin has requested you update your password before continuing.</p>
          </div>
        </div>
      )}

      <ChangePasswordSection userId={userId} allowed={allowPasswordChange} />

      {requireMfa && (
        <>
          <div className="border-t border-[var(--color-border-secondary)]" />
          <SecurityView />
        </>
      )}
    </div>
  );
}

// ─── Appearance tab ──────────────────────────────────────────────────────────

const ACCENTS = [
  { name: "blue",    color: "#2563EB", darkColor: "#60A5FA" },
  { name: "violet",  color: "#7C3AED", darkColor: "#A78BFA" },
  { name: "teal",    color: "#0D9488", darkColor: "#2DD4BF" },
  { name: "rose",    color: "#E11D48", darkColor: "#FB7185" },
  { name: "amber",   color: "#D97706", darkColor: "#FBBF24" },
  { name: "emerald", color: "#059669", darkColor: "#34D399" },
  { name: "orange",  color: "#EA580C", darkColor: "#FB923C" },
  { name: "indigo",  color: "#4F46E5", darkColor: "#818CF8" },
] as const;

function AppearanceTab() {
  const { theme, accent, density, resolvedTheme, setTheme, setAccent, setDensity } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="max-w-xl space-y-8">
      {/* Theme */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Theme</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Choose how Avalon looks to you.</p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Monitor },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-[var(--radius-lg)] border-2 transition-all",
                theme === value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                  : "border-[var(--color-border-primary)] hover:border-[var(--color-text-tertiary)] bg-[var(--color-surface-card)]"
              )}
            >
              <Icon size={20} strokeWidth={1.5} className={theme === value ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"} />
              <span className={cn("text-sm font-medium", theme === value ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]")}>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Accent color */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Accent color</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Personalizes buttons, links, and highlights.</p>
        <div className="flex gap-3 flex-wrap">
          {ACCENTS.map((a) => (
            <button
              key={a.name}
              onClick={() => setAccent(a.name as any)}
              title={a.name.charAt(0).toUpperCase() + a.name.slice(1)}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all ring-2 ring-offset-2",
                accent === a.name
                  ? "ring-[var(--color-accent)] ring-offset-[var(--color-bg-primary)]"
                  : "ring-transparent ring-offset-transparent hover:ring-[var(--color-border-primary)] hover:ring-offset-[var(--color-bg-primary)]"
              )}
              style={{ backgroundColor: isDark ? a.darkColor : a.color }}
            >
              {accent === a.name && <Check size={14} strokeWidth={2.5} className="text-white" />}
            </button>
          ))}
        </div>
      </section>

      {/* Density */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Display density</h2>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">Controls spacing and text size across the app.</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: "comfortable", label: "Comfortable", desc: "More breathing room" },
            { value: "compact", label: "Compact", desc: "Fits more on screen" },
          ] as const).map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setDensity(value)}
              className={cn(
                "flex flex-col items-start gap-1 p-4 rounded-[var(--radius-lg)] border-2 transition-all text-left",
                density === value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                  : "border-[var(--color-border-primary)] hover:border-[var(--color-text-tertiary)] bg-[var(--color-surface-card)]"
              )}
            >
              <span className={cn("text-sm font-medium", density === value ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]")}>{label}</span>
              <span className="text-xs text-[var(--color-text-tertiary)]">{desc}</span>
            </button>
          ))}
        </div>
      </section>
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
  initialPreferences,
}: {
  userId: string;
  initialProfile: Profile;
  allowPasswordChange: boolean;
  requireMfa: boolean;
  mustChangePassword: boolean;
  initialPreferences: UserPreferences;
}) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const tabParam     = searchParams.get("tab");
  const [tab, setTab] = useState<"profile" | "appearance" | "security">(
    tabParam === "security" ? "security" : tabParam === "appearance" ? "appearance" : "profile"
  );

  useEffect(() => {
    if (tabParam === "profile")    setTab("profile");
    if (tabParam === "appearance") setTab("appearance");
    if (tabParam === "security")   setTab("security");
  }, [tabParam]);

  function switchTab(t: "profile" | "appearance" | "security") {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    router.replace(url.pathname + url.search, { scroll: false });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Account Settings</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage your profile and security preferences.</p>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border-primary)] mb-8">
        {([
          { key: "profile",    label: "My Profile" },
          { key: "appearance", label: "Appearance" },
          { key: "security",   label: "Security & 2FA" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === key
                ? "border-[var(--color-accent)] text-[var(--color-text-primary)]"
                : "border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
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
      {tab === "appearance" && <AppearanceTab />}
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
