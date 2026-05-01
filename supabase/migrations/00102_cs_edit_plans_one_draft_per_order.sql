-- supabase/migrations/00102_cs_edit_plans_one_draft_per_order.sql
-- CS Pass 2: prevent concurrent draft plans on the same order.
--
-- Without this index, two CS reps composing edits on the same order at the
-- same time can both INSERT a draft plan (since both maybeSingle() reads
-- return null before either INSERT lands). The next compose request would
-- then crash on .maybeSingle() because two draft rows exist for the order.
--
-- The partial unique index limits "at most one row" to status='draft' so
-- applied/failed/cancelled plans are not affected. Concurrent draft creation
-- now produces a Postgres 23505 unique_violation, which the route handler
-- translates into a 409 Conflict.

CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_edit_plans_one_draft_per_order
  ON public.cs_edit_plans (order_id)
  WHERE status = 'draft';

-- DOWN:
-- DROP INDEX IF EXISTS public.idx_cs_edit_plans_one_draft_per_order;
