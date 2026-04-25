-- ============================================================
-- 00088_psgc_submuni_parent.sql
-- Adds a self-referencing parent_city_code on ph_cities so the address
-- picker can show Manila → (Sampaloc, Tondo I, Binondo, …) → barangay
-- as a folded hierarchy instead of dumping all 17 sub-munis as siblings
-- of the chartered city in the cities dropdown.
--
-- Backfilled by re-running:
--   bun scripts/sales/seed-psgc.ts
-- (Sub-municipality rows now carry parent_city_code; chartered cities
-- and ordinary municipalities keep parent_city_code NULL.)
-- ============================================================

ALTER TABLE public.ph_cities
  ADD COLUMN IF NOT EXISTS parent_city_code text
    REFERENCES public.ph_cities(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ph_cities_parent
  ON public.ph_cities (parent_city_code)
  WHERE parent_city_code IS NOT NULL;
