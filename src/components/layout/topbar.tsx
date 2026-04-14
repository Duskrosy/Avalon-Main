"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NotificationDropdown } from "./notification-dropdown";

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
          <NotificationDropdown unreadCount={unreadCount} />

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
