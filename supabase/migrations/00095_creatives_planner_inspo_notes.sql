-- ============================================================
-- 00095_creatives_planner_inspo_notes.sql
-- Avalon — Creatives planner: native inspo_link + additional_notes
--
-- Tasks created directly in the planner (no source ad_request) still need
-- somewhere to capture an inspiration link and longer notes. We add the
-- two fields directly to creative_content_items so they live alongside the
-- task. Tasks with a source_request_id continue to read inherited values
-- through that FK; these new columns are the task's own values.
--
-- Depends on:
--   • creative_content_items (00054_creatives_overhaul.sql)
-- ============================================================

alter table public.creative_content_items
  add column if not exists inspo_link text,
  add column if not exists additional_notes text;

comment on column public.creative_content_items.inspo_link is 'Optional reference URL surfaced as "View Inspo" on the task itself.';
comment on column public.creative_content_items.additional_notes is 'Longer-form notes attached to the task; not surfaced in row/list views.';
