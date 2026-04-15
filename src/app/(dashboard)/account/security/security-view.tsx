"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
  created_at: string;
};

type EnrollData = {
  id: string;
  totp: {
    qr_code: string;   // SVG string
    secret: string;
    uri: string;
  };
};

export function SecurityView() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);

  // Enroll flow state
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [success, setSuccess] = useState(false);

  // Unenroll state
  const [unenrolling, setUnenrolling] = useState<string | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  async function loadFactors() {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp ?? []);
    setLoading(false);
  }

  useEffect(() => { loadFactors(); }, []);

  // Focus code input when QR appears
  useEffect(() => {
    if (enrollData) setTimeout(() => codeRef.current?.focus(), 100);
  }, [enrollData]);

  async function startEnroll() {
    setEnrolling(true);
    setVerifyError(null);
    setVerifyCode("");
    setShowSecret(false);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setEnrolling(false);
    if (error || !data) {
      setVerifyError(error?.message ?? "Could not start enrollment.");
      return;
    }
    setEnrollData(data as unknown as EnrollData);
  }

  async function confirmEnroll() {
    if (!enrollData || verifyCode.length !== 6) return;
    setVerifying(true);
    setVerifyError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollData.id,
      code: verifyCode,
    });
    setVerifying(false);
    if (error) {
      setVerifyError("Invalid code — check your authenticator app and try again.");
      setVerifyCode("");
      codeRef.current?.focus();
      return;
    }
    setEnrollData(null);
    setSuccess(true);
    await loadFactors();
    setTimeout(() => setSuccess(false), 4000);
  }

  async function unenroll(factorId: string) {
    setUnenrolling(factorId);
    await supabase.auth.mfa.unenroll({ factorId });
    setUnenrolling(null);
    await loadFactors();
  }

  function cancelEnroll() {
    // If enrollment was started, unenroll the unverified factor to clean up
    if (enrollData) {
      supabase.auth.mfa.unenroll({ factorId: enrollData.id }).catch(() => {});
    }
    setEnrollData(null);
    setVerifyCode("");
    setVerifyError(null);
  }

  const verifiedFactors = factors.filter((f) => f.status === "verified");

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-1">Account Security</h1>
      <p className="text-sm text-[var(--color-text-secondary)] mb-8">
        Manage two-factor authentication (2FA) for your account.
      </p>

      {/* Success banner */}
      {success && (
        <div className="mb-6 bg-[var(--color-success-light)] border border-green-200 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-[var(--color-success)] font-medium">
          Two-factor authentication enabled successfully.
        </div>
      )}

      {/* Current factors */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Authenticator Apps</h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Use an app like Google Authenticator, Authy, or 1Password.
            </p>
          </div>
          {verifiedFactors.length === 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning)] font-medium border border-[var(--color-border-primary)]">
              Not enabled
            </span>
          )}
          {verifiedFactors.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--color-success-light)] text-[var(--color-success)] font-medium border border-green-200">
              Active
            </span>
          )}
        </div>

        {loading ? (
          <div className="px-5 py-6 text-sm text-[var(--color-text-tertiary)]">Loading...</div>
        ) : verifiedFactors.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[var(--color-text-secondary)]">
            No authenticator app registered yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {verifiedFactors.map((f) => (
              <li key={f.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {f.friendly_name || "Authenticator App"}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    Added {new Date(f.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                </div>
                <button
                  onClick={() => unenroll(f.id)}
                  disabled={unenrolling === f.id}
                  className="text-xs text-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-40"
                >
                  {unenrolling === f.id ? "Removing..." : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Enroll flow */}
      {!enrollData ? (
        <button
          onClick={startEnroll}
          disabled={enrolling}
          className="w-full py-2.5 px-4 bg-[var(--color-text-primary)] text-white text-sm font-medium rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
        >
          {enrolling ? "Setting up..." : "Add authenticator app"}
        </button>
      ) : (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Scan QR code</h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Open your authenticator app and scan the code below.
            </p>
          </div>

          <div className="px-5 py-5 space-y-5">
            {/* QR code */}
            <div className="flex justify-center">
              <div
                className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] p-3 bg-[var(--color-bg-primary)]"
                dangerouslySetInnerHTML={{ __html: enrollData.totp.qr_code }}
              />
            </div>

            {/* Secret toggle */}
            <div className="text-center">
              <button
                onClick={() => setShowSecret((v) => !v)}
                className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] underline"
              >
                {showSecret ? "Hide" : "Can't scan? Enter secret manually"}
              </button>
              {showSecret && (
                <div className="mt-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] tracking-widest break-all text-center">
                  {enrollData.totp.secret}
                </div>
              )}
            </div>

            {/* Code input */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1.5">
                Enter the 6-digit code from your app
              </label>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => {
                  setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setVerifyError(null);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") confirmEnroll(); }}
                placeholder="000000"
                className="w-full border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-2.5 text-center text-xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] placeholder:tracking-normal placeholder:text-[var(--color-text-tertiary)]"
              />
              {verifyError && (
                <p className="mt-1.5 text-xs text-[var(--color-error)]">{verifyError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelEnroll}
                className="flex-1 py-2.5 px-4 border border-[var(--color-border-primary)] text-sm text-[var(--color-text-secondary)] rounded-[var(--radius-lg)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmEnroll}
                disabled={verifyCode.length !== 6 || verifying}
                className="flex-1 py-2.5 px-4 bg-[var(--color-text-primary)] text-white text-sm font-medium rounded-[var(--radius-lg)] hover:bg-[var(--color-text-secondary)] disabled:opacity-40 transition-colors"
              >
                {verifying ? "Verifying..." : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {verifyError && !enrollData && (
        <p className="mt-3 text-xs text-[var(--color-error)]">{verifyError}</p>
      )}

      <p className="mt-6 text-xs text-[var(--color-text-tertiary)]">
        Supabase does not support recovery codes. Register a second authenticator app
        on a different device as a backup.
      </p>
    </div>
  );
}
