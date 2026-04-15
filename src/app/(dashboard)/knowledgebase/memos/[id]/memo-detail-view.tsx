"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

// ─── Attachment Viewer ────────────────────────────────────────────────────────
function AttachmentViewer({ url, name }: { url: string; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    return (
      <iframe
        src={url}
        className="w-full h-[60vh] rounded-lg border border-[var(--color-border-primary)]"
        title={name}
      />
    );
  }

  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext)) {
    return (
      <iframe
        src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
        className="w-full h-[60vh] rounded-lg border border-[var(--color-border-primary)]"
        title={name}
      />
    );
  }

  // Fallback: download link for unsupported types
  return (
    <div className="flex items-center justify-center h-24 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-primary)]">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download {name}
      </a>
    </div>
  );
}

type Signature = {
  id: string;
  user_id: string;
  signed_at: string;
  profile: { first_name: string; last_name: string } | null;
};

type Memo = {
  id: string;
  title: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_signed_url: string | null;
  created_at: string;
  department: { id: string; name: string } | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type Props = {
  memo: Memo;
  signatures: Signature[];
  hasSigned: boolean;
  totalStaff: number;
  currentUserId: string;
  canDelete: boolean;
};

export function MemoDetailView({ memo, signatures, hasSigned: initialSigned, totalStaff, currentUserId, canDelete }: Props) {
  const router = useRouter();
  const [signed, setSigned] = useState(initialSigned);
  const [sigCount, setSigCount] = useState(signatures.length);
  const [sigList, setSigList] = useState<Signature[]>(signatures);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const progress = totalStaff > 0 ? Math.round((sigCount / totalStaff) * 100) : 0;

  const handleSign = async () => {
    setLoading(true);
    setError(null);
    const wasSigned = signed;
    const method = wasSigned ? "DELETE" : "POST";

    // Optimistic update
    if (!wasSigned) {
      setSigCount((c) => c + 1);
      setSigned(true);
    } else {
      setSigCount((c) => c - 1);
      setSigned(false);
      setSigList((list) => list.filter((s) => s.user_id !== currentUserId));
    }

    const res = await fetch(`/api/memos/${memo.id}/sign`, { method });
    if (!res.ok) {
      // Rollback on failure
      setSigned(wasSigned);
      setSigCount(wasSigned ? sigCount : sigCount);
      if (wasSigned) {
        setSigList(signatures);
      }
      setError(wasSigned ? "Failed to unsign. Please try again." : "Failed to sign. Please try again.");
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${memo.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/memos/${memo.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/knowledgebase/memos");
    } else {
      setError("Failed to delete memo.");
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Link href="/knowledgebase/memos" className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
          ← Memos
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content — memo text + file viewer */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-1">{memo.title}</h1>
                <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-tertiary)]">
                  {memo.department ? (
                    <span>{memo.department.name}</span>
                  ) : (
                    <span className="text-[var(--color-accent)]">Global</span>
                  )}
                  {memo.created_by_profile && (
                    <>
                      <span>·</span>
                      <span>{memo.created_by_profile.first_name} {memo.created_by_profile.last_name}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{format(new Date(memo.created_at), "d MMM yyyy")}</span>
                </div>
              </div>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs border border-red-200 text-[var(--color-error)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-error-light)] shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>

            <div className="prose prose-sm max-w-none text-[var(--color-text-primary)] whitespace-pre-wrap border-t border-[var(--color-border-secondary)] pt-4">
              {memo.content}
            </div>

            {/* Attachment */}
            {memo.attachment_name && (
              <div className="mt-4 pt-4 border-t border-[var(--color-border-secondary)]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">Attachment</p>
                  {memo.attachment_signed_url && (
                    <a
                      href={memo.attachment_signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] flex items-center gap-1"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Open in new tab
                    </a>
                  )}
                </div>
                {memo.attachment_signed_url ? (
                  <AttachmentViewer url={memo.attachment_signed_url} name={memo.attachment_name} />
                ) : (
                  <p className="text-xs text-[var(--color-text-tertiary)] py-4 text-center bg-[var(--color-bg-secondary)] rounded-lg">
                    Attachment unavailable. The link may have expired — try refreshing.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — signatures + sign button */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Signatures</h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-3">{sigCount} of {totalStaff} staff</p>

            {/* Progress bar */}
            <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-[var(--color-success)] rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sigList.length === 0 ? (
                <p className="text-xs text-[var(--color-text-tertiary)] py-2">No signatures yet.</p>
              ) : (
                sigList.map((sig) => (
                  <div key={sig.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[var(--color-success-light)] flex items-center justify-center text-[var(--color-success)] text-xs shrink-0">
                      ✓
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                        {sig.profile
                          ? `${sig.profile.first_name} ${sig.profile.last_name}`
                          : "Unknown"}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        {format(new Date(sig.signed_at), "d MMM")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--color-border-secondary)] space-y-2">
              {error && (
                <p className="text-xs text-[var(--color-error)] text-center">{error}</p>
              )}
              <button
                onClick={handleSign}
                disabled={loading}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  signed
                    ? "bg-[var(--color-success-light)] text-[var(--color-success)] border border-green-200 hover:bg-[var(--color-success-light)]"
                    : "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)]"
                } disabled:opacity-50`}
              >
                {loading ? "..." : signed ? "Signed — click to unsign" : "Sign this memo"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
