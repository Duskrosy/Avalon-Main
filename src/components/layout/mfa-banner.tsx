"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MfaBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = "mfa-banner-dismissed";
    if (sessionStorage.getItem(key)) return;

    const supabase = createClient();
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const hasTotp = data?.totp?.some((f) => f.status === "verified");
      if (!hasTotp) setShow(true);
    }).catch(() => {});
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-amber-600 font-medium">Security reminder:</span>
        <span className="text-amber-700">
          Your account role has elevated permissions. Enable two-factor authentication (2FA) to keep it secure.
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="/account/security"
          className="text-amber-700 font-medium hover:underline"
        >
          Set up 2FA →
        </a>
        <button
          onClick={() => {
            sessionStorage.setItem("mfa-banner-dismissed", "1");
            setDismissed(true);
          }}
          className="text-amber-500 hover:text-amber-700 text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
