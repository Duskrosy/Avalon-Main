-- =============================================================
-- Migration 00017 — News / RSS Feed Aggregation
-- Tables: smm_news_sources, smm_news_items
-- RLS: is_ad_ops_access() for read; is_ops() for source management;
--      is_ad_ops_access() for news item write
-- =============================================================

-- ─── News Sources ─────────────────────────────────────────────
-- RSS feed registry — one row per feed
CREATE TABLE public.smm_news_sources (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  url        text NOT NULL UNIQUE,
  category   text NOT NULL DEFAULT 'general'
               CHECK (category IN ('shoes','height','viral_ph','general')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-seed default Philippine / lifestyle feeds
INSERT INTO public.smm_news_sources (name, url, category) VALUES
  ('Philippine Star - Trending', 'https://www.philstar.com/rss/headlines', 'viral_ph'),
  ('Manila Bulletin',            'https://mb.com.ph/feed',                'viral_ph'),
  ('Esquire PH',                 'https://www.esquiremag.ph/rss.xml',     'general'),
  ('Rappler',                    'https://www.rappler.com/feed',           'viral_ph');

-- ─── News Items ───────────────────────────────────────────────
-- Aggregated articles pulled from active sources
CREATE TABLE public.smm_news_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    uuid NOT NULL REFERENCES public.smm_news_sources(id) ON DELETE CASCADE,
  title        text NOT NULL,
  url          text NOT NULL UNIQUE,
  summary      text,
  image_url    text,
  published_at timestamptz,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes for feed queries (most recent first, filtered by source)
CREATE INDEX smm_news_items_published_at_idx ON public.smm_news_items (published_at DESC);
CREATE INDEX smm_news_items_source_id_idx   ON public.smm_news_items (source_id);

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE public.smm_news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smm_news_items   ENABLE ROW LEVEL SECURITY;

-- smm_news_sources — OPS manages the feed list; anyone with ad_ops_access reads it
CREATE POLICY news_src_sel ON public.smm_news_sources FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY news_src_ins ON public.smm_news_sources FOR INSERT  WITH CHECK (public.is_ops());
CREATE POLICY news_src_upd ON public.smm_news_sources FOR UPDATE  USING (public.is_ops());
CREATE POLICY news_src_del ON public.smm_news_sources FOR DELETE  USING (public.is_ops());

-- smm_news_items — ad_ops_access can read/write (API sync inserts); OPS to delete
CREATE POLICY news_item_sel ON public.smm_news_items FOR SELECT  USING (public.is_ad_ops_access());
CREATE POLICY news_item_ins ON public.smm_news_items FOR INSERT  WITH CHECK (public.is_ad_ops_access());
CREATE POLICY news_item_upd ON public.smm_news_items FOR UPDATE  USING (public.is_ad_ops_access());
CREATE POLICY news_item_del ON public.smm_news_items FOR DELETE  USING (public.is_ops());
