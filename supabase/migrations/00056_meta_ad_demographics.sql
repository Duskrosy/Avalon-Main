create table if not exists meta_ad_demographics (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       text not null,
  meta_account_id   text not null,
  date              date not null,
  gender            text not null check (gender in ('male', 'female', 'unknown')),
  spend             numeric(12, 4) not null default 0,
  impressions       integer not null default 0,
  conversions       integer not null default 0,
  messages          integer not null default 0,
  created_at        timestamptz not null default now(),

  constraint meta_ad_demographics_unique unique (meta_account_id, campaign_id, date, gender)
);

alter table meta_ad_demographics enable row level security;

create policy "auth users can read demographics"
  on meta_ad_demographics for select
  to authenticated using (true);

create policy "service role can write demographics"
  on meta_ad_demographics for all
  to service_role using (true);
