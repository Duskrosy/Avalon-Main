"use client";

import { useState } from "react";
import Link from "next/link";
import { Bug } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { NotificationDropdown } from "./notification-dropdown";

function openFeedback() {
  window.dispatchEvent(new CustomEvent("open-feedback"));
}

type TopbarProps = {
  unreadCount: number;
  birthdayBanner: { name: string; daysUntil: number } | null;
  userName?: string;
  userInitials?: string;
  userAvatarUrl?: string | null;
};

export function Topbar({ unreadCount, birthdayBanner, userName, userInitials, userAvatarUrl }: TopbarProps) {
  const [showBanner, setShowBanner] = useState(!!birthdayBanner);

  return (
    <div>
      {showBanner && birthdayBanner && (
        <div className="bg-[var(--color-warning-light)] border-b border-[var(--color-border-primary)] px-4 py-2 flex items-center justify-between">
          <p className="text-sm text-[var(--color-warning-text)]">
            🎂{" "}
            {birthdayBanner.daysUntil === 0
              ? `It's ${birthdayBanner.name}'s birthday today!`
              : birthdayBanner.daysUntil === 1
              ? `${birthdayBanner.name}'s birthday is tomorrow!`
              : `${birthdayBanner.name}'s birthday is in ${birthdayBanner.daysUntil} days!`}
          </p>
          <button
            onClick={() => setShowBanner(false)}
            className="text-[var(--color-warning)] hover:text-[var(--color-warning-text)] text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Desktop topbar */}
      <header className="h-14 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)] items-center justify-between px-6 hidden lg:flex">
        <div />
        <div className="flex items-center gap-3">
          <button
            onClick={openFeedback}
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Send feedback"
            title="Send feedback"
          >
            <Bug size={17} strokeWidth={1.5} />
          </button>
          <NotificationDropdown unreadCount={unreadCount} />
        </div>
      </header>

      {/* Mobile topbar */}
      <header className="h-12 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)] flex items-center justify-between px-4 lg:hidden">
        <Link href="/" className="text-base font-semibold text-[var(--color-text-primary)] tracking-tight">
          Avalon
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={openFeedback}
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Send feedback"
          >
            <Bug size={17} strokeWidth={1.5} />
          </button>
          <NotificationDropdown unreadCount={unreadCount} />
          {userInitials && (
            <Link href="/account/settings">
              <Avatar url={userAvatarUrl} initials={userInitials} size="sm" />
            </Link>
          )}
        </div>
      </header>
    </div>
  );
}
