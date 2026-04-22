-- 00075_download_link.sql
-- Adds a `download_link` text column to creative_content_items so planned
-- pieces can carry an external download-asset URL (e.g. Drive, Dropbox).
-- Parallel to the existing `transfer_link` / `promo_code` pattern — plain
-- text, nullable, no extra constraints.

ALTER TABLE public.creative_content_items
  ADD COLUMN IF NOT EXISTS download_link text;
