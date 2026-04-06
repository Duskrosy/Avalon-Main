"use client";

import { useState } from "react";

type Group = { id: string; name: string; weekly_target: number };
type Member = { id: string; first_name: string; last_name: string };

type Props = {
  weekPostCount: number;
  weeklyTarget: number;
  pendingCards: number | null;
  members: Member[];
  canManage: boolean;
  groups: Group[];
};

export function CreativesDashboard({
  weekPostCount,
  weeklyTarget,
  pendingCards,
  members,
  canManage,
  groups,
}: Props) {
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetValue, setTargetValue] = useState(weeklyTarget);
  const [saving, setSaving] = useState(false);

  const progress = Math.min((weekPostCount / targetValue) * 100, 100);
  const isOnTrack = weekPostCount >= Math.round(targetValue * 0.7);

  const saveTarget = async () => {
    setSaving(true);
    // Update weekly_target on the first group (or all groups proportionally)
    // For now: update first active group's target
    if (groups.length > 0) {
      await fetch("/api/smm/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: groups[0].id, weekly_target: targetValue }),
      });
    }
    setSaving(false);
    setEditingTarget(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Creatives Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Weekly content overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Weekly Volume Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 col-span-1 md:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">This Week</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-gray-900">{weekPostCount}</span>
                <span className="text-sm text-gray-400">/ {targetValue} posts</span>
              </div>
            </div>
            {canManage && (
              <button
                onClick={() => setEditingTarget(true)}
                className="text-xs text-gray-400 hover:text-gray-600 p-1"
                title="Edit weekly target"
              >
                ✎
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progress >= 100 ? "bg-green-500" : isOnTrack ? "bg-blue-500" : "bg-amber-400"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className={`text-xs mt-2 ${
            progress >= 100 ? "text-green-600" : isOnTrack ? "text-blue-600" : "text-amber-600"
          }`}>
            {progress >= 100 ? "Target reached! 🎉" : isOnTrack ? `${targetValue - weekPostCount} to go — on track` : `${targetValue - weekPostCount} to go — behind pace`}
          </p>

          {/* Edit target modal */}
          {editingTarget && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="200"
                value={targetValue}
                onChange={(e) => setTargetValue(Number(e.target.value))}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <button
                onClick={saveTarget}
                disabled={saving}
                className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setEditingTarget(false); setTargetValue(weeklyTarget); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Pending Tasks Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Tasks</p>
          {pendingCards !== null ? (
            <div className="mt-2">
              <span className="text-3xl font-bold text-gray-900">{pendingCards}</span>
              <p className="text-xs text-gray-400 mt-1">assigned to you</p>
              <a
                href="/productivity/kanban"
                className="mt-3 inline-block text-xs text-blue-600 hover:text-blue-800"
              >
                View board →
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-2">—</p>
          )}
        </div>

        {/* Team Members Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Team</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{members.length}</p>
          <p className="text-xs text-gray-400 mt-1">active members</p>
          {members.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {members.slice(0, 6).map((m) => (
                <span
                  key={m.id}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                >
                  {m.first_name}
                </span>
              ))}
              {members.length > 6 && (
                <span className="text-xs text-gray-400">+{members.length - 6}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Content Calendar", href: "/productivity/calendar", icon: "📅" },
          { label: "Task Board", href: "/productivity/kanban", icon: "📋" },
          { label: "Content Manager", href: "/creatives/content", icon: "✏️" },
          { label: "Analytics", href: "/creatives/analytics", icon: "📊" },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors text-center"
          >
            <span className="text-2xl">{link.icon}</span>
            <span className="text-xs font-medium text-gray-700">{link.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
