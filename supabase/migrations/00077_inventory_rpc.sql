-- ============================================================
-- 00077_inventory_rpc.sql
-- Avalon — Atomic inventory movement RPC
--
-- Single entry point for every stock change. All 7 Operations
-- workflow pages POST to /api/inventory/movements which calls
-- this function via supabase.rpc('create_inventory_movement',...).
--
-- Responsibilities:
--   * Enforce business rules (FCRC as source, no dest-to-dest,
--     return verification gating, role/dept access).
--   * Lock and update inventory_balances with optimistic
--     row_version guards, reject stale writes.
--   * Insert one inventory_movements ledger row.
--   * Insert/Update inventory_return_verifications where
--     the movement type requires it.
--   * All-or-nothing via implicit transaction.
--
-- Raised errors (application maps to HTTP status):
--   stale_balance         -> 409  row_version mismatch
--   insufficient_stock    -> 409  from-location quantity_available < p_quantity
--   not_verified          -> 409  restock/writeoff before verify_good/damaged
--   invalid_verification  -> 422  verification_id missing or wrong status
--   forbidden             -> 403  role/dept not allowed for movement_type
--   invalid_locations     -> 422  from/to break business rules
--   invalid_quantity      -> 422  qty <= 0 on a non-adjustment/non-verify type
--   unknown_movement_type -> 422  type not in enum
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_inventory_movement(
  p_product_variant_id      uuid,
  p_from_location_id        uuid,   -- nullable (initial_stock, return_verified)
  p_to_location_id          uuid,   -- nullable (damage_writeoff, return_verified, adjustment, manual_correction)
  p_movement_type           text,
  p_quantity                int,
  p_reason_code             text,
  p_notes                   text,
  p_reference_type          text,   -- nullable
  p_reference_id            uuid,   -- nullable
  p_acted_by_user_id        uuid,
  p_expected_from_version   int,    -- nullable (first touch -> null)
  p_expected_to_version     int,    -- nullable (first touch -> null)
  p_verification_condition  text,   -- nullable: 'resellable' | 'damaged' | 'incomplete'
  p_verification_id         uuid    -- nullable: pointer to inventory_return_verifications row
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mt                public.inventory_movement_type;
  v_movement_id       uuid;
  v_fcrc_id           uuid;
  v_rts_id            uuid;

  v_acting_tier       int;
  v_acting_dept       text;

  v_from_version      int;
  v_to_version        int;
  v_from_available    int;
  v_to_on_hand        int;

  v_balance_id        uuid;
  v_current_qty       int;
  v_delta             int;

  v_verif             public.inventory_return_verifications%ROWTYPE;
  v_new_verif_status  public.inventory_verification_status;
  v_new_cond_status   public.inventory_condition_status;

  v_status            public.inventory_movement_status := 'completed';
BEGIN
  -- ----------------------------------------------------------
  -- 0. Resolve enum + standard locations
  -- ----------------------------------------------------------
  BEGIN
    v_mt := p_movement_type::public.inventory_movement_type;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'unknown_movement_type: %', p_movement_type
      USING ERRCODE = 'P0001';
  END;

  SELECT id INTO v_fcrc_id FROM public.inventory_locations WHERE location_code = 'FCRC';
  SELECT id INTO v_rts_id  FROM public.inventory_locations WHERE location_code = 'RTS';

  IF v_fcrc_id IS NULL OR v_rts_id IS NULL THEN
    RAISE EXCEPTION 'invalid_locations: FCRC or RTS seed row missing'
      USING ERRCODE = 'P0001';
  END IF;

  -- ----------------------------------------------------------
  -- 1. Role / department gate (server-side check)
  -- ----------------------------------------------------------
  SELECT r.tier, d.slug
    INTO v_acting_tier, v_acting_dept
  FROM public.profiles p
  LEFT JOIN public.roles       r ON r.id = p.role_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE p.id = p_acted_by_user_id;

  IF v_acting_tier IS NULL THEN
    RAISE EXCEPTION 'forbidden: acting user profile not found'
      USING ERRCODE = 'P0001';
  END IF;

  -- Allow matrix (mirrors the design doc). OPS tier <=1 can do anything.
  IF v_acting_tier > 1 THEN
    IF v_mt = 'initial_stock' AND v_acting_dept NOT IN ('inventory') THEN
      RAISE EXCEPTION 'forbidden: % requires OPS or inventory dept', v_mt USING ERRCODE = 'P0001';
    ELSIF v_mt = 'allocate' AND v_acting_dept NOT IN ('sales', 'customer-service') THEN
      RAISE EXCEPTION 'forbidden: % requires OPS, sales, or customer-service', v_mt USING ERRCODE = 'P0001';
    ELSIF v_mt = 'return_pending' AND v_acting_dept NOT IN ('customer-service') THEN
      RAISE EXCEPTION 'forbidden: % requires OPS or customer-service', v_mt USING ERRCODE = 'P0001';
    ELSIF v_mt IN ('return_verified', 'restock_source') AND v_acting_dept NOT IN ('inventory', 'customer-service') THEN
      RAISE EXCEPTION 'forbidden: % requires OPS, inventory, or customer-service', v_mt USING ERRCODE = 'P0001';
    ELSIF v_mt IN ('reallocate', 'adjustment', 'manual_correction', 'damage_writeoff') AND v_acting_dept NOT IN ('inventory') THEN
      RAISE EXCEPTION 'forbidden: % requires OPS or inventory dept', v_mt USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ----------------------------------------------------------
  -- 2. Quantity + location shape checks
  -- ----------------------------------------------------------
  IF v_mt = 'return_verified' THEN
    IF p_quantity <> 0 THEN
      RAISE EXCEPTION 'invalid_quantity: return_verified requires quantity = 0' USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_mt = 'adjustment' THEN
    IF p_quantity = 0 THEN
      RAISE EXCEPTION 'invalid_quantity: adjustment delta cannot be zero' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF p_quantity <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity: quantity must be > 0 for %', v_mt USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Business-rule-enforced location shapes.
  IF v_mt = 'initial_stock' AND (p_to_location_id <> v_fcrc_id OR p_from_location_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_locations: initial_stock must be (null -> FCRC)' USING ERRCODE = 'P0001';
  ELSIF v_mt = 'allocate' AND (p_from_location_id <> v_fcrc_id OR p_to_location_id IS NULL OR p_to_location_id = v_fcrc_id OR p_to_location_id = v_rts_id) THEN
    RAISE EXCEPTION 'invalid_locations: allocate must be (FCRC -> non-FCRC non-RTS dest)' USING ERRCODE = 'P0001';
  ELSIF v_mt = 'return_pending' AND (p_to_location_id <> v_rts_id OR p_from_location_id IS NULL OR p_from_location_id = v_rts_id OR p_from_location_id = v_fcrc_id) THEN
    RAISE EXCEPTION 'invalid_locations: return_pending must be (non-FCRC non-RTS -> RTS)' USING ERRCODE = 'P0001';
  ELSIF v_mt = 'restock_source' AND (p_from_location_id <> v_rts_id OR p_to_location_id <> v_fcrc_id) THEN
    RAISE EXCEPTION 'invalid_locations: restock_source must be (RTS -> FCRC)' USING ERRCODE = 'P0001';
  ELSIF v_mt = 'reallocate' AND (p_to_location_id <> v_fcrc_id OR p_from_location_id IS NULL OR p_from_location_id = v_fcrc_id OR p_from_location_id = v_rts_id) THEN
    RAISE EXCEPTION 'invalid_locations: reallocate must be (non-FCRC non-RTS -> FCRC)' USING ERRCODE = 'P0001';
  ELSIF v_mt = 'damage_writeoff' AND (p_from_location_id IS NULL OR p_to_location_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_locations: damage_writeoff must be (from -> null)' USING ERRCODE = 'P0001';
  ELSIF v_mt IN ('adjustment', 'manual_correction') AND (p_from_location_id IS NULL OR p_to_location_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_locations: % operates on a single location (from only)', v_mt USING ERRCODE = 'P0001';
  END IF;

  -- ----------------------------------------------------------
  -- 3. Per-movement-type logic. Balances are SELECT FOR UPDATE
  --    locked to serialize concurrent writes; row_version guards
  --    surface stale reads back to the UI layer.
  -- ----------------------------------------------------------
  IF v_mt = 'initial_stock' THEN
    PERFORM _upsert_balance(p_product_variant_id, p_to_location_id, p_quantity, p_expected_to_version);

  ELSIF v_mt = 'allocate' THEN
    PERFORM _decrement_balance(p_product_variant_id, p_from_location_id, p_quantity, p_expected_from_version);
    PERFORM _upsert_balance   (p_product_variant_id, p_to_location_id,   p_quantity, p_expected_to_version);

  ELSIF v_mt = 'reallocate' THEN
    PERFORM _decrement_balance(p_product_variant_id, p_from_location_id, p_quantity, p_expected_from_version);
    PERFORM _upsert_balance   (p_product_variant_id, p_to_location_id,   p_quantity, p_expected_to_version);

  ELSIF v_mt = 'return_pending' THEN
    PERFORM _decrement_balance(p_product_variant_id, p_from_location_id, p_quantity, p_expected_from_version);
    PERFORM _upsert_balance   (p_product_variant_id, p_to_location_id,   p_quantity, p_expected_to_version);
    v_status := 'pending';

  ELSIF v_mt = 'return_verified' THEN
    IF p_verification_id IS NULL OR p_verification_condition IS NULL THEN
      RAISE EXCEPTION 'invalid_verification: return_verified requires p_verification_id and p_verification_condition' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_verif FROM public.inventory_return_verifications WHERE id = p_verification_id FOR UPDATE;
    IF NOT FOUND OR v_verif.verification_status <> 'pending' THEN
      RAISE EXCEPTION 'invalid_verification: row missing or not pending' USING ERRCODE = 'P0001';
    END IF;
    v_new_verif_status := CASE p_verification_condition
      WHEN 'resellable' THEN 'verified_good'::public.inventory_verification_status
      WHEN 'damaged'    THEN 'verified_damaged'::public.inventory_verification_status
      WHEN 'incomplete' THEN 'rejected'::public.inventory_verification_status
      ELSE NULL
    END;
    IF v_new_verif_status IS NULL THEN
      RAISE EXCEPTION 'invalid_verification: condition must be resellable|damaged|incomplete' USING ERRCODE = 'P0001';
    END IF;
    v_new_cond_status := p_verification_condition::public.inventory_condition_status;
    -- No balance change here. Update the verification row only; link back to the movement below.

  ELSIF v_mt = 'restock_source' THEN
    IF p_verification_id IS NULL THEN
      RAISE EXCEPTION 'invalid_verification: restock_source requires p_verification_id' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_verif FROM public.inventory_return_verifications WHERE id = p_verification_id FOR UPDATE;
    IF NOT FOUND OR v_verif.verification_status <> 'verified_good' THEN
      RAISE EXCEPTION 'not_verified: restock_source requires verification_status = verified_good' USING ERRCODE = 'P0001';
    END IF;
    IF v_verif.restocked_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_verification: this verification row has already been restocked' USING ERRCODE = 'P0001';
    END IF;
    PERFORM _decrement_balance(p_product_variant_id, p_from_location_id, p_quantity, p_expected_from_version);
    PERFORM _upsert_balance   (p_product_variant_id, p_to_location_id,   p_quantity, p_expected_to_version);

  ELSIF v_mt = 'damage_writeoff' THEN
    -- If writing off FROM the RTS holding pen, verification must have already
    -- resolved to verified_damaged or rejected.
    IF p_from_location_id = v_rts_id THEN
      IF p_verification_id IS NULL THEN
        RAISE EXCEPTION 'invalid_verification: damage_writeoff from RTS requires p_verification_id' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO v_verif FROM public.inventory_return_verifications WHERE id = p_verification_id FOR UPDATE;
      IF NOT FOUND OR v_verif.verification_status NOT IN ('verified_damaged', 'rejected') THEN
        RAISE EXCEPTION 'not_verified: writeoff from RTS requires verified_damaged or rejected' USING ERRCODE = 'P0001';
      END IF;
      IF v_verif.restocked_at IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_verification: this verification row has already been resolved' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    PERFORM _decrement_balance(p_product_variant_id, p_from_location_id, p_quantity, p_expected_from_version);

  ELSIF v_mt = 'adjustment' THEN
    -- Signed delta at one location.
    v_delta := p_quantity;
    IF v_delta > 0 THEN
      PERFORM _upsert_balance(p_product_variant_id, p_from_location_id, v_delta, p_expected_from_version);
    ELSE
      PERFORM _decrement_balance(p_product_variant_id, p_from_location_id, -v_delta, p_expected_from_version);
    END IF;

  ELSIF v_mt = 'manual_correction' THEN
    -- p_quantity is the TARGET absolute value. Compute delta then apply.
    SELECT id, quantity_on_hand, row_version
      INTO v_balance_id, v_current_qty, v_from_version
    FROM public.inventory_balances
    WHERE product_variant_id = p_product_variant_id
      AND inventory_location_id = p_from_location_id
    FOR UPDATE;

    IF v_balance_id IS NULL THEN
      IF p_quantity < 0 THEN
        RAISE EXCEPTION 'invalid_quantity: manual_correction cannot set missing row to negative' USING ERRCODE = 'P0001';
      END IF;
      PERFORM _upsert_balance(p_product_variant_id, p_from_location_id, p_quantity, p_expected_from_version);
      v_delta := p_quantity;
    ELSE
      IF p_expected_from_version IS NOT NULL AND p_expected_from_version <> v_from_version THEN
        RAISE EXCEPTION 'stale_balance: row_version mismatch on manual_correction' USING ERRCODE = 'P0001';
      END IF;
      IF p_quantity < 0 THEN
        RAISE EXCEPTION 'invalid_quantity: manual_correction target must be >= 0' USING ERRCODE = 'P0001';
      END IF;
      v_delta := p_quantity - v_current_qty;
      UPDATE public.inventory_balances
         SET quantity_on_hand = p_quantity,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_balance_id;
    END IF;

  END IF;

  -- ----------------------------------------------------------
  -- 4. Insert the ledger row
  -- ----------------------------------------------------------
  INSERT INTO public.inventory_movements (
    product_variant_id, from_location_id, to_location_id,
    movement_type, quantity, status,
    reason_code, notes,
    reference_type, reference_id,
    acted_by_user_id
  ) VALUES (
    p_product_variant_id, p_from_location_id, p_to_location_id,
    v_mt,
    CASE
      WHEN v_mt = 'manual_correction' THEN v_delta
      WHEN v_mt = 'return_verified'   THEN 0
      ELSE p_quantity
    END,
    v_status,
    p_reason_code, p_notes,
    p_reference_type, p_reference_id,
    p_acted_by_user_id
  )
  RETURNING id INTO v_movement_id;

  -- ----------------------------------------------------------
  -- 5. Verification-row side-effects
  -- ----------------------------------------------------------
  IF v_mt = 'return_pending' THEN
    INSERT INTO public.inventory_return_verifications (
      inventory_movement_id, product_variant_id, from_location_id,
      quantity_returned, verification_status, condition_status, notes
    ) VALUES (
      v_movement_id, p_product_variant_id, p_from_location_id,
      p_quantity, 'pending', 'unknown', p_notes
    );

  ELSIF v_mt = 'return_verified' THEN
    UPDATE public.inventory_return_verifications
       SET verification_status      = v_new_verif_status,
           condition_status         = v_new_cond_status,
           verification_movement_id = v_movement_id,
           verified_by_user_id      = p_acted_by_user_id,
           verified_at              = now()
     WHERE id = p_verification_id;

  ELSIF v_mt = 'restock_source' OR (v_mt = 'damage_writeoff' AND p_from_location_id = v_rts_id) THEN
    UPDATE public.inventory_return_verifications
       SET restocked_at = now()
     WHERE id = p_verification_id;
  END IF;

  RETURN v_movement_id;
END;
$$;


-- ------------------------------------------------------------
-- Helper: _upsert_balance
-- Adds delta to (variant, location). Inserts with row_version 1
-- if missing, else increments. If expected version is given and
-- does not match the current value, raises stale_balance.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._upsert_balance(
  p_product_variant_id     uuid,
  p_inventory_location_id  uuid,
  p_delta                  int,
  p_expected_version       int
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_id       uuid;
  v_version  int;
BEGIN
  SELECT id, row_version
    INTO v_id, v_version
  FROM public.inventory_balances
  WHERE product_variant_id = p_product_variant_id
    AND inventory_location_id = p_inventory_location_id
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.inventory_balances (
      product_variant_id, inventory_location_id,
      quantity_on_hand, quantity_reserved, row_version
    ) VALUES (
      p_product_variant_id, p_inventory_location_id,
      GREATEST(p_delta, 0), 0, 1
    );
    RETURN;
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_version THEN
    RAISE EXCEPTION 'stale_balance: row_version mismatch on upsert (expected %, actual %)', p_expected_version, v_version
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.inventory_balances
     SET quantity_on_hand = quantity_on_hand + p_delta,
         row_version = row_version + 1,
         updated_at = now()
   WHERE id = v_id;
END;
$$;


-- ------------------------------------------------------------
-- Helper: _decrement_balance
-- Decrements (variant, location) by p_quantity, enforcing:
--   * row must exist
--   * quantity_available must be >= p_quantity (else insufficient_stock)
--   * row_version must match if supplied
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._decrement_balance(
  p_product_variant_id     uuid,
  p_inventory_location_id  uuid,
  p_quantity               int,
  p_expected_version       int
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_id         uuid;
  v_version    int;
  v_available  int;
BEGIN
  SELECT id, row_version, quantity_available
    INTO v_id, v_version, v_available
  FROM public.inventory_balances
  WHERE product_variant_id = p_product_variant_id
    AND inventory_location_id = p_inventory_location_id
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'insufficient_stock: no balance row for variant/location' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_version THEN
    RAISE EXCEPTION 'stale_balance: row_version mismatch on decrement (expected %, actual %)', p_expected_version, v_version
      USING ERRCODE = 'P0001';
  END IF;

  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'insufficient_stock: available % < requested %', v_available, p_quantity
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.inventory_balances
     SET quantity_on_hand = quantity_on_hand - p_quantity,
         row_version = row_version + 1,
         updated_at = now()
   WHERE id = v_id;
END;
$$;


-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
-- Only authenticated users can call the RPC; internal checks enforce
-- role and department gating.
REVOKE ALL ON FUNCTION public.create_inventory_movement(
  uuid, uuid, uuid, text, int, text, text, text, uuid, uuid, int, int, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_inventory_movement(
  uuid, uuid, uuid, text, int, text, text, text, uuid, uuid, int, int, text, uuid
) TO authenticated;

-- Helper functions are internal -- no grants to authenticated.
REVOKE ALL ON FUNCTION public._upsert_balance(uuid, uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._decrement_balance(uuid, uuid, int, int) FROM PUBLIC;
