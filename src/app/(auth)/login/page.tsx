"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "credentials" | "mfa";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [step, setStep] = useState<Step>("credentials");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");

  const mfaInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Check if MFA is required
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      aalData &&
      aalData.nextLevel === "aal2" &&
      aalData.nextLevel !== aalData.currentLevel
    ) {
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
        // Auto-focus the MFA input on next render
        setTimeout(() => mfaInputRef.current?.focus(), 0);
        return;
      }
    }

    // No MFA required — proceed
    router.push("/");
    router.refresh();
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: mfaChallengeId,
      code: mfaCode.replace(/\s/g, ""),
    });

    if (verifyError) {
      setError("Invalid code. Please try again.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  function handleBackToCredentials() {
    setStep("credentials");
    setMfaCode("");
    setError(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Avalon</h1>
            {step === "credentials" && (
              <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
            )}
            {step === "mfa" && (
              <p className="text-sm text-gray-500 mt-1">Two-factor authentication</p>
            )}
          </div>

          {step === "credentials" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="you@finncotton.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}

          {step === "mfa" && (
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <button
                type="button"
                onClick={handleBackToCredentials}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-2"
              >
                <span aria-hidden="true">←</span> Back
              </button>

              <p className="text-sm text-gray-500 text-center">
                Enter the 6-digit code from your authenticator app.
              </p>

              <div>
                <input
                  ref={mfaInputRef}
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg text-xl font-mono tabular-nums tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="000000"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || mfaCode.length < 6}
                className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Verifying..." : "Verify"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
