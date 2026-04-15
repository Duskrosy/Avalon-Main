-- ============================================================
-- 00052_content_items_group_label.sql
-- Add group_label to creative_content_items so items can be
-- filtered by creative group (Local, International, PCDLF).
-- Text column (not enum) to match the hardcoded constants
-- without needing a migration for every group change.
-- ============================================================

ALTER TABLE public.creative_content_items
  ADD COLUMN group_label text DEFAULT 'local';

-- Index for group filtering
CREATE INDEX idx_cci_group_label ON public.creative_content_items (group_label)
  WHERE group_label IS NOT NULL;

-- Backfill: set all existing items to 'local' (they were pre-groups)
UPDATE public.creative_content_items SET group_label = 'local' WHERE group_label IS NULL;
