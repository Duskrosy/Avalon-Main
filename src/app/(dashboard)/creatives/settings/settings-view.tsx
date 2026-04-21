"use client";

import { useState, useTransition } from "react";

export interface PlatformRow {
  id: string;
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  page_id: string | null;
  page_name: string | null;
  handle: string | null;
  access_token: string | null;
  is_active: boolean;
}

export interface GroupWithPlatforms {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  weekly_target: number;
  smm_group_platforms: PlatformRow[];
}

export interface AdMetaAccount {
  id: string;
  label: string | null;
  meta_account_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface Props {
  groups: GroupWithPlatforms[];
  adAccounts: AdMetaAccount[];
  canManage: boolean;
}

export function CreativesSettingsView({ groups, adAccounts, canManage }: Props) {
  return (
    <div className="space-y-8">
      {!canManage && (
        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
          You can view but not modify settings. Only Super Ops can change page credentials, tokens, and account keys.
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">Social Media Groups</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{groups.length} groups</span>
        </div>
        {groups.length === 0 ? (
          <EmptyNote text="No groups configured yet. Seed Local, International, PCDLF via migration." />
        ) : (
          groups.map((g) => <GroupCard key={g.id} group={g} canManage={canManage} />)
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">Meta Ad Accounts</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{adAccounts.length} accounts</span>
        </div>
        {adAccounts.length === 0 ? (
          <EmptyNote text="No Meta ad accounts registered yet." />
        ) : (
          <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Label</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Meta Account ID</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-primary)]">
                {adAccounts.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">{a.label ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">{a.meta_account_id ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                        a.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]"
                      }`}>
                        {a.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-tertiary)]">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-[var(--color-text-tertiary)]">
          Ad account management is done in Supabase directly. Request OPS to add a new ad account.
        </p>
      </section>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-24 text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
      {text}
    </div>
  );
}

function GroupCard({ group, canManage }: { group: GroupWithPlatforms; canManage: boolean }) {
  return (
    <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border-primary)] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{group.name}</h3>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
            Weekly target: {group.weekly_target} · {group.smm_group_platforms.length} platform{group.smm_group_platforms.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
          group.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]"
        }`}>
          {group.is_active ? "active" : "inactive"}
        </span>
      </div>
      <div className="divide-y divide-[var(--color-border-primary)]">
        {group.smm_group_platforms.length === 0 ? (
          <div className="px-4 py-6 text-xs text-[var(--color-text-tertiary)]">No platforms configured.</div>
        ) : (
          group.smm_group_platforms.map((p) => (
            <PlatformEditor key={p.id} platform={p} canManage={canManage} />
          ))
        )}
      </div>
    </div>
  );
}

function PlatformEditor({ platform, canManage }: { platform: PlatformRow; canManage: boolean }) {
  const [pageId, setPageId] = useState(platform.page_id ?? "");
  const [pageName, setPageName] = useState(platform.page_name ?? "");
  const [handle, setHandle] = useState(platform.handle ?? "");
  const [tokenEdit, setTokenEdit] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const hasToken = !!platform.access_token;

  const save = () => {
    startTransition(async () => {
      setStatus("idle");
      setErrMsg("");
      try {
        const body: Record<string, unknown> = {
          id: platform.id,
          page_id: pageId || null,
          page_name: pageName || null,
          handle: handle || null,
        };
        if (tokenEdit) body.access_token = tokenEdit;
        const res = await fetch("/api/creatives/settings/platforms", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        setStatus("saved");
        setTokenEdit("");
        setTimeout(() => setStatus("idle"), 2000);
      } catch (e) {
        setStatus("error");
        setErrMsg(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase font-medium text-[var(--color-text-tertiary)] w-20">{platform.platform}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          platform.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]"
        }`}>
          {platform.is_active ? "active" : "inactive"}
        </span>
        <span className="ml-auto text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-2">
          <span>Token: {hasToken ? (revealed && platform.access_token ? platform.access_token : "●●●● set") : "not set"}</span>
          {hasToken && canManage && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="text-[10px] uppercase tracking-wide text-[var(--color-accent)] hover:underline"
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input label="Page ID" value={pageId} onChange={setPageId} disabled={!canManage} placeholder="Meta page_id / channel ID" />
        <Input label="Page Name" value={pageName} onChange={setPageName} disabled={!canManage} placeholder="Display name" />
        <Input label="Handle" value={handle} onChange={setHandle} disabled={!canManage} placeholder="@handle or slug" />
      </div>
      <div className="flex items-center gap-2">
        <Input
          label="Access Token"
          value={tokenEdit}
          onChange={setTokenEdit}
          disabled={!canManage}
          placeholder={hasToken ? "(keep current — leave blank)" : "paste token here"}
          type={revealed ? "text" : "password"}
          className="flex-1"
        />
        <button
          disabled={!canManage || saving}
          onClick={save}
          className="h-8 self-end px-3 rounded-md text-xs font-medium bg-[var(--color-accent)] text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status === "saved" && <span className="self-end pb-1 text-[11px] text-emerald-400">Saved</span>}
        {status === "error" && <span className="self-end pb-1 text-[11px] text-red-400">{errMsg}</span>}
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, placeholder, disabled, type, className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[10px] uppercase text-[var(--color-text-tertiary)] font-medium">{label}</span>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-8 px-2.5 rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] text-sm text-[var(--color-text-primary)] disabled:opacity-60 focus:outline-none focus:border-[var(--color-accent)]"
      />
    </label>
  );
}
