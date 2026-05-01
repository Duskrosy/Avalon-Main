-- supabase/migrations/00103_cs_order_notes.sql
-- CS Pass 2 iteration: shared notes feed across sales + CS teams.
--
-- The existing orders.notes column is the original sales-agent note (one
-- per order, set at confirm time). This migration adds a feed table for
-- per-author notes the CS team can add during a call. The drawer renders
-- both: orders.notes as the immutable first 'Sales-team note' card, then
-- the cs_order_notes feed in chronological order.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cs_order_notes (
  id                     bigserial PRIMARY KEY,
  order_id               uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name_snapshot   text NOT NULL,  -- copied at write time so deleted profiles still display author name
  body                   text NOT NULL CHECK (length(trim(body)) > 0),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_order_notes_order_created
  ON public.cs_order_notes (order_id, created_at);

ALTER TABLE public.cs_order_notes ENABLE ROW LEVEL SECURITY;

-- Authenticated CS users can read all order notes (no per-rep gating).
CREATE POLICY cs_order_notes_select ON public.cs_order_notes
  FOR SELECT TO authenticated USING (true);

-- Authenticated CS users can insert their own notes.
CREATE POLICY cs_order_notes_insert ON public.cs_order_notes
  FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid());

-- No UPDATE/DELETE policies — notes are append-only by default.
-- Service role bypasses RLS for backfills/admin ops.

COMMIT;

-- DOWN:
-- BEGIN;
-- DROP POLICY IF EXISTS cs_order_notes_insert ON public.cs_order_notes;
-- DROP POLICY IF EXISTS cs_order_notes_select ON public.cs_order_notes;
-- DROP TABLE IF EXISTS public.cs_order_notes;
-- COMMIT;
