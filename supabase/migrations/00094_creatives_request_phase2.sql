-- ============================================================
-- 00094_creatives_request_phase2.sql
-- Avalon — Creatives request governance + continuity (Phase 2)
--
-- Adds three nullable text fields to ad_requests so the request flow
-- can capture inspiration, deny reasons, and longer notes without
-- inventing a separate table per concern. Also adds a back-reference
-- from creative_content_items to the request that spawned them.
--
-- Depends on:
--   • ad_requests (00007_ad_ops.sql)
--   • creative_content_items (00054_creatives_overhaul.sql)
-- ============================================================

alter table public.ad_requests
  add column if not exists inspo_link text,
  add column if not exists deny_reason text,
  add column if not exists additional_notes text;

comment on column public.ad_requests.inspo_link is 'Optional reference URL surfaced as "View Inspo" to the creative team.';
comment on column public.ad_requests.deny_reason is 'Required text captured when a request is moved to status=rejected.';
comment on column public.ad_requests.additional_notes is 'Longer-form notes from the requester; not surfaced in list views.';

alter table public.creative_content_items
  add column if not exists source_request_id uuid references public.ad_requests(id) on delete set null;

create index if not exists idx_creative_content_items_source_request_id
  on public.creative_content_items(source_request_id);

comment on column public.creative_content_items.source_request_id is 'The ad_requests row that spawned this content item, if any. Read-through for inherited request context (inspo, attachments, additional_notes).';
