-- ============================================================
-- 00012_meta_ads.sql
-- Extend ad_meta_accounts and ad_meta_sync_runs to support
-- automated Meta Ads API sync via Vercel cron.
-- ============================================================


-- ── ad_meta_accounts: add per-account token override + currency ──────────────
ALTER TABLE public.ad_meta_accounts
  ADD COLUMN IF NOT EXISTS meta_access_token text,       -- optional per-account token override
  ADD COLUMN IF NOT EXISTS currency          text DEFAULT 'USD'; -- ISO currency code (e.g. 'PHP', 'USD')


-- ── ad_meta_sync_runs: richer tracking columns ───────────────────────────────
ALTER TABLE public.ad_meta_sync_runs
  ADD COLUMN IF NOT EXISTS triggered_by     text    DEFAULT 'cron',  -- 'cron' | 'manual'
  ADD COLUMN IF NOT EXISTS sync_date        date,                    -- which calendar date was fetched
  ADD COLUMN IF NOT EXISTS account_results  jsonb   DEFAULT '[]';   -- per-account outcome array


-- ── Widen the sync_runs SELECT policy so ad-ops-access users can also view ───
-- (previously OPS-only; ad-ops managers should be able to see last-sync status)
DROP POLICY IF EXISTS amsr_select ON public.ad_meta_sync_runs;
CREATE POLICY amsr_select ON public.ad_meta_sync_runs
  FOR SELECT USING (public.is_ad_ops_access());

-- Keep INSERT restricted to service-role (via admin client, bypasses RLS) —
-- existing INSERT policy is: WITH CHECK (public.is_ops()), which is fine.
-- The sync API route uses the admin client so it bypasses RLS entirely.
