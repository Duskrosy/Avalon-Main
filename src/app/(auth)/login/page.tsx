"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/ui/password-input";

type Step = "credentials" | "mfa" | "forgot" | "magic" | "force_change";

function LoginInner() {
  const router = useRouter();

  // Shared
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [step,     setStep]     = useState<Step>("credentials");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // MFA
  const [mfaCode,        setMfaCode]        = useState("");
  const [mfaFactorId,    setMfaFactorId]    = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const mfaInputRef = useRef<HTMLInputElement>(null);

  // Forgot password result
  const [forgotSent, setForgotSent] = useState(false);

  // Magic link result
  const [magicSent, setMagicSent] = useState(false);

  // Force change password
  const [forceNew,     setForceNew]     = useState("");
  const [forceConfirm, setForceConfirm] = useState("");

  // Error from OAuth redirect (e.g. no Avalon account)
  const searchParams = useSearchParams();
  const oauthError   = searchParams.get("error");

  // Track whether must_change_password is set so we can block SSO early
  const [mustChangePw, setMustChangePw] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.app_metadata?.must_change_password) {
        setMustChangePw(true);
        setStep("force_change");
      }
    });
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function goTo(s: Step) {
    setStep(s);
    setError(null);
    setForgotSent(false);
    setMagicSent(false);
  }

  // ── Credentials sign-in ───────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Check if MFA is required
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.nextLevel === "aal2" && aalData.nextLevel !== aalData.currentLevel) {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.[0];
      if (totpFactor) {
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
        if (challengeError || !challengeData) {
          setError("Failed to start MFA challenge. Please try again.");
          setLoading(false);
          return;
        }
        setMfaFactorId(totpFactor.id);
        setMfaChallengeId(challengeData.id);
        setStep("mfa");
        setLoading(false);
        setTimeout(() => mfaInputRef.current?.focus(), 0);
        return;
      }
    }

    // Check must_change_password — show inline step instead of redirecting
    const { data: { user: loggedInUser } } = await supabase.auth.getUser();
    if (loggedInUser?.app_metadata?.must_change_password) {
      setLoading(false);
      setStep("force_change");
      return;
    }

    router.push("/");
    router.refresh();
  }

  // ── MFA verify ────────────────────────────────────────────────────────────

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId:    mfaFactorId,
      challengeId: mfaChallengeId,
      code:        mfaCode.replace(/\s/g, ""),
    });

    if (verifyError) {
      setError("Invalid code. Please try again.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  // ── Forgot password ───────────────────────────────────────────────────────

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    await fetch("/api/auth/forgot-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email }),
    });
    setLoading(false);
    setForgotSent(true);
  }

  // ── Discord OAuth ─────────────────────────────────────────────────────────

  async function handleDiscord() {
    setLoading(true);
    const supabase   = createClient();
    const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/")}`;
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options:  { redirectTo },
    });
    // Browser navigates away — no need to setLoading(false)
  }

  // ── Magic link ────────────────────────────────────────────────────────────

  async function handleMagic(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase   = createClient();
    const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/")}`;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });

    setLoading(false);

    if (otpError) {
      // Most likely the email doesn't exist — show generic message
      setError("Could not send a sign-in link. Make sure you're using your registered email.");
      return;
    }

    setMagicSent(true);
  }

  // ── Force change password ─────────────────────────────────────────────────

  async function handleForceChange(e: React.FormEvent) {
    e.preventDefault();
    if (forceNew !== forceConfirm) { setError("Passwords don't match."); return; }
    if (forceNew.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: pwError } = await supabase.auth.updateUser({ password: forceNew });
    if (pwError) { setError(pwError.message); setLoading(false); return; }

    // Clear the flag on the profile (also clears app_metadata via the API route)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await fetch(`/api/users/${user.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ must_change_password: false }),
      });
    }

    router.push("/");
    router.refresh();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-secondary)]">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--color-bg-primary)] rounded-2xl shadow-sm border border-[var(--color-border-primary)] p-8">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Avalon</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {step === "credentials"  && "Sign in to your account"}
              {step === "mfa"          && "Two-factor authentication"}
              {step === "forgot"       && "Reset your password"}
              {step === "magic"        && "Sign in with email link"}
              {step === "force_change" && "Set a new password"}
            </p>
          </div>

          {/* ── Credentials ────────────────────────────────────────────── */}
          {step === "credentials" && (
            <div className="space-y-5">
              {/* OAuth error banners */}
              {oauthError === "no_account" && (
                <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-amber-800">
                  No Avalon account is linked to that Discord. Sign in with your email first, then connect Discord from your account settings.
                </div>
              )}
              {oauthError && oauthError !== "no_account" && (
                <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-amber-800">
                  {oauthError.includes("PKCE") || oauthError.includes("code verifier")
                    ? "You need to set a new password before signing in with SSO. Please sign in with your email and password first."
                    : decodeURIComponent(oauthError)}
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@company.com"
                    className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className="block text-sm font-medium text-[var(--color-text-primary)]">Password</label>
                    <button
                      type="button"
                      onClick={() => goTo("forgot")}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>

                {error && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-lg">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2 px-4 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--color-border-primary)]" />
                <span className="text-xs text-[var(--color-text-tertiary)]">or</span>
                <div className="flex-1 h-px bg-[var(--color-border-primary)]" />
              </div>

              {/* Discord */}
              <button
                type="button"
                onClick={mustChangePw ? undefined : handleDiscord}
                disabled={loading || mustChangePw}
                title={mustChangePw ? "Change your password first before signing in with SSO" : undefined}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#5865F2" }}
              >
                {/* Discord logo */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Sign in with Discord
              </button>

              {/* Magic link */}
              <button
                type="button"
                onClick={() => goTo("magic")}
                disabled={mustChangePw}
                title={mustChangePw ? "Change your password first before signing in with SSO" : undefined}
                className="w-full flex items-center justify-center gap-2 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] py-2 px-4 rounded-lg text-sm font-medium hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
                </svg>
                Sign in with email link
              </button>
            </div>
          )}

          {/* ── MFA ────────────────────────────────────────────────────── */}
          {step === "mfa" && (
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <button
                type="button"
                onClick={() => goTo("credentials")}
                className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <span aria-hidden="true">←</span> Back
              </button>
              <p className="text-sm text-[var(--color-text-secondary)] text-center">
                Enter the 6-digit code from your authenticator app.
              </p>
              <input
                ref={mfaInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                autoFocus
                autoComplete="one-time-code"
                placeholder="000000"
                className="w-full px-3 py-3 border border-[var(--color-border-primary)] rounded-lg text-xl font-mono tabular-nums tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              {error && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit"
                disabled={loading || mfaCode.length < 6}
                className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2 px-4 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
            </form>
          )}

          {/* ── Forgot password ─────────────────────────────────────────── */}
          {step === "forgot" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => goTo("credentials")}
                className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <span aria-hidden="true">←</span> Back to sign in
              </button>

              {!forgotSent ? (
                <form onSubmit={handleForgot} className="space-y-4">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Enter your registered email and we&apos;ll send you a reset link.
                  </p>
                  <div>
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Email</label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2 px-4 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              ) : (
                <div className="text-center space-y-4 py-2">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">Check your email</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                      If a reset link was sent, it will arrive at <strong>{email}</strong> shortly.
                    </p>
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)] border-t border-[var(--color-border-secondary)] pt-3">
                    If you don&apos;t have an active email address linked to your Avalon account, or you&apos;re not allowed to change your password, please contact your manager.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Magic link ──────────────────────────────────────────────── */}
          {step === "magic" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => goTo("credentials")}
                className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <span aria-hidden="true">←</span> Back to sign in
              </button>

              {!magicSent ? (
                <form onSubmit={handleMagic} className="space-y-4">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Enter your registered email. We&apos;ll send you a one-time sign-in link — no password needed.
                  </p>
                  <div>
                    <label htmlFor="magic-email" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Email</label>
                    <input
                      id="magic-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>
                  {error && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-lg">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2 px-4 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Sending…" : "Send sign-in link"}
                  </button>
                </form>
              ) : (
                <div className="text-center space-y-3 py-2">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Check your email</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in — it expires in 1 hour.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setMagicSent(false); setError(null); }}
                    className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] underline"
                  >
                    Resend link
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Force change password ───────────────────────────────────── */}
          {step === "force_change" && (
            <form onSubmit={handleForceChange} className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-lg)] px-4 py-3">
                <p className="text-sm text-amber-800 font-medium">Password change required</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Your account requires a new password before you can continue. You cannot skip this step.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">New password</label>
                <PasswordInput
                  required
                  minLength={8}
                  value={forceNew}
                  onChange={(e) => setForceNew(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Confirm new password</label>
                <PasswordInput
                  required
                  minLength={8}
                  value={forceConfirm}
                  onChange={(e) => setForceConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              {error && <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-2 px-4 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
              >
                {loading ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-secondary)]">
          <div className="w-full max-w-sm mx-auto space-y-6 px-4">
            <div className="h-8 w-32 mx-auto animate-pulse rounded bg-[var(--color-border-primary)]" />
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-[var(--color-border-primary)]" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--color-bg-tertiary)]" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-[var(--color-border-primary)]" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--color-bg-tertiary)]" />
              </div>
              <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--color-border-primary)]" />
            </div>
          </div>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
