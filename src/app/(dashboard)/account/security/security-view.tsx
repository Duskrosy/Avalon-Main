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
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Account Security</h1>
      <p className="text-sm text-gray-500 mb-8">
        Manage two-factor authentication (2FA) for your account.
      </p>

      {/* Success banner */}
      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
          Two-factor authentication enabled successfully.
        </div>
      )}

      {/* Current factors */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Authenticator Apps</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Use an app like Google Authenticator, Authy, or 1Password.
            </p>
          </div>
          {verifiedFactors.length === 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-200">
              Not enabled
            </span>
          )}
          {verifiedFactors.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium border border-green-200">
              Active
            </span>
          )}
        </div>

        {loading ? (
          <div className="px-5 py-6 text-sm text-gray-400">Loading...</div>
        ) : verifiedFactors.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-500">
            No authenticator app registered yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {verifiedFactors.map((f) => (
              <li key={f.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {f.friendly_name || "Authenticator App"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Added {new Date(f.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                </div>
                <button
                  onClick={() => unenroll(f.id)}
                  disabled={unenrolling === f.id}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
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
          className="w-full py-2.5 px-4 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {enrolling ? "Setting up..." : "Add authenticator app"}
        </button>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Scan QR code</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Open your authenticator app and scan the code below.
            </p>
          </div>

          <div className="px-5 py-5 space-y-5">
            {/* QR code */}
            <div className="flex justify-center">
              <div
                className="rounded-xl border border-gray-200 p-3 bg-white"
                dangerouslySetInnerHTML={{ __html: enrollData.totp.qr_code }}
              />
            </div>

            {/* Secret toggle */}
            <div className="text-center">
              <button
                onClick={() => setShowSecret((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                {showSecret ? "Hide" : "Can't scan? Enter secret manually"}
              </button>
              {showSecret && (
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 tracking-widest break-all text-center">
                  {enrollData.totp.secret}
                </div>
              )}
            </div>

            {/* Code input */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
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
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-center text-xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder:tracking-normal placeholder:text-gray-300"
              />
              {verifyError && (
                <p className="mt-1.5 text-xs text-red-500">{verifyError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelEnroll}
                className="flex-1 py-2.5 px-4 border border-gray-200 text-sm text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmEnroll}
                disabled={verifyCode.length !== 6 || verifying}
                className="flex-1 py-2.5 px-4 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {verifying ? "Verifying..." : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {verifyError && !enrollData && (
        <p className="mt-3 text-xs text-red-500">{verifyError}</p>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Supabase does not support recovery codes. Register a second authenticator app
        on a different device as a backup.
      </p>
    </div>
  );
}
