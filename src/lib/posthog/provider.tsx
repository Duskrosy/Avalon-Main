"use client";

import { useEffect, useRef } from "react";
import { initPostHog, posthog } from "./config";

type PostHogProviderProps = {
  userId: string | null;
  userEmail: string | null;
  children: React.ReactNode;
};

export function PostHogProvider({
  userId,
  userEmail,
  children,
}: PostHogProviderProps) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    try {
      initPostHog();
    } catch {
      // PostHog init failed — silent no-op
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    try {
      posthog.identify(userId, {
        email: userEmail ?? undefined,
      });
    } catch {
      // PostHog identify failed — silent no-op
    }
  }, [userId, userEmail]);

  return <>{children}</>;
}
