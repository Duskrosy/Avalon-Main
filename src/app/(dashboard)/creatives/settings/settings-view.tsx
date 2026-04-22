"use client";

import { SmmGroupsSection } from "./smm-groups-section";

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
  adAccounts: AdMetaAccount[];
  canManage: boolean;
}

export function CreativesSettingsView({ adAccounts, canManage }: Props) {
  return (
    <div className="space-y-10">
      {!canManage && (
        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
          You can view but not modify settings. Only Super Ops can change page credentials, tokens, and account keys.
        </div>
      )}

      <SmmGroupsSection />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">Meta Ad Accounts</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{adAccounts.length} accounts</span>
        </div>
        {adAccounts.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
            No Meta ad accounts registered yet.
          </div>
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
