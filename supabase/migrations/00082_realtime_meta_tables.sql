-- Add Meta ad tables to the supabase_realtime publication so the Live Ads
-- and Campaigns pages can subscribe via WebSocket and refresh the moment a
-- sync run (cron or manual) writes new data. Without this, clients connect
-- successfully but receive no change events.
--
-- Idempotent: ALTER PUBLICATION … ADD TABLE errors if the table is already
-- in the publication, so we guard with DO blocks.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meta_campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_campaigns;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meta_ad_stats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_ad_stats;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meta_adset_caps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_adset_caps;
  END IF;
END $$;
