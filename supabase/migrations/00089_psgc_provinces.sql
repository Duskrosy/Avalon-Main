-- ============================================================
-- 00089_psgc_provinces.sql
-- Adds ph_provinces and a province_code FK on ph_cities so we can
-- resolve a customer's PH province name when writing to Shopify
-- (Shopify validates the address province against the country's real
-- province list — "Region V" / "NCR" don't pass; "Camarines Sur" /
-- "Metro Manila" do).
--
-- Backfilled by re-running:
--   bun scripts/sales/seed-psgc.ts
-- (the seeder fetches /provinces/ from psgc.gitlab.io and writes
-- ph_cities.province_code from each city's PSGC provinceCode field).
-- NCR cities have provinceCode:false in PSGC and stay NULL here;
-- the Shopify resolver falls back to "Metro Manila" for NCR.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ph_provinces (
  code        text PRIMARY KEY,
  region_code text NOT NULL REFERENCES public.ph_regions(code),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ph_provinces_region
  ON public.ph_provinces (region_code);

DROP TRIGGER IF EXISTS trg_ph_provinces_updated_at ON public.ph_provinces;
CREATE TRIGGER trg_ph_provinces_updated_at
  BEFORE UPDATE ON public.ph_provinces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ph_cities
  ADD COLUMN IF NOT EXISTS province_code text
    REFERENCES public.ph_provinces(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ph_cities_province
  ON public.ph_cities (province_code)
  WHERE province_code IS NOT NULL;
