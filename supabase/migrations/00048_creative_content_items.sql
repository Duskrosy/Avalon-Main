-- ============================================================
-- 00048_creative_content_items.sql
-- Avalon Rebuild — Creative Content Items
--
-- Replaces the spreadsheet tracker for creative production
-- planning. Tracks ideas → production → publish lifecycle
-- with links to kanban cards, SMM posts, and ad assets.
-- ============================================================


-- ==========================
-- ENUMS
-- ==========================
DO $$ BEGIN
  CREATE TYPE public.content_item_status AS ENUM (
    'idea', 'in_production', 'submitted', 'approved', 'scheduled', 'published', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.content_type AS ENUM (
    'video', 'still', 'ad_creative', 'organic', 'offline', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.channel_type AS ENUM (
    'conversion', 'messenger', 'organic', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.funnel_stage AS ENUM (
    'TOF', 'MOF', 'BOF'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ==========================
-- TABLE
-- ==========================
CREATE TABLE public.creative_content_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  content_type          public.content_type NOT NULL DEFAULT 'video',
  channel_type          public.channel_type NOT NULL DEFAULT 'conversion',
  funnel_stage          public.funnel_stage,
  creative_angle        text,                -- POV / hook / concept
  product_or_collection text,
  campaign_label        text,
  promo_code            text,
  transfer_link         text,
  planned_week_start    date,
  date_submitted        date,
  status                public.content_item_status NOT NULL DEFAULT 'idea',
  assigned_to           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Kanban integration
  linked_card_id        uuid REFERENCES public.kanban_cards(id) ON DELETE SET NULL,

  -- Published content linking (manual)
  linked_post_id        uuid REFERENCES public.smm_posts(id) ON DELETE SET NULL,
  linked_ad_asset_id    uuid REFERENCES public.ad_assets(id) ON DELETE SET NULL,
  linked_external_url   text,
  linked_at             timestamptz,

  -- Audit
  created_by            uuid NOT NULL REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);


-- ==========================
-- INDEXES
-- ==========================
CREATE INDEX idx_cci_status       ON public.creative_content_items (status);
CREATE INDEX idx_cci_assigned     ON public.creative_content_items (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_cci_planned_week ON public.creative_content_items (planned_week_start) WHERE planned_week_start IS NOT NULL;
CREATE INDEX idx_cci_created_at   ON public.creative_content_items (created_at DESC);
CREATE INDEX idx_cci_linked_card  ON public.creative_content_items (linked_card_id) WHERE linked_card_id IS NOT NULL;


-- ==========================
-- TRIGGERS
-- ==========================
CREATE TRIGGER trg_cci_updated_at
  BEFORE UPDATE ON public.creative_content_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_cci
  AFTER INSERT OR UPDATE OR DELETE ON public.creative_content_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- RLS
-- ==========================
ALTER TABLE public.creative_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_content_items FORCE ROW LEVEL SECURITY;

-- SELECT / INSERT / UPDATE: ad-ops access (OPS + creatives + marketing + ad-ops depts)
CREATE POLICY cci_select ON public.creative_content_items
  FOR SELECT USING (public.is_ad_ops_access());

CREATE POLICY cci_insert ON public.creative_content_items
  FOR INSERT WITH CHECK (public.is_ad_ops_access());

CREATE POLICY cci_update ON public.creative_content_items
  FOR UPDATE USING (public.is_ad_ops_access());

-- DELETE: OPS or creator can delete
CREATE POLICY cci_delete ON public.creative_content_items
  FOR DELETE USING (public.is_ops() OR created_by = auth.uid());


-- ==========================
-- REALTIME
-- ==========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_content_items;
