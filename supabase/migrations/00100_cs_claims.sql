-- supabase/migrations/00100_cs_claims.sql
-- CS Pass 1: ticket claim/lock model on the existing orders table.
--
-- Adds two columns so a CS rep can "claim" a ticket they're working,
-- preventing two reps from triaging the same order at once. The claim
-- is auto-released when the rep triages (route handler clears the
-- columns in the same UPDATE that sets person_in_charge_label) or
-- explicitly released via the new "release" triage action. Manager
-- role (profiles.role.tier <= 2) can force-reassign in Pass 6.
--
-- Schema-link notes:
--   * claimed_by_user_id references public.profiles(id), matching every
--     existing user-FK in this codebase (ops_orders.assigned_to,
--     dispatch_queue.assigned_to, etc.). NOT auth.users.
--   * ON DELETE SET NULL so deactivating a profile doesn't lose the
--     ticket; the claim just clears.
--   * Partial index covers the hot path "tickets I claimed" / "tickets
--     anyone has claimed" — most rows have claimed_by_user_id IS NULL
--     so a partial index is much smaller than a full one.
--   * Conditional UPDATE in the triage route handles the race
--     (UPDATE ... WHERE claimed_by_user_id IS NULL RETURNING ...) so
--     two simultaneous claims yield exactly one winner.

BEGIN;

-- 1. Claim columns on orders.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- 2. Partial index: only tickets currently claimed.
CREATE INDEX IF NOT EXISTS idx_orders_claimed_by
  ON public.orders (claimed_by_user_id, claimed_at)
  WHERE claimed_by_user_id IS NOT NULL;

-- 3. Sanity: claimed_at must be set whenever claimed_by_user_id is, and
-- both must clear together. App code enforces this; a CHECK constraint
-- would block legitimate manager-override paths in Pass 6 if not careful,
-- so leaving it to the application layer for now.

COMMIT;
