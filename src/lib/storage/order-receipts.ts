import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "order-receipts";

export function buildReceiptPath(orderId: string, ext: string): string {
  const ts = Date.now();
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6) || "bin";
  return `orders/${orderId}/receipt-${ts}.${safeExt}`;
}

/** Returns a 5-minute signed URL for previewing/downloading a stored receipt. */
export async function signedReceiptUrl(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Returns a one-time signed UPLOAD URL the client can PUT the file to. */
export async function signedReceiptUploadUrl(orderId: string, ext: string) {
  const admin = createAdminClient();
  const path = buildReceiptPath(orderId, ext);
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return null;
  return { path, signedUrl: data.signedUrl, token: data.token };
}
