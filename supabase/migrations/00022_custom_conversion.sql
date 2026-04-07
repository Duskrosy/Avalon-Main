-- Migration 00022: Primary custom conversion per Meta account
-- Stores which Meta custom conversion to use as the purchase event
-- instead of the default "purchase" action type.

ALTER TABLE public.ad_meta_accounts
  ADD COLUMN IF NOT EXISTS primary_conversion_id   text,   -- Meta custom conversion ID
  ADD COLUMN IF NOT EXISTS primary_conversion_name text;   -- Display name (e.g. "9/28 - PURCHASE")
