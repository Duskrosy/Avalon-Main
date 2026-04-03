"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TopbarProps = {
  unreadCount: number;
  birthdayBanner: { name: string; daysUntil: number } | null;
};

export function Topbar({ unreadCount, birthdayBanner }: TopbarProps) {
  const [showBanner, setShowBanner] = useState(!!birthdayBanner);
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div>
      {showBanner && birthdayBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <p className="text-sm text-amber-800">
            🎂{" "}
            {birthdayBanner.daysUntil === 0
              ? `It's ${birthdayBanner.name}'s birthday today!`
              : birthdayBanner.daysUntil === 1
              ? `${birthdayBanner.name}'s birthday is tomorrow!`
              : `${birthdayBanner.name}'s birthday is in ${birthdayBanner.daysUntil} days!`}
          </p>
          <button
            onClick={() => setShowBanner(false)}
            className="text-amber-600 hover:text-amber-800 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
        <div />

        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/communications/notifications")}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Notifications"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 6.667a5 5 0 0 0-10 0c0 5.833-2.5 7.5-2.5 7.5h15S15 12.5 15 6.667" />
              <path d="M11.442 16.667a1.667 1.667 0 0 1-2.884 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-medium rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>
    </div>
  );
}
