-- ============================================================
-- 00076_inventory_v1.sql
-- Avalon — Omni-channel Inventory v1
--
-- Deprecates the flat inventory_records / inventory_movements
-- tables from 00049 and replaces them with a normalized
-- SKU hierarchy (products -> product_colors -> product_variants)
-- plus a per-location balance ledger with 11 seeded locations.
--
-- Existing tables are renamed with a _deprecated suffix so
-- data can be migrated by the accompanying parsing script
-- (scripts/inventory/migrate-catalog-to-variants.ts) before
-- the next Create Order sprint.
--
-- Design doc:
--   ~/.gstack/projects/Duskrosy-Avalon-Main/
--     fc-international-1-main-design-20260422-162524.md
-- ============================================================


-- ==========================
-- 0. DEPRECATE LEGACY TABLES
-- ==========================
-- Keep data; rename only. The new tables replace them and the
-- SKU parsing / data migration script reads from the deprecated
-- tables to seed the new ones.

ALTER TABLE IF EXISTS public.inventory_records
  RENAME TO inventory_records_deprecated;

ALTER TABLE IF EXISTS public.inventory_movements
  RENAME TO inventory_movements_deprecated;


-- ==========================
-- 1. ENUMS
-- ==========================
DO $$ BEGIN
  CREATE TYPE public.inventory_location_type AS ENUM (
    'source', 'platform', 'onhand', 'store'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_movement_type AS ENUM (
    'initial_stock',
    'allocate',
    'return_pending',
    'return_verified',
    'restock_source',
    'reallocate',
    'adjustment',
    'manual_correction',
    'damage_writeoff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_movement_status AS ENUM (
    'pending', 'completed', 'cancelled', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_verification_status AS ENUM (
    'pending', 'verified_good', 'verified_damaged', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_condition_status AS ENUM (
    'resellable', 'damaged', 'incomplete', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ==========================
-- 2. PRODUCTS (parent SKU)
-- ==========================
CREATE TABLE IF NOT EXISTS public.products (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_sku      text        NOT NULL UNIQUE,
  name            text        NOT NULL,
  category_code   text,
  product_family  text,
  collection      text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_active
  ON public.products (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_family
  ON public.products (product_family) WHERE product_family IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_collection
  ON public.products (collection) WHERE collection IS NOT NULL;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- 3. PRODUCT COLORS
-- ==========================
CREATE TABLE IF NOT EXISTS public.product_colors (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  color_code   text        NOT NULL,
  color_name   text        NOT NULL,
  color_sku    text        NOT NULL UNIQUE,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, color_code)
);

CREATE INDEX IF NOT EXISTS idx_product_colors_product
  ON public.product_colors (product_id);

CREATE TRIGGER trg_product_colors_updated_at
  BEFORE UPDATE ON public.product_colors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- 4. PRODUCT VARIANTS (sellable SKU)
-- ==========================
CREATE TABLE IF NOT EXISTS public.product_variants (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_color_id  uuid        NOT NULL REFERENCES public.product_colors(id) ON DELETE RESTRICT,
  size_code         text        NOT NULL,
  size_label        text        NOT NULL,
  variant_sku       text        NOT NULL UNIQUE,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_color_id, size_code),
  CHECK (variant_sku LIKE '%-%-%')
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON public.product_variants (product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_color
  ON public.product_variants (product_color_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_active
  ON public.product_variants (is_active) WHERE is_active = true;

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- 5. INVENTORY LOCATIONS
-- ==========================
CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_code  text        NOT NULL UNIQUE,
  location_name  text        NOT NULL,
  location_type  public.inventory_location_type NOT NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  is_source      boolean     NOT NULL DEFAULT false,
  sort_order     int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- At most one source location (FCRC).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_single_source_location
  ON public.inventory_locations (is_source) WHERE is_source = true;

CREATE INDEX IF NOT EXISTS idx_inventory_locations_type
  ON public.inventory_locations (location_type);

CREATE TRIGGER trg_inventory_locations_updated_at
  BEFORE UPDATE ON public.inventory_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the 11 locations.
INSERT INTO public.inventory_locations (location_code, location_name, location_type, is_source, sort_order) VALUES
  ('FCRC',  'FCRC Warehouse',                  'source',   true,  10),
  ('LAZ',   'Lazada',                          'platform', false, 20),
  ('TTS',   'TikTok Shop',                     'platform', false, 21),
  ('SHP',   'Shopee',                          'platform', false, 22),
  ('SHPFY', 'Shopify',                         'platform', false, 23),
  ('SAL',   'Sales Team',                      'onhand',   false, 30),
  ('CST',   'Customer Service Team',           'onhand',   false, 31),
  ('MSC',   'Misc',                            'onhand',   false, 32),
  ('AMMB',  'AMMB Store',                      'store',    false, 40),
  ('SMNE',  'SMNE Store',                      'store',    false, 41),
  ('RTS',   'Returns (pending verification)',  'onhand',   false, 50)
ON CONFLICT (location_code) DO NOTHING;


-- ==========================
-- 6. INVENTORY BALANCES
-- ==========================
-- Current stock per variant per location. quantity_available is
-- a stored generated column -- never write it directly.
-- row_version is the optimistic-concurrency guard bumped by the
-- create_inventory_movement RPC on every update.
CREATE TABLE IF NOT EXISTS public.inventory_balances (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id     uuid        NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  inventory_location_id  uuid        NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  quantity_on_hand       int         NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved      int         NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  quantity_available     int         GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  row_version            int         NOT NULL DEFAULT 0,
  last_reconciled_at     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_variant_id, inventory_location_id),
  CHECK (quantity_reserved <= quantity_on_hand)
);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_variant
  ON public.inventory_balances (product_variant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_location
  ON public.inventory_balances (inventory_location_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_nonzero
  ON public.inventory_balances (product_variant_id)
  WHERE quantity_on_hand > 0;

CREATE TRIGGER trg_inventory_balances_updated_at
  BEFORE UPDATE ON public.inventory_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- 7. INVENTORY MOVEMENTS (ledger)
-- ==========================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id    uuid        NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  from_location_id      uuid        REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  to_location_id        uuid        REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  movement_type         public.inventory_movement_type NOT NULL,
  quantity              int         NOT NULL,
  status                public.inventory_movement_status NOT NULL DEFAULT 'completed',
  reason_code           text,
  notes                 text,
  reference_type        text,
  reference_id          uuid,
  acted_by_user_id      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_by_user_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- adjustment and manual_correction may be any signed int (the RPC
  -- validates shape). return_verified must be 0. All other types > 0.
  CHECK (
    movement_type IN ('adjustment', 'manual_correction')
    OR (movement_type = 'return_verified' AND quantity = 0)
    OR (movement_type NOT IN ('return_verified', 'adjustment', 'manual_correction') AND quantity > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant
  ON public.inventory_movements (product_variant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_from
  ON public.inventory_movements (from_location_id) WHERE from_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_to
  ON public.inventory_movements (to_location_id) WHERE to_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_type
  ON public.inventory_movements (movement_type);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_created
  ON public.inventory_movements (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference
  ON public.inventory_movements (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;


-- ==========================
-- 8. RETURN VERIFICATIONS
-- ==========================
CREATE TABLE IF NOT EXISTS public.inventory_return_verifications (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_movement_id     uuid        NOT NULL UNIQUE
                                        REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  verification_movement_id  uuid        REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  product_variant_id        uuid        NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  from_location_id          uuid        NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  quantity_returned         int         NOT NULL CHECK (quantity_returned > 0),
  verification_status       public.inventory_verification_status NOT NULL DEFAULT 'pending',
  condition_status          public.inventory_condition_status    NOT NULL DEFAULT 'unknown',
  notes                     text,
  verified_by_user_id       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at               timestamptz,
  restocked_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_return_verif_status
  ON public.inventory_return_verifications (verification_status);

CREATE INDEX IF NOT EXISTS idx_inv_return_verif_variant
  ON public.inventory_return_verifications (product_variant_id);

CREATE INDEX IF NOT EXISTS idx_inv_return_verif_pending
  ON public.inventory_return_verifications (created_at DESC)
  WHERE verification_status = 'pending';

CREATE TRIGGER trg_inv_return_verif_updated_at
  BEFORE UPDATE ON public.inventory_return_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- RLS -- ENABLE
-- ==========================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products',
    'product_colors',
    'product_variants',
    'inventory_locations',
    'inventory_balances',
    'inventory_movements',
    'inventory_return_verifications'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
  END LOOP;
END $$;


-- ==========================
-- RLS -- POLICIES
-- ==========================
-- SELECT: ops, or any ops-adjacent department (matches 00049 pattern).
-- WRITE: ops only at the RLS level. Department-level write permissions
-- are layered on top by the create_inventory_movement RPC (00077).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products',
    'product_colors',
    'product_variants',
    'inventory_locations',
    'inventory_balances',
    'inventory_movements',
    'inventory_return_verifications'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (
         public.is_ops()
         OR (SELECT slug FROM public.departments WHERE id = (
           SELECT department_id FROM public.profiles WHERE id = auth.uid()
         )) IN (''fulfillment'', ''inventory'', ''customer-service'', ''sales'')
       )',
      t || '_select', t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_ops())',
      t || '_insert', t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_ops())',
      t || '_update', t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_ops())',
      t || '_delete', t
    );
  END LOOP;
END $$;


-- ==========================
-- COMMENTS (docs live in DB)
-- ==========================
COMMENT ON TABLE public.products
  IS 'Parent product identity. Root of the SKU hierarchy (e.g. FAC-001).';
COMMENT ON TABLE public.product_colors
  IS 'Color level beneath a product (e.g. FAC-001-W).';
COMMENT ON TABLE public.product_variants
  IS 'Sellable SKU identity, one row per size (e.g. FAC-001-W-S36). Inventory FKs point here.';
COMMENT ON TABLE public.inventory_locations
  IS 'Master list of stock destinations. FCRC is the sole source; all others are platforms/onhand/stores.';
COMMENT ON TABLE public.inventory_balances
  IS 'Current stock per variant per location. quantity_available is generated. row_version guards concurrent writes.';
COMMENT ON TABLE public.inventory_movements
  IS 'Append-only ledger of every stock change. Created only by the create_inventory_movement RPC.';
COMMENT ON TABLE public.inventory_return_verifications
  IS 'Two-step return verification. Returned stock sits in RTS until verified as good/damaged.';
COMMENT ON TABLE public.inventory_records_deprecated
  IS 'DEPRECATED 2026-04-22 by migration 00076. Data migrated into inventory_balances.FCRC. Drop after Create Order sprint.';
COMMENT ON TABLE public.inventory_movements_deprecated
  IS 'DEPRECATED 2026-04-22 by migration 00076. Kept for audit history. Drop after Create Order sprint.';
