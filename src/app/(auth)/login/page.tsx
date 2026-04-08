"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "credentials" | "mfa" | "forgot" | "magic";

export default function LoginPage() {
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
    setForgotResult(null);

    await fetch("/api/auth/forgot-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email }),
    });
    setLoading(false);
    setForgotSent(true);
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Avalon</h1>
            <p className="text-sm text-gray-500 mt-1">
              {step === "credentials" && "Sign in to your account"}
              {step === "mfa"         && "Two-factor authentication"}
              {step === "forgot"      && "Reset your password"}
              {step === "magic"       && "Sign in with email link"}
            </p>
          </div>

          {/* ── Credentials ────────────────────────────────────────────── */}
          {step === "credentials" && (
            <div className="space-y-5">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@company.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                    <button
                      type="button"
                      onClick={() => goTo("forgot")}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Magic link */}
              <button
                type="button"
                onClick={() => goTo("magic")}
                className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <span aria-hidden="true">←</span> Back
              </button>
              <p className="text-sm text-gray-500 text-center">
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
                className="w-full px-3 py-3 border border-gray-300 rounded-lg text-xl font-mono tabular-nums tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit"
                disabled={loading || mfaCode.length < 6}
                className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
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
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <span aria-hidden="true">←</span> Back to sign in
              </button>

              {!forgotSent ? (
                <form onSubmit={handleForgot} className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Enter your registered email and we&apos;ll send you a reset link.
                  </p>
                  <div>
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
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
                    <p className="text-sm font-medium text-gray-900">Check your email</p>
                    <p className="text-xs text-gray-500 mt-1">
                      If a reset link was sent, it will arrive at <strong>{email}</strong> shortly.
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
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
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <span aria-hidden="true">←</span> Back to sign in
              </button>

              {!magicSent ? (
                <form onSubmit={handleMagic} className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Enter your registered email. We&apos;ll send you a one-time sign-in link — no password needed.
                  </p>
                  <div>
                    <label htmlFor="magic-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      id="magic-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
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
                  <p className="text-sm font-medium text-gray-900">Check your email</p>
                  <p className="text-xs text-gray-500">
                    We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in — it expires in 1 hour.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setMagicSent(false); setError(null); }}
                    className="text-xs text-gray-400 hover:text-gray-700 underline"
                  >
                    Resend link
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
