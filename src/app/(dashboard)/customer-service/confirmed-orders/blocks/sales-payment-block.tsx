"use client";

import { useEffect, useState } from "react";

// Image path extensions that can be rendered inline.
const IMAGE_EXTS = /\.(jpe?g|png|webp)$/i;

function isImagePath(path: string): boolean {
  return IMAGE_EXTS.test(path.split("?")[0]);
}

type SalesPayment = {
  payment_receipt_path: string | null;
  cs_payment_receipt_path?: string | null;
  payment_reference_number: string | null;
  payment_transaction_at: string | null;
  notes: string | null;
};

type Props = {
  payment: SalesPayment;
  orderId: string;
  /** orders.mode_of_payment — e.g. "GCash", "COD", "Other" */
  mop?: string | null;
  /** orders.payment_other_label — used when mop === "Other" */
  paymentOtherLabel?: string | null;
  /** Disable the CS receipt upload (e.g., when ticket is claimed by another rep). */
  readOnly?: boolean;
};

// Methods where payment proof is a screenshot rather than cash-on-delivery.
// Mirrors the set defined in step-handoff (sales drawer).
const DIGITAL_MOPS = new Set(["GCash", "Credit Card", "Bank Transfer", "QR PH"]);
function isDigitalMop(mop: string | null | undefined): boolean {
  return !!mop && DIGITAL_MOPS.has(mop);
}

// ── Inline receipt image ──────────────────────────────────────────────────────

function ReceiptImage({ orderId, path }: { orderId: string; path: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sales/orders/${orderId}/receipt-signed-url`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const j = await res.json();
        if (!cancelled && j.url) setSignedUrl(j.url);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) {
    return (
      <div className="mt-1.5 h-32 w-full rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] animate-pulse" />
    );
  }

  if (error || !signedUrl) {
    return (
      <button
        type="button"
        onClick={() => {
          fetch(`/api/sales/orders/${orderId}/receipt-signed-url`)
            .then((r) => r.json())
            .then((j) => j.url && window.open(j.url, "_blank"))
            .catch(() => null);
        }}
        className="text-xs text-[var(--color-accent)] hover:opacity-80"
      >
        View receipt ↗
      </button>
    );
  }

  return (
    <div className="mt-1.5">
      <a href={signedUrl} target="_blank" rel="noreferrer">
        <img
          src={signedUrl}
          alt="Payment receipt"
          className="max-h-64 rounded border border-[var(--color-border-secondary)] object-contain hover:opacity-90 transition-opacity"
        />
      </a>
      <div className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">
        Click to open full size
      </div>
    </div>
  );
}

// ── PDF / unknown receipt link ────────────────────────────────────────────────

function ReceiptLink({ orderId }: { orderId: string }) {
  const open = async () => {
    const res = await fetch(`/api/sales/orders/${orderId}/receipt-signed-url`);
    if (!res.ok) return;
    const j = await res.json();
    if (j.url) window.open(j.url, "_blank");
  };
  return (
    <button
      type="button"
      onClick={() => void open()}
      className="text-xs text-[var(--color-accent)] hover:opacity-80"
    >
      View receipt ↗
    </button>
  );
}

// ── CS-uploaded receipt block ────────────────────────────────────────────────

function CsReceiptBlock({
  orderId,
  initialPath,
  readOnly,
}: {
  orderId: string;
  initialPath: string | null;
  readOnly: boolean;
}) {
  const [csPath, setCsPath] = useState<string | null>(initialPath);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch signed display URL whenever csPath changes (and we're not showing a
  // local preview, which takes priority right after upload).
  useEffect(() => {
    if (!csPath) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/customer-service/orders/${orderId}/cs-receipt`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.url) setSignedUrl(j.url); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [orderId, csPath]);

  // Cleanup blob URLs.
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  async function handleUpload(file: File) {
    if (readOnly) return;
    setError(null);
    setUploading(true);
    const blobUrl = URL.createObjectURL(file);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blobUrl;
    });
    try {
      const sigRes = await fetch(`/api/customer-service/orders/${orderId}/cs-receipt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const sig = await sigRes.json();
      if (!sigRes.ok) {
        setError(sig.error ?? "Upload URL failed");
        return;
      }
      const put = await fetch(sig.signedUrl, { method: "PUT", body: file });
      if (!put.ok) {
        setError(`Upload to storage failed (${put.status})`);
        return;
      }
      const commit = await fetch(`/api/customer-service/orders/${orderId}/cs-receipt`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: sig.path }),
      });
      if (!commit.ok) {
        const j = await commit.json().catch(() => ({}));
        setError(j.error ?? `Commit failed (${commit.status})`);
        return;
      }
      setCsPath(sig.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  const previewUrl = localPreviewUrl ?? signedUrl;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">CS receipt</span>
        {!csPath && !uploading && !readOnly && (
          <label className="text-xs text-[var(--color-accent)] hover:opacity-80 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
            />
            + Attach receipt
          </label>
        )}
        {csPath && !readOnly && (
          <label className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
            />
            Replace
          </label>
        )}
        {uploading && (
          <span className="text-[11px] text-[var(--color-text-tertiary)]">Uploading…</span>
        )}
        {readOnly && !csPath && (
          <span className="text-[11px] text-[var(--color-text-tertiary)] italic">none</span>
        )}
      </div>
      {error && (
        <div className="ml-[88px] text-[11px] text-[var(--color-danger)]">{error}</div>
      )}
      {previewUrl && (
        <div className="ml-[88px]">
          <a href={previewUrl} target="_blank" rel="noreferrer">
            <img
              src={previewUrl}
              alt="CS payment receipt"
              className="max-h-64 rounded border border-[var(--color-border-secondary)] object-contain hover:opacity-90 transition-opacity"
            />
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SalesPaymentBlock({ payment, orderId, mop, paymentOtherLabel, readOnly }: Props) {
  // MOP display label: if "Other", use paymentOtherLabel if available.
  const mopLabel = mop === "Other" && paymentOtherLabel ? paymentOtherLabel : (mop ?? null);

  return (
    <div className="space-y-1.5">
      {/* MOP — shown prominently when available */}
      {mopLabel && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Method</span>
          <span className="text-sm font-medium">{mopLabel}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Ref #</span>
        <span className="text-sm">{payment.payment_reference_number ?? "—"}</span>
      </div>

      {payment.payment_transaction_at && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Paid at</span>
          <span className="text-sm">
            {new Date(payment.payment_transaction_at).toLocaleString()}
          </span>
        </div>
      )}

      {payment.payment_receipt_path && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Receipt</span>
            {/* Always show the link; for images also render inline below */}
            <ReceiptLink orderId={orderId} />
          </div>
          {isImagePath(payment.payment_receipt_path) && (
            <div className="ml-[88px]">
              <ReceiptImage orderId={orderId} path={payment.payment_receipt_path} />
            </div>
          )}
        </div>
      )}

      {/* CS-uploaded receipt — shown when MOP is digital OR there's already
          a CS-uploaded one to display. CS reps can attach supplementary proof
          (e.g., a corrected screenshot the customer sent over the phone)
          without overwriting the original sales-uploaded one. */}
      {(isDigitalMop(mop) || payment.cs_payment_receipt_path) && (
        <CsReceiptBlock
          orderId={orderId}
          initialPath={payment.cs_payment_receipt_path ?? null}
          readOnly={!!readOnly}
        />
      )}

      {payment.notes && (
        <div className="flex items-start gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0 pt-0.5">
            Notes
          </span>
          <span className="text-sm text-[var(--color-text-secondary)] italic">{payment.notes}</span>
        </div>
      )}
    </div>
  );
}
