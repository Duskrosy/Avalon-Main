"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side auth confirmation page.
 *
 * Handles two Supabase auth flows:
 *   1. PKCE  — ?code=xxx  (magic link, password reset with PKCE)
 *   2. Implicit — #access_token=xxx&refresh_token=xxx  (older flow / some email clients)
 *
 * Why client-side instead of a Route Handler?
 * @supabase/ssr stores the PKCE code verifier in a cookie that is set on the
 * browser client. When the email link arrives, the browser needs to exchange
 * the code using that verifier. A server Route Handler *can* do this if the
 * cookie is forwarded correctly, but it fails silently if the verifier cookie
 * is missing (e.g. different browser, incognito). A client component reads the
 * verifier cookie directly and is far more reliable.
 */
function AuthConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const next = searchParams.get("next") ?? "/";
    const safeNext = next.startsWith("/") ? next : "/";

    async function handleAuth() {
      const supabase = createClient();

      // ── Flow 1: PKCE (code in query string) ─────────────────────────────
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("Auth code exchange failed:", error.message);
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }

        // Guard: make sure this user has an Avalon profile.
        // New OAuth sign-ins (e.g. Discord with no matching account) must be
        // blocked — only existing Avalon users may use social login.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

          if (!profile) {
            await supabase.auth.signOut();
            router.replace("/login?error=no_account");
            return;
          }

          // Redirect to password change if flagged
          const { data: secProfile } = await supabase
            .from("profiles")
            .select("must_change_password")
            .eq("id", user.id)
            .maybeSingle();

          if (secProfile?.must_change_password) {
            router.replace("/account/settings?tab=security");
            return;
          }
        }

        router.replace(safeNext);
        return;
      }

      // ── Flow 2: Implicit (tokens in hash fragment) ───────────────────────
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.slice(1));
        const accessToken  = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token:  accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error("Session set failed:", error.message);
            router.replace(`/login?error=${encodeURIComponent(error.message)}`);
            return;
          }
          router.replace(safeNext);
          return;
        }
      }

      // Nothing to exchange — already authenticated or stale link
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace(safeNext);
      } else {
        router.replace("/login?error=Invalid+or+expired+link");
      }
    }

    handleAuth();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#3A5635] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Signing you in…</p>
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#3A5635] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Signing you in…</p>
          </div>
        </div>
      }
    >
      <AuthConfirmInner />
    </Suspense>
  );
}
