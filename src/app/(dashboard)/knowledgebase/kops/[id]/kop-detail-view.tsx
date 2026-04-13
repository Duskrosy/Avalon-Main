"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

type Version = {
  id: string;
  version_number: number;
  file_url: string;
  file_type: string | null;
  change_notes: string | null;
  created_at: string;
  signed_url: string | null;
  uploaded_by_profile: { first_name: string; last_name: string } | null;
};

type Kop = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  current_version: number;
  created_at: string;
  department: { id: string; name: string } | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type Props = {
  kop: Kop;
  versions: Version[];
  currentVersion: Version | null;
  canManage: boolean;
  canDelete: boolean;
};

function FileViewer({ version }: { version: Version }) {
  const url = version.signed_url;
  const ext = (version.file_type ?? "").toLowerCase();

  if (!url) return <p className="text-sm text-gray-400 p-8 text-center">File unavailable.</p>;

  if (ext === "pdf") {
    return (
      <iframe
        src={url}
        className="w-full h-[70vh] rounded-lg border border-gray-200"
        title="KOP Document"
      />
    );
  }

  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext)) {
    const googleUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    return (
      <iframe
        src={googleUrl}
        className="w-full h-[70vh] rounded-lg border border-gray-200"
        title="KOP Document"
      />
    );
  }

  if (["mp4", "mov", "webm"].includes(ext)) {
    return (
      <video controls className="w-full rounded-lg border border-gray-200 max-h-[70vh]">
        <source src={url} />
      </video>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <p className="text-sm text-gray-500">Preview not available for this file type.</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700"
      >
        Download file
      </a>
    </div>
  );
}

export function KopDetailView({ kop, versions, currentVersion, canManage, canDelete }: Props) {
  const router = useRouter();
  const [activeVersion, setActiveVersion] = useState<Version | null>(currentVersion);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadNotes, setUploadNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError("File must be under 100MB.");
      return;
    }
    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    if (uploadNotes) fd.append("change_notes", uploadNotes);

    const res = await fetch(`/api/kops/${kop.id}/versions`, { method: "POST", body: fd });
    if (res.ok) {
      router.refresh();
      setShowUpload(false);
      setUploadNotes("");
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Failed to upload version. Please try again.");
    }
    setUploading(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${kop.title}" and all versions? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/kops/${kop.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/knowledgebase/kops");
    } else {
      setError("Failed to delete KOP.");
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/knowledgebase/kops" className="text-sm text-gray-400 hover:text-gray-600">
          ← KOP Library
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold text-gray-900">{kop.title}</h1>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              v{kop.current_version}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-gray-400">
            {kop.department ? (
              <span>{kop.department.name}</span>
            ) : (
              <span className="text-blue-500">Global</span>
            )}
            {kop.category && <span>· {kop.category}</span>}
            {kop.created_by_profile && (
              <span>· {kop.created_by_profile.first_name} {kop.created_by_profile.last_name}</span>
            )}
            <span>· {format(new Date(kop.created_at), "d MMM yyyy")}</span>
          </div>
          {kop.description && (
            <p className="text-sm text-gray-500 mt-2">{kop.description}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {canManage && (
            <button
              onClick={() => setShowUpload(true)}
              className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700"
            >
              New version
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && !showUpload && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Version sidebar */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Versions</h3>
          {versions.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveVersion(v)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                activeVersion?.id === v.id
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">v{v.version_number}</span>
                {v.version_number === kop.current_version && (
                  <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">Current</span>
                )}
              </div>
              {v.change_notes && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{v.change_notes}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {format(new Date(v.created_at), "d MMM yyyy")}
              </p>
            </button>
          ))}
        </div>

        {/* Viewer */}
        <div className="lg:col-span-3">
          {activeVersion ? (
            <FileViewer version={activeVersion} />
          ) : (
            <p className="text-sm text-gray-400 p-8 text-center">Select a version to preview.</p>
          )}
        </div>
      </div>

      {/* New version modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload New Version</h2>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleNewVersion} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">File *</label>
                <input
                  required
                  ref={fileRef}
                  type="file"
                  aria-label="Upload new version file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp4,.mov"
                  className="w-full text-sm text-gray-600"
                />
                <p className="text-[10px] text-gray-400 mt-1">Max 100MB</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Change notes</label>
                <input
                  type="text"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="What changed?"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
