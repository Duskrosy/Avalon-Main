-- Sprint D: News source health tracking
-- Adds feed-type detection + last-fetch diagnostics to smm_news_sources.

alter table public.smm_news_sources
  add column if not exists feed_type         text check (feed_type in ('rss', 'atom', 'unknown')),
  add column if not exists last_fetched_at   timestamptz,
  add column if not exists last_fetch_status text check (last_fetch_status in ('ok', 'error', 'never')) default 'never',
  add column if not exists last_fetch_error  text,
  add column if not exists last_item_count   integer default 0;

create index if not exists smm_news_sources_last_fetch_status_idx
  on public.smm_news_sources(last_fetch_status);
