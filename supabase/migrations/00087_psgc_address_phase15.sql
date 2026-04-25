-- ============================================================
-- 00087_psgc_address_phase15.sql
-- Avalon Sales Phase 1.5 — PSGC address reference + cascading picker
--
-- Adds Philippines Standard Geographic Code (PSGC) reference tables:
--   ph_regions    — 17 admin regions (NCR, R-I, R-II, ...)
--   ph_cities     — ~1,500 cities/municipalities, FK to region
--   ph_barangays  — ~42,000 barangays, FK to city, with postal_code
--
-- Seeded via scripts/sales/seed-psgc.ts which fetches from psgc.gitlab.io.
-- Run AFTER this migration applies:
--   bun scripts/sales/seed-psgc.ts
--
-- Adds FK columns to customers so address_line_1 + structured codes
-- coexist (Phase 1 free-text fields stay; new code FKs add validation).
-- ============================================================


-- ==========================
-- 1. PSGC reference tables
-- ==========================

CREATE TABLE IF NOT EXISTS public.ph_regions (
  code        text PRIMARY KEY,                          -- e.g. "130000000" (PSGC 9-digit)
  short_code  text NOT NULL UNIQUE,                      -- e.g. "NCR" / "R-I"
  name        text NOT NULL,                             -- e.g. "National Capital Region"
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ph_cities (
  code         text PRIMARY KEY,                         -- PSGC 9-digit city/municipality code
  region_code  text NOT NULL REFERENCES public.ph_regions(code),
  name         text NOT NULL,
  city_class   text,                                     -- "City" / "Municipality" / "Sub-Municipality"
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ph_cities_region ON public.ph_cities (region_code);
CREATE INDEX IF NOT EXISTS idx_ph_cities_name_trgm
  ON public.ph_cities USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.ph_barangays (
  code         text PRIMARY KEY,                         -- PSGC 9-digit barangay code
  city_code    text NOT NULL REFERENCES public.ph_cities(code),
  name         text NOT NULL,
  postal_code  text,                                     -- often null in PSGC source; backfill later
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ph_barangays_city ON public.ph_barangays (city_code);
CREATE INDEX IF NOT EXISTS idx_ph_barangays_postal
  ON public.ph_barangays (postal_code) WHERE postal_code IS NOT NULL;

-- updated_at triggers (reuse existing helper)
DROP TRIGGER IF EXISTS trg_ph_regions_updated_at ON public.ph_regions;
CREATE TRIGGER trg_ph_regions_updated_at
  BEFORE UPDATE ON public.ph_regions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ph_cities_updated_at ON public.ph_cities;
CREATE TRIGGER trg_ph_cities_updated_at
  BEFORE UPDATE ON public.ph_cities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ph_barangays_updated_at ON public.ph_barangays;
CREATE TRIGGER trg_ph_barangays_updated_at
  BEFORE UPDATE ON public.ph_barangays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- 2. Customer FK columns
-- ==========================
-- Coexist with existing free-text fields so legacy data stays readable.
-- The Phase 1.5 UI writes BOTH the structured code AND the resolved name
-- text into city_text/region_text/postal_code so existing reports keep working.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS region_code   text REFERENCES public.ph_regions(code),
  ADD COLUMN IF NOT EXISTS city_code     text REFERENCES public.ph_cities(code),
  ADD COLUMN IF NOT EXISTS barangay_code text REFERENCES public.ph_barangays(code);

CREATE INDEX IF NOT EXISTS idx_customers_region_code
  ON public.customers (region_code) WHERE region_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_city_code
  ON public.customers (city_code) WHERE city_code IS NOT NULL;
