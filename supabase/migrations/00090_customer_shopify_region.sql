-- ============================================================
-- 00090_customer_shopify_region.sql
-- Adds customers.shopify_region — the agent-visible value sent to
-- Shopify's address.province field. Auto-fills from the PSGC cascade
-- (city → ph_provinces.name, "Metro Manila" for NCR) but stays
-- editable in the drawer so the agent can override when PSGC and
-- Shopify naming drift apart (Davao de Oro / Compostela Valley,
-- Maguindanao splits, etc.).
--
-- Replaces the silent server-side resolver — having the value on the
-- form lets the agent see what Shopify will receive and trust the
-- write-through.
-- ============================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS shopify_region text;
