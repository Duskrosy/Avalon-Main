-- ============================================================
-- 00091_orders_shopify_name.sql
-- Capture Shopify's human-readable order identifiers on Avalon orders
-- so the list/detail UI can show "#FC1234" (what Shopify and the
-- customer see) instead of the internal "AV-10284" reference.
--
-- shopify_order_name   — the display string ("#FC1234")
-- shopify_order_number — the numeric counter Shopify increments
--
-- Both populated on confirm-flow success and on reconciler recovery.
-- avalon_order_number stays as the local reference for retries /
-- recovery via note_attributes.avalon_order_number.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shopify_order_name   text,
  ADD COLUMN IF NOT EXISTS shopify_order_number integer;

CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_name
  ON public.orders (shopify_order_name)
  WHERE shopify_order_name IS NOT NULL;

ALTER TABLE public.order_shopify_syncs
  ADD COLUMN IF NOT EXISTS shopify_order_name   text,
  ADD COLUMN IF NOT EXISTS shopify_order_number integer;
