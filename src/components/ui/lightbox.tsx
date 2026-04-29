"use client";

import { useEffect } from "react";

type LightboxProps = {
  url: string;
  alt?: string | null;
  mimeType?: string | null;
  onClose: () => void;
};

// Inline preview for an uploaded file. Images render as <img>; PDFs in an iframe.
// Anything else falls back to a download link inside the overlay.
export function Lightbox({ url, alt, mimeType, onClose }: LightboxProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white p-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={alt ?? ""}
            className="max-w-full max-h-[90vh] rounded-md shadow-2xl object-contain"
          />
        ) : isPdf ? (
          <iframe
            src={url}
            title={alt ?? "PDF preview"}
            className="w-[90vw] h-[90vh] rounded-md bg-white shadow-2xl"
          />
        ) : (
          <div className="bg-[var(--color-bg-primary)] rounded-md shadow-2xl px-6 py-5">
            <p className="text-sm text-[var(--color-text-primary)] mb-3">
              {alt ?? "Attachment"} can&apos;t be previewed inline.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline"
            >
              Open in new tab ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
