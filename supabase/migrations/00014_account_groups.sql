-- ============================================================
-- 00014_account_groups.sql
-- Named account groups so multiple Meta ad accounts can be
-- merged under a single reporting entity (e.g. "Local").
-- ============================================================

-- ── meta_account_groups ──────────────────────────────────────────────────────
CREATE TABLE public.meta_account_groups (
  id         uuid    PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text    NOT NULL,
  currency   text    NOT NULL DEFAULT 'USD',
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mag_active ON public.meta_account_groups (is_active);

CREATE TRIGGER trg_mag_updated_at
  BEFORE UPDATE ON public.meta_account_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Link ad accounts to groups ───────────────────────────────────────────────
ALTER TABLE public.ad_meta_accounts
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.meta_account_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ama_group ON public.ad_meta_accounts (group_id);

-- ── Also store a friendly label per Meta account (distinct from group name) ──
ALTER TABLE public.ad_meta_accounts
  ADD COLUMN IF NOT EXISTS label text;   -- e.g. "Main spend account", "Retargeting"

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.meta_account_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_account_groups FORCE ROW LEVEL SECURITY;

CREATE POLICY mag_select ON public.meta_account_groups FOR SELECT USING (public.is_ad_ops_access());
CREATE POLICY mag_insert ON public.meta_account_groups FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY mag_update ON public.meta_account_groups FOR UPDATE USING (public.is_ops());
CREATE POLICY mag_delete ON public.meta_account_groups FOR DELETE USING (public.is_ops());
