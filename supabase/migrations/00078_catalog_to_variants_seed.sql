-- ============================================================
-- 00078_catalog_to_variants_seed.sql
-- Avalon — Inventory v1: catalog data migration
--
-- Reads the flat catalog_items table (from 00049) and seeds the
-- normalized SKU hierarchy introduced in 00076:
--   catalog_items  ->  products / product_colors / product_variants
--
-- Then seeds inventory_balances at FCRC from the legacy
-- inventory_records_deprecated.available_qty column and writes
-- matching initial_stock movements so the ledger has an audit
-- trail from day one.
--
-- Un-parseable or ambiguous rows are written to the
-- sku_parse_errors audit table for ops review (idempotent: the
-- table is wiped at the start of the migration and repopulated).
--
-- Idempotent: ON CONFLICT DO NOTHING everywhere so re-runs are
-- safe. Running again after catalog changes will seed NEW rows
-- only; existing variants, colors, and products are left alone.
--
-- Design doc:
--   ~/.gstack/projects/Duskrosy-Avalon-Main/
--     fc-international-1-main-design-20260422-162524.md
-- ============================================================


-- ==========================
-- 0. AUDIT TABLE: SKU PARSE ERRORS
-- ==========================
CREATE TABLE IF NOT EXISTS public.sku_parse_errors (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id  uuid        REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  raw_sku          text,
  raw_product_name text,
  raw_color        text,
  raw_size         text,
  raw_family       text,
  reason           text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sku_parse_errors_catalog
  ON public.sku_parse_errors (catalog_item_id);

-- Wipe on each run so a re-seed gives a fresh error picture.
TRUNCATE public.sku_parse_errors;


-- ==========================
-- 1. PRE-FLIGHT AUDIT
-- ==========================
-- Count what we're about to process so the migration output gives
-- ops a clear picture of seed scope.
DO $$
DECLARE
  v_catalog_total    int;
  v_legacy_records   int;
  v_fcrc_id          uuid;
BEGIN
  SELECT count(*) INTO v_catalog_total FROM public.catalog_items WHERE is_active = true;
  SELECT count(*) INTO v_legacy_records
    FROM public.inventory_records_deprecated
    WHERE available_qty > 0;

  SELECT id INTO v_fcrc_id FROM public.inventory_locations WHERE location_code = 'FCRC';
  IF v_fcrc_id IS NULL THEN
    RAISE EXCEPTION 'FCRC location missing -- migration 00076 seed did not run';
  END IF;

  RAISE NOTICE 'inventory-seed: catalog_items active=%, legacy non-zero balances=%',
    v_catalog_total, v_legacy_records;
END $$;


-- ==========================
-- 2. PARSE HELPER
-- ==========================
-- Returns (parent_sku, color_code, size_code) from the input row.
-- Strategy:
--   - If catalog_items.sku has >= 2 dashes, split on dashes:
--       <parent>-<color>-<size>
--   - Else fall back to product_family / color / size columns.
--   - If anything is still missing, return NULL parts; caller
--     logs the row to sku_parse_errors.
CREATE OR REPLACE FUNCTION public._parse_catalog_sku(
  p_sku            text,
  p_product_family text,
  p_color          text,
  p_size           text
)
RETURNS TABLE (parent_sku text, color_code text, size_code text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_parts text[];
  v_parent text;
  v_color  text;
  v_size   text;
BEGIN
  IF p_sku IS NULL OR btrim(p_sku) = '' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Dash-split path: first segment is parent, last is size, middle (joined) is color.
  v_parts := regexp_split_to_array(btrim(p_sku), '-');

  IF array_length(v_parts, 1) >= 3 THEN
    v_parent := v_parts[1];
    v_size   := v_parts[array_length(v_parts, 1)];
    v_color  := array_to_string(v_parts[2:array_length(v_parts, 1) - 1], '-');
  ELSIF array_length(v_parts, 1) = 2 THEN
    v_parent := v_parts[1];
    v_size   := v_parts[2];
    v_color  := NULLIF(btrim(coalesce(p_color, '')), '');
  ELSE
    v_parent := v_parts[1];
    v_color  := NULLIF(btrim(coalesce(p_color, '')), '');
    v_size   := NULLIF(btrim(coalesce(p_size, '')), '');
  END IF;

  -- Column fallbacks if any part is still blank.
  IF v_parent IS NULL OR btrim(v_parent) = '' THEN
    v_parent := NULLIF(btrim(coalesce(p_product_family, '')), '');
  END IF;
  IF v_color IS NULL OR btrim(v_color) = '' THEN
    v_color := NULLIF(btrim(coalesce(p_color, '')), '');
  END IF;
  IF v_size IS NULL OR btrim(v_size) = '' THEN
    v_size := NULLIF(btrim(coalesce(p_size, '')), '');
  END IF;

  RETURN QUERY SELECT upper(v_parent), upper(v_color), upper(v_size);
END;
$$;


-- ==========================
-- 3. SEED PRODUCTS / COLORS / VARIANTS
-- ==========================
DO $$
DECLARE
  r              record;
  v_parent_sku   text;
  v_color_code   text;
  v_size_code    text;
  v_product_id   uuid;
  v_color_id     uuid;
  v_variant_sku  text;
  v_product_name text;
  v_color_name   text;
  v_size_label   text;
  v_rows_processed    int := 0;
  v_logged_errors     int := 0;
BEGIN
  FOR r IN
    SELECT id, sku, product_name, color, size, product_family, collection
    FROM public.catalog_items
    WHERE is_active = true
    ORDER BY sku
  LOOP
    SELECT parent_sku, color_code, size_code
      INTO v_parent_sku, v_color_code, v_size_code
      FROM public._parse_catalog_sku(r.sku, r.product_family, r.color, r.size);

    -- Reject rows that can't produce a complete triple. variant_sku
    -- must match '%-%-%' per product_variants CHECK, so all three
    -- parts are required.
    IF v_parent_sku IS NULL OR v_color_code IS NULL OR v_size_code IS NULL THEN
      INSERT INTO public.sku_parse_errors
        (catalog_item_id, raw_sku, raw_product_name, raw_color, raw_size, raw_family, reason)
      VALUES
        (r.id, r.sku, r.product_name, r.color, r.size, r.product_family,
         format('Missing SKU part after parse: parent=%s color=%s size=%s',
           coalesce(v_parent_sku, '∅'),
           coalesce(v_color_code, '∅'),
           coalesce(v_size_code, '∅')));
      v_logged_errors := v_logged_errors + 1;
      CONTINUE;
    END IF;

    v_product_name := coalesce(NULLIF(btrim(r.product_name), ''), v_parent_sku);
    v_color_name   := initcap(replace(v_color_code, '_', ' '));
    v_size_label   := v_size_code;
    v_variant_sku  := v_parent_sku || '-' || v_color_code || '-' || v_size_code;

    -- Product (parent).
    INSERT INTO public.products (parent_sku, name, product_family, collection)
    VALUES (v_parent_sku, v_product_name, r.product_family, r.collection)
    ON CONFLICT (parent_sku) DO NOTHING;

    SELECT id INTO v_product_id FROM public.products WHERE parent_sku = v_parent_sku;
    IF NOT FOUND THEN
      INSERT INTO public.sku_parse_errors
        (catalog_item_id, raw_sku, raw_product_name, raw_color, raw_size, raw_family, reason)
      VALUES (r.id, r.sku, r.product_name, r.color, r.size, r.product_family,
              'Product row not resolvable after insert (concurrent?)');
      v_logged_errors := v_logged_errors + 1;
      CONTINUE;
    END IF;
    -- Color. color_sku is the product+color compound key.
    INSERT INTO public.product_colors (product_id, color_code, color_name, color_sku)
    VALUES (v_product_id, v_color_code, v_color_name, v_parent_sku || '-' || v_color_code)
    ON CONFLICT (product_id, color_code) DO NOTHING;

    SELECT id INTO v_color_id
      FROM public.product_colors
      WHERE product_id = v_product_id AND color_code = v_color_code;
    IF NOT FOUND THEN
      INSERT INTO public.sku_parse_errors
        (catalog_item_id, raw_sku, raw_product_name, raw_color, raw_size, raw_family, reason)
      VALUES (r.id, r.sku, r.product_name, r.color, r.size, r.product_family,
              'Color row not resolvable after insert');
      v_logged_errors := v_logged_errors + 1;
      CONTINUE;
    END IF;
    -- Variant (sellable SKU). Use the ORIGINAL catalog sku if it
    -- already has two dashes so we don't disturb existing
    -- references; otherwise use the synthesized triple.
    IF r.sku LIKE '%-%-%' THEN
      v_variant_sku := r.sku;
    END IF;

    INSERT INTO public.product_variants
      (product_id, product_color_id, size_code, size_label, variant_sku)
    VALUES
      (v_product_id, v_color_id, v_size_code, v_size_label, v_variant_sku)
    ON CONFLICT (product_color_id, size_code) DO NOTHING;

    v_rows_processed := v_rows_processed + 1;
  END LOOP;

  RAISE NOTICE 'inventory-seed: catalog_rows_processed=% errors=% (see final audit for table counts)',
    v_rows_processed, v_logged_errors;
END $$;


-- ==========================
-- 4. SEED FCRC BALANCES + initial_stock MOVEMENTS
-- ==========================
-- For every catalog_items row with a non-zero legacy
-- available_qty, find the matching product_variant (by original
-- sku or by synthesized parent-color-size) and insert an
-- inventory_balances row at FCRC plus an initial_stock movement.
DO $$
DECLARE
  r                 record;
  v_fcrc_id         uuid;
  v_variant_id      uuid;
  v_inserted_bal    int := 0;
  v_inserted_mov    int := 0;
  v_skipped         int := 0;
BEGIN
  SELECT id INTO v_fcrc_id FROM public.inventory_locations WHERE location_code = 'FCRC';

  FOR r IN
    SELECT ci.id AS catalog_item_id, ci.sku, ci.color, ci.size, ci.product_family,
           ird.available_qty
    FROM public.catalog_items ci
    JOIN public.inventory_records_deprecated ird
      ON ird.catalog_item_id = ci.id
    WHERE ird.available_qty > 0
  LOOP
    -- First try: direct sku match.
    SELECT id INTO v_variant_id
      FROM public.product_variants
      WHERE variant_sku = r.sku;

    -- Fallback: reconstruct the parsed triple and match that.
    IF v_variant_id IS NULL THEN
      SELECT pv.id INTO v_variant_id
      FROM public.product_variants pv
      JOIN public.product_colors   pc ON pc.id = pv.product_color_id
      JOIN public.products         p  ON p.id  = pv.product_id
      JOIN LATERAL public._parse_catalog_sku(r.sku, r.product_family, r.color, r.size) parsed
        ON TRUE
      WHERE p.parent_sku = parsed.parent_sku
        AND pc.color_code = parsed.color_code
        AND pv.size_code  = parsed.size_code;
    END IF;

    IF v_variant_id IS NULL THEN
      INSERT INTO public.sku_parse_errors
        (catalog_item_id, raw_sku, raw_color, raw_size, raw_family, reason)
      VALUES (r.catalog_item_id, r.sku, r.color, r.size, r.product_family,
              format('Legacy balance %s units -- no matching product_variant', r.available_qty));
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Balance row. If it already exists (re-run), skip insert and
    -- leave the current value -- ops should adjust via RPC, not via
    -- re-seed.
    INSERT INTO public.inventory_balances
      (product_variant_id, inventory_location_id, quantity_on_hand,
       quantity_reserved, row_version)
    VALUES
      (v_variant_id, v_fcrc_id, r.available_qty, 0, 1)
    ON CONFLICT (product_variant_id, inventory_location_id) DO NOTHING;

    IF FOUND THEN
      v_inserted_bal := v_inserted_bal + 1;
    END IF;

    -- Matching initial_stock movement. inventory_movements has no
    -- unique constraint on (reference_type, reference_id) so we
    -- guard with NOT EXISTS to keep re-runs idempotent.
    INSERT INTO public.inventory_movements
      (product_variant_id, from_location_id, to_location_id, movement_type,
       quantity, status, reason_code, notes,
       reference_type, reference_id)
    SELECT v_variant_id, NULL, v_fcrc_id, 'initial_stock',
           r.available_qty, 'completed', 'seed_from_legacy',
           'Seeded from inventory_records_deprecated during v1 cutover',
           'catalog_item', r.catalog_item_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory_movements
      WHERE movement_type = 'initial_stock'
        AND reference_type = 'catalog_item'
        AND reference_id  = r.catalog_item_id
    );

    IF FOUND THEN
      v_inserted_mov := v_inserted_mov + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'inventory-seed: fcrc_balances=% initial_movements=% skipped=%',
    v_inserted_bal, v_inserted_mov, v_skipped;
END $$;


-- ==========================
-- 5. FINAL AUDIT
-- ==========================
DO $$
DECLARE
  v_products int;
  v_colors   int;
  v_variants int;
  v_balances int;
  v_errors   int;
BEGIN
  SELECT count(*) INTO v_products FROM public.products;
  SELECT count(*) INTO v_colors   FROM public.product_colors;
  SELECT count(*) INTO v_variants FROM public.product_variants;
  SELECT count(*) INTO v_balances FROM public.inventory_balances;
  SELECT count(*) INTO v_errors   FROM public.sku_parse_errors;

  RAISE NOTICE 'inventory-seed final: products=% colors=% variants=% balances=% errors=%',
    v_products, v_colors, v_variants, v_balances, v_errors;
END $$;
