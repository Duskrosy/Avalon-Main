-- 00073_unassigned_post_counts.sql
-- Two RPCs powering the Creatives dashboard "Unassigned Posts" KPI.
--
-- Linkage truth (not the naive guess):
--   organic smm_top_posts → creative_content_items.linked_external_url = post_url
--   meta ads              → creative_content_items.linked_ad_asset_id = ad_assets.id
--                           OR linked_external_url = 'meta_ad://' || ad_id (fallback
--                           when no ad_assets row resolves for that meta_ad_id)
--
-- Counts are DISTINCT at the source grain (post_url / ad_id) so daily
-- meta_ad_stats snapshot rows don't inflate the ad count.

create or replace function public.count_unassigned_organic_posts()
returns integer language sql stable as $$
  select count(*)::int
  from public.smm_top_posts p
  where p.post_url is not null
    and not exists (
      select 1
      from public.creative_content_items c
      where c.linked_external_url = p.post_url
    );
$$;

create or replace function public.count_unassigned_ads()
returns integer language sql stable as $$
  with ad_ids as (
    select distinct m.ad_id
    from public.meta_ad_stats m
    where m.ad_id is not null
  )
  select count(*)::int
  from ad_ids a
  where not exists (
    -- Resolved ad_asset linkage: ad_deployments maps meta_ad_id → ad_assets.id,
    -- which is stored on the content item as linked_ad_asset_id.
    select 1
    from public.ad_deployments d
    join public.creative_content_items c
      on c.linked_ad_asset_id = d.asset_id
    where d.meta_ad_id = a.ad_id
  )
  and not exists (
    -- Fallback attribution: no ad_asset resolved, stored as meta_ad://<ad_id>.
    select 1
    from public.creative_content_items c
    where c.linked_external_url = 'meta_ad://' || a.ad_id
  );
$$;

grant execute on function public.count_unassigned_organic_posts() to authenticated;
grant execute on function public.count_unassigned_ads() to authenticated;
