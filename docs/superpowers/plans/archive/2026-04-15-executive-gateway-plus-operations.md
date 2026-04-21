# Executive Gateway + Operations System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Executive Gateway dashboard enhancements, Ads Ops KPI framework, Creatives KPI framework, Creatives Tracker, and Masterlist Operations system as one coordinated release.

**Architecture:** Database-first approach — all 3 migrations ship first (KPI threshold updates, creative_content_items, operations tables), then UI builds on top. Executive pages are server components with inline queries using `createAdminClient()` for cross-dept data. New operations pages follow the existing pattern: server component page.tsx fetching data, passing to client-side `*-view.tsx` components.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS + Storage), TypeScript, Tailwind CSS, date-fns

**Source Specs:**
- Executive Gateway design doc: `~/.gstack/projects/Duskrosy-Avalon-Main/fc-international-1-main-design-20260414-181213.md`
- Ads Ops KPI Framework: `~/Documents/Obsidian Vault/Base/Marketing Ads Operations KPI Framework.md`
- Creatives KPI Framework: `~/Documents/Obsidian Vault/Base/Creatives KPI Framework.md`
- Creatives Tracker Translation: `~/Documents/Obsidian Vault/Base/Creatives Tracker to Avalon Translation.md`
- Masterlist Translation: `~/Documents/Obsidian Vault/Base/Masterlist to Avalon Translation.md`

---

## Existing State Summary

**KPI definitions already seeded (from migrations 00011, 00033, 00034):**
- Marketing dept: Ad Content Performance (5), Stills Performance (5), Performance/RoAS (3), Budget (2), Traffic (5) = 20 KPIs
- Creatives dept: Output (3), Stills Output (3), Stills Performance (5), Organic Performance (6) = 17 KPIs

**Threshold mismatches (user framework vs current DB):**
- Overall RoAS: current 6.0/5.0 → framework wants 7.0/6.8
- Conversion RoAS: current 5.0/3.5 → framework wants 5.5/5.0
- Messenger RoAS: current 10.0/8.0 → framework wants 13.5/12.5
- CPM (Traffic): current 130/160 → framework wants 100/120
- CPC (Traffic): current 10/13 → framework wants 10/10
- CTR (Traffic): current 1.5/1.0 → framework wants 1.5/1.3
- CPLV (Traffic): current 12/16 → framework wants 9/10
- CPMR (Traffic): current 9/12 → framework wants 9/10

**Missing KPIs (not yet seeded):**
- Marketing: Total Revenue/Orders (North Star), Returning Customer Rate (Supporting), Online Store Visits (Efficiency), Monthly Spend Utilization (Budget), Daily Budget Pacing (reformulated)
- Creatives: No missing — all 5 categories already seeded

**Category renames needed (to match framework tiers):**
- Marketing "Performance" → "North Star"
- Marketing "Traffic" → "Efficiency"
- New "Supporting" category for Returning Customer Rate + split out Conversion/Messenger RoAS

**No existing tables for:** creative_content_items, catalog, inventory, orders, dispatch, order_issues, distressed_parcels, courier_tracking, remittance

**Key files that will be modified:**
- `src/app/(dashboard)/page.tsx` — root dashboard enhancements (velocity, goals, feedback, empty states)
- `src/app/(dashboard)/executive/page.tsx` — executive overview with new KPI tier grouping
- `src/app/(dashboard)/executive/creatives/page.tsx` — rebuild with 5-category KPI framework
- `src/app/(dashboard)/executive/marketing/page.tsx` — add prominent KPI tier display

**Key files that will be created:**
- `supabase/migrations/00047_kpi_framework_update.sql`
- `supabase/migrations/00048_creative_content_items.sql`
- `supabase/migrations/00049_operations_system.sql`
- `src/app/(dashboard)/executive/ad-ops/page.tsx` — dedicated ads ops KPI executive page
- `src/app/(dashboard)/creatives/tracker/page.tsx` + `tracker-view.tsx`
- `src/app/api/creatives/content-items/route.ts`
- `src/app/(dashboard)/operations/` — 8 sub-pages
- `src/app/api/operations/` — API routes for operations modules

---

## Phase 1: Database Migrations

### Task 1: KPI Framework Threshold & Category Update Migration

**Files:**
- Create: `supabase/migrations/00047_kpi_framework_update.sql`

This migration updates existing KPI definitions to match the user's Ads Ops and Creatives KPI frameworks exactly. It re-categorizes marketing KPIs into the 4-tier system (North Star, Supporting, Efficiency, Budget), updates all thresholds, and adds missing KPIs.

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 00047_kpi_framework_update.sql
-- Updates KPI definitions to match the official Ads Ops and
-- Creatives KPI frameworks. Re-categorizes marketing KPIs into
-- 4-tier system, updates all thresholds, adds missing KPIs.
-- ============================================================

-- ============================================================
-- 1. MARKETING: Re-categorize existing KPIs to framework tiers
-- ============================================================

-- Overall RoAS → North Star (update threshold + category)
UPDATE public.kpi_definitions
SET category = 'North Star',
    threshold_green = 7.0,
    threshold_amber = 6.8,
    hint = '≥7.0x. Total revenue / total ad spend. North Star KPI — the main indicator of whether the ad machine is working.',
    sort_order = 1
WHERE name = 'Overall RoAS'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Conversion RoAS → Supporting
UPDATE public.kpi_definitions
SET category = 'Supporting',
    threshold_green = 5.5,
    threshold_amber = 5.0,
    hint = '≥5.5x. Conversion campaign revenue / conversion spend. Shows how efficiently conversion campaigns produce revenue.',
    sort_order = 10
WHERE name = 'Conversion RoAS'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Messenger RoAS → Supporting
UPDATE public.kpi_definitions
SET category = 'Supporting',
    threshold_green = 13.5,
    threshold_amber = 12.5,
    hint = '≥13.5x. Messenger campaign revenue / Messenger ad spend. Measures Messenger campaign effectiveness.',
    sort_order = 11
WHERE name = 'Messenger RoAS'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CPM → Efficiency (update threshold)
UPDATE public.kpi_definitions
SET category = 'Efficiency',
    threshold_green = 100,
    threshold_amber = 120,
    hint = '≤₱100. Cost per 1,000 impressions. Shows how expensive it is to buy attention.',
    sort_order = 23
WHERE name = 'CPM' AND category = 'Traffic'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CPC → Efficiency (update threshold)
UPDATE public.kpi_definitions
SET category = 'Efficiency',
    threshold_green = 10,
    threshold_amber = 10,
    hint = '<₱10. Cost per link click. Tracks how expensive it is to drive clicks.',
    sort_order = 24
WHERE name = 'CPC' AND category = 'Traffic'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CTR → Efficiency (update amber threshold)
UPDATE public.kpi_definitions
SET category = 'Efficiency',
    threshold_amber = 1.3,
    hint = '≥1.5%. Link clicks / impressions. Signals whether ads are relevant enough to earn clicks.',
    sort_order = 25
WHERE name = 'CTR' AND category = 'Traffic'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CPLV → Efficiency (update threshold)
UPDATE public.kpi_definitions
SET category = 'Efficiency',
    threshold_green = 9,
    threshold_amber = 10,
    hint = '≤₱9. Cost per landing page view. Tells you how expensive qualified traffic is.',
    sort_order = 21
WHERE name = 'CPLV' AND category = 'Traffic'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- CPMR → Efficiency (update threshold)
UPDATE public.kpi_definitions
SET category = 'Efficiency',
    threshold_green = 9,
    threshold_amber = 10,
    hint = '≤₱9. Cost per Messenger result. Shows Messenger acquisition cost efficiency.',
    sort_order = 26
WHERE name = 'CPMR' AND category = 'Traffic'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Total Ad Spend → Budget (keep)
UPDATE public.kpi_definitions
SET sort_order = 30
WHERE name = 'Total Ad Spend'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Budget Pacing → Budget: Daily Budget Pacing (rename + update threshold)
UPDATE public.kpi_definitions
SET name = 'Daily Budget Pacing',
    threshold_green = 1.0,
    threshold_amber = 0.89,
    hint = 'Stay within ±10% of planned daily budget. Green: 90-110%, Amber: 80-89% or 111-120%, Red: outside.',
    sort_order = 31
WHERE name = 'Budget Pacing'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');


-- ============================================================
-- 2. MARKETING: Add missing KPIs from framework
-- ============================================================

INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency,
   threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit,
       v.direction::public.kpi_direction, v.frequency::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
FROM public.departments d,
(VALUES
  ('Total Revenue',
   'North Star', 'currency_php', 'higher_better', 'monthly',
   6000000, 5500000,
   '≥₱6,000,000 per month. Total orders/revenue goal — the business outcome of ad spend.',
   2, false),
  ('Returning Customer Rate',
   'Supporting', 'percent', 'higher_better', 'monthly',
   25, 20,
   '≥25%. Shows whether marketing creates repeat buyers, not just one-time purchases.',
   12, false),
  ('Online Store Visits',
   'Efficiency', 'number', 'higher_better', 'weekly',
   18500, 17500,
   '≥18,500 weekly (≥74,000 monthly). Traffic volume tells you whether the funnel is being fed enough.',
   20, false),
  ('Monthly Spend Utilization',
   'Budget', 'percent', 'higher_better', 'monthly',
   100, 94,
   'Use 95-105% of monthly budget. Green: 95-105%, Amber: 90-94% or 106-110%. Ensures budget is used properly.',
   32, false)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, so, pt)
WHERE d.slug = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.department_id = d.id AND k.name = v.name AND k.category = v.category
  );


-- ============================================================
-- 3. CREATIVES: Update thresholds to match Creatives KPI Framework
-- ============================================================

-- Ad Content Performance thresholds (these live in marketing dept per 00034 merge)
-- Hook Rate: framework says green 30-50%, amber 25-29.9%, red <25% — already correct (30/25)
-- ThruPlay Rate: framework says green 15-20%, amber 10-14.99%, red <10% — already correct (15/10)
-- CTR: framework says green 1.5-2.5%, amber 1.0-1.99%, red <1.0% — already correct (1.5/1.0)
-- Cost per 3-sec Play: framework says green 0.60-0.89, amber 0.90-1.20, red >1.20 — already correct (0.60/0.90)
-- Video Avg Play Time: framework says green 4-6s, amber 3-3.9s, red <3s — current is 6/3, update green to 4
UPDATE public.kpi_definitions
SET threshold_green = 4,
    hint = '≥4 seconds average view duration. Green: 4-6s, Amber: 3-3.9s. Manual entry from Meta Ads Manager.'
WHERE name = 'Video Avg. Play Time'
  AND department_id = (SELECT id FROM public.departments WHERE slug = 'marketing');

-- Creatives Output thresholds — already match framework
-- Stills Output thresholds — already match framework

-- Stills Performance (Creatives dept): update ATC thresholds
-- Add-to-Carts (Stills): framework says green ≥20, amber 10-19, red <10 — already correct (20/10)
-- CTR (Stills): framework green 1.2%+, amber 1-1.19%, red <1% — already correct (1.2/1.0)
-- CPM (Stills): framework green <₱100, amber ₱100-119, red ₱120+ — already correct (100/120)
-- CPLV (Stills): framework green <₱8, amber ₱8-9.99, red ₱10+ — already correct (8/10)
-- CPC (Stills): framework green <₱10, amber ₱10-11.99, red ₱12+ — already correct (10/12)

-- Organic Performance: all thresholds already match framework. No updates needed.

-- ============================================================
-- 4. CREATIVES: Add monthly organic KPI variants
--    The framework specifies different monthly thresholds for
--    View Count (≥10K vs weekly ≥2.5K) and Link Clicks (≥70 vs ≥18)
-- ============================================================

INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency,
   threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, v.name, v.category, v.unit::public.kpi_unit,
       v.direction::public.kpi_direction, v.frequency::public.kpi_frequency,
       v.tg, v.ta, v.hint, v.so, v.pt
FROM public.departments d,
(VALUES
  ('View Count (Monthly)',
   'Organic Performance', 'number', 'higher_better', 'monthly',
   10000, 7000,
   '≥10K views per month. Monthly rollup of organic content views across platforms.',
   23, false),
  ('Link Clicks (Monthly)',
   'Organic Performance', 'number', 'higher_better', 'monthly',
   70, 50,
   '≥70 link clicks per month. Monthly rollup of organic content link clicks.',
   24, false)
) AS v(name, category, unit, direction, frequency, tg, ta, hint, so, pt)
WHERE d.slug = 'creatives'
  AND NOT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.department_id = d.id AND k.name = v.name AND k.category = v.category
  );
```

- [ ] **Step 2: Verify the migration is syntactically valid**

Run: `cd "/Users/fc-international-1/Documents/Avalon New" && npx supabase migration list 2>&1 | tail -5`

Verify migration 00047 appears in the list.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00047_kpi_framework_update.sql
git commit -m "feat(kpi): update thresholds and categories to match Ads Ops + Creatives KPI frameworks"
```

---

### Task 2: Creative Content Items Table Migration

**Files:**
- Create: `supabase/migrations/00048_creative_content_items.sql`

Creates the `creative_content_items` table that replaces the spreadsheet tracker. Supports auto-linking to kanban cards, manual linking to published content (smm_posts), and the full planned→published workflow.

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 00048_creative_content_items.sql
-- Creative content items table — single source of truth for
-- planned creative production. Replaces the spreadsheet tracker.
--
-- Supports:
--   - Planned content records with full metadata
--   - Auto-linked kanban cards for production tasks
--   - Manual linking to published smm_posts / ad assets
--   - Status workflow: idea → in_production → submitted → approved → scheduled → published → archived
-- ============================================================

-- ── Enums ─────────────────────────────────────────────────────

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
  CREATE TYPE public.funnel_stage AS ENUM ('TOF', 'MOF', 'BOF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.creative_content_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  content_type      public.content_type NOT NULL DEFAULT 'video',
  channel_type      public.channel_type NOT NULL DEFAULT 'conversion',
  funnel_stage      public.funnel_stage,
  creative_angle    text,
  product_or_collection text,
  campaign_label    text,
  promo_code        text,
  transfer_link     text,
  planned_week_start date,
  date_submitted    date,
  status            public.content_item_status NOT NULL DEFAULT 'idea',
  assigned_to       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Kanban integration
  linked_card_id    uuid REFERENCES public.kanban_cards(id) ON DELETE SET NULL,

  -- Published content linking (manual)
  linked_post_id    uuid REFERENCES public.smm_posts(id) ON DELETE SET NULL,
  linked_ad_asset_id uuid REFERENCES public.ad_assets(id) ON DELETE SET NULL,
  linked_external_url text,
  linked_at         timestamptz,

  -- Audit
  created_by        uuid NOT NULL REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX idx_cci_status ON public.creative_content_items(status);
CREATE INDEX idx_cci_assigned ON public.creative_content_items(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_cci_planned_week ON public.creative_content_items(planned_week_start) WHERE planned_week_start IS NOT NULL;
CREATE INDEX idx_cci_created_at ON public.creative_content_items(created_at DESC);
CREATE INDEX idx_cci_linked_card ON public.creative_content_items(linked_card_id) WHERE linked_card_id IS NOT NULL;

-- ── Triggers ─────────────────────────────────────────────────

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.creative_content_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audit_log_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.creative_content_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.creative_content_items ENABLE ROW LEVEL SECURITY;

-- Read: ad-ops access pattern (OPS, creatives, marketing, ad-ops)
CREATE POLICY "cci_select" ON public.creative_content_items
  FOR SELECT TO authenticated
  USING (public.is_ad_ops_access());

-- Insert: ad-ops access
CREATE POLICY "cci_insert" ON public.creative_content_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ad_ops_access());

-- Update: ad-ops access
CREATE POLICY "cci_update" ON public.creative_content_items
  FOR UPDATE TO authenticated
  USING (public.is_ad_ops_access());

-- Delete: OPS or creator
CREATE POLICY "cci_delete" ON public.creative_content_items
  FOR DELETE TO authenticated
  USING (
    public.is_ops()
    OR created_by = auth.uid()
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_content_items;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00048_creative_content_items.sql
git commit -m "feat(creatives): add creative_content_items table for tracker workflow"
```

---

### Task 3: Operations System Tables Migration

**Files:**
- Create: `supabase/migrations/00049_operations_system.sql`

Creates the 8 operational domain tables that replace the masterlist spreadsheet ecosystem: catalog, inventory, orders, dispatch, order_issues, distressed_parcels, courier_tracking, remittance.

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 00049_operations_system.sql
-- Operations system — replaces the masterlist spreadsheet
-- ecosystem with 8 domain tables.
--
-- Domain modules:
--   1. catalog_items        — SKU / product reference layer
--   2. inventory_records    — stock truth
--   3. ops_orders           — clean order records
--   4. ops_order_items      — line items per order
--   5. dispatch_queue       — fulfillment workflow
--   6. order_issues         — recovery / exception tracking
--   7. distressed_parcels   — stuck/failed shipment tracking
--   8. courier_tracking     — shipment status events
--   9. remittance_batches   — reconciliation batches
--   10. remittance_items    — items within each batch
-- ============================================================


-- ── Enums ─────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.inventory_adjustment_type AS ENUM (
    'received', 'dispatched', 'returned', 'damaged', 'correction', 'reserved', 'released'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.dispatch_status AS ENUM (
    'pending', 'picking', 'packing', 'ready', 'handed_off', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.issue_type AS ENUM (
    'wrong_size', 'wrong_item', 'defective', 'long_delivery', 'unresponsive_customer',
    'changed_mind', 'no_budget', 'redelivery', 'courier_issue', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.issue_status AS ENUM (
    'open', 'in_progress', 'resolved', 'cancelled', 'escalated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.parcel_condition AS ENUM (
    'stuck', 'returned', 'damaged', 'lost', 'rts', 'pending_redelivery', 'resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.courier_event_type AS ENUM (
    'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_attempt',
    'returned_to_sender', 'rts_received', 'redelivery_scheduled', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.remittance_status AS ENUM (
    'draft', 'pending', 'reconciled', 'disputed', 'settled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 1. CATALOG — product / SKU reference layer
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           text UNIQUE NOT NULL,
  product_name  text NOT NULL,
  color         text,
  size          text,
  product_family text,
  collection    text,
  supplier_ref  text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_sku ON public.catalog_items(sku);
CREATE INDEX idx_catalog_family ON public.catalog_items(product_family) WHERE product_family IS NOT NULL;
CREATE INDEX idx_catalog_active ON public.catalog_items(is_active) WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_log_trigger AFTER INSERT OR UPDATE OR DELETE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ============================================================
-- 2. INVENTORY — stock truth
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  available_qty   int NOT NULL DEFAULT 0,
  reserved_qty    int NOT NULL DEFAULT 0,
  damaged_qty     int NOT NULL DEFAULT 0,
  location        text,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT positive_qty CHECK (available_qty >= 0 AND reserved_qty >= 0 AND damaged_qty >= 0),
  UNIQUE (catalog_item_id)
);

CREATE INDEX idx_inv_catalog ON public.inventory_records(catalog_item_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.inventory_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Stock movement history (append-only)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  adjustment_type public.inventory_adjustment_type NOT NULL,
  quantity        int NOT NULL,
  reference_id    text,
  notes           text,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_mov_item ON public.inventory_movements(catalog_item_id);
CREATE INDEX idx_inv_mov_created ON public.inventory_movements(created_at DESC);
CREATE INDEX idx_inv_mov_type ON public.inventory_movements(adjustment_type);


-- ============================================================
-- 3. ORDERS — clean order records
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ops_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id    uuid REFERENCES public.shopify_orders(id) ON DELETE SET NULL,
  order_number        text UNIQUE NOT NULL,
  customer_name       text,
  customer_email      text,
  customer_phone      text,
  financial_status    text NOT NULL DEFAULT 'pending',
  fulfillment_status  text NOT NULL DEFAULT 'unfulfilled',
  total_price         numeric(12,2) NOT NULL DEFAULT 0,
  payment_method      text,
  channel             text,
  notes               text,
  assigned_to         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_orders_number ON public.ops_orders(order_number);
CREATE INDEX idx_ops_orders_status ON public.ops_orders(fulfillment_status);
CREATE INDEX idx_ops_orders_financial ON public.ops_orders(financial_status);
CREATE INDEX idx_ops_orders_created ON public.ops_orders(created_at DESC);
CREATE INDEX idx_ops_orders_shopify ON public.ops_orders(shopify_order_id) WHERE shopify_order_id IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ops_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_log_trigger AFTER INSERT OR UPDATE OR DELETE ON public.ops_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- Order line items
CREATE TABLE IF NOT EXISTS public.ops_order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.ops_orders(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  product_name  text NOT NULL,
  sku           text,
  quantity      int NOT NULL DEFAULT 1,
  unit_price    numeric(10,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ooi_order ON public.ops_order_items(order_id);
CREATE INDEX idx_ooi_catalog ON public.ops_order_items(catalog_item_id) WHERE catalog_item_id IS NOT NULL;


-- ============================================================
-- 4. DISPATCH — fulfillment workflow
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dispatch_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.ops_orders(id) ON DELETE CASCADE,
  status          public.dispatch_status NOT NULL DEFAULT 'pending',
  is_preorder     boolean NOT NULL DEFAULT false,
  assigned_to     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  dispatch_date   date,
  courier_name    text,
  tracking_number text,
  handoff_at      timestamptz,
  remarks         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (order_id)
);

CREATE INDEX idx_dispatch_status ON public.dispatch_queue(status);
CREATE INDEX idx_dispatch_assigned ON public.dispatch_queue(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_dispatch_date ON public.dispatch_queue(dispatch_date) WHERE dispatch_date IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_log_trigger AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ============================================================
-- 5. ORDER ISSUES — recovery / exception tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_issues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.ops_orders(id) ON DELETE CASCADE,
  issue_type      public.issue_type NOT NULL,
  status          public.issue_status NOT NULL DEFAULT 'open',
  description     text,
  notes_after_call text,
  agent_remarks   text,
  summary         text,
  resolution      text,
  follow_up_owner uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  follow_up_date  date,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oi_order ON public.order_issues(order_id);
CREATE INDEX idx_oi_status ON public.order_issues(status);
CREATE INDEX idx_oi_type ON public.order_issues(issue_type);
CREATE INDEX idx_oi_followup ON public.order_issues(follow_up_date) WHERE follow_up_date IS NOT NULL AND status != 'resolved';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.order_issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_log_trigger AFTER INSERT OR UPDATE OR DELETE ON public.order_issues
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ============================================================
-- 6. DISTRESSED PARCELS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.distressed_parcels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid REFERENCES public.ops_orders(id) ON DELETE SET NULL,
  dispatch_id     uuid REFERENCES public.dispatch_queue(id) ON DELETE SET NULL,
  tracking_number text,
  condition       public.parcel_condition NOT NULL DEFAULT 'stuck',
  issue_reason    text,
  courier_notes   text,
  action_needed   text,
  resolved_at     timestamptz,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dp_condition ON public.distressed_parcels(condition);
CREATE INDEX idx_dp_order ON public.distressed_parcels(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_dp_unresolved ON public.distressed_parcels(condition) WHERE resolved_at IS NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.distressed_parcels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_log_trigger AFTER INSERT OR UPDATE OR DELETE ON public.distressed_parcels
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ============================================================
-- 7. COURIER TRACKING — event-based shipment status
-- ============================================================

CREATE TABLE IF NOT EXISTS public.courier_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id     uuid NOT NULL REFERENCES public.dispatch_queue(id) ON DELETE CASCADE,
  event_type      public.courier_event_type NOT NULL,
  event_time      timestamptz NOT NULL DEFAULT now(),
  location        text,
  courier_name    text,
  external_ref    text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ce_dispatch ON public.courier_events(dispatch_id);
CREATE INDEX idx_ce_time ON public.courier_events(event_time DESC);
CREATE INDEX idx_ce_type ON public.courier_events(event_type);


-- ============================================================
-- 8. REMITTANCE — reconciliation batches
-- ============================================================

CREATE TABLE IF NOT EXISTS public.remittance_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name      text NOT NULL,
  courier_name    text NOT NULL,
  status          public.remittance_status NOT NULL DEFAULT 'draft',
  total_expected  numeric(12,2) NOT NULL DEFAULT 0,
  total_received  numeric(12,2) NOT NULL DEFAULT 0,
  mismatch_amount numeric(12,2) GENERATED ALWAYS AS (total_received - total_expected) STORED,
  settlement_date date,
  notes           text,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rb_status ON public.remittance_batches(status);
CREATE INDEX idx_rb_courier ON public.remittance_batches(courier_name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.remittance_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.remittance_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL REFERENCES public.remittance_batches(id) ON DELETE CASCADE,
  order_id      uuid REFERENCES public.ops_orders(id) ON DELETE SET NULL,
  dispatch_id   uuid REFERENCES public.dispatch_queue(id) ON DELETE SET NULL,
  expected_amount numeric(10,2) NOT NULL DEFAULT 0,
  received_amount numeric(10,2),
  is_matched    boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ri_batch ON public.remittance_items(batch_id);
CREATE INDEX idx_ri_unmatched ON public.remittance_items(is_matched) WHERE is_matched = false;


-- ============================================================
-- RLS for all operations tables
-- Uses fulfillment/inventory/OPS access pattern
-- ============================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'catalog_items', 'inventory_records', 'inventory_movements',
      'ops_orders', 'ops_order_items',
      'dispatch_queue', 'order_issues', 'distressed_parcels',
      'courier_events', 'remittance_batches', 'remittance_items'
    ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Read: OPS + fulfillment + inventory + customer-service
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        public.is_ops()
        OR (SELECT slug FROM public.departments WHERE id = (
          SELECT department_id FROM public.profiles WHERE id = auth.uid()
        )) IN (''fulfillment'', ''inventory'', ''customer-service'', ''sales'')
      )', 'ops_select_' || tbl, tbl
    );

    -- Insert: same access
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
        public.is_ops()
        OR (SELECT slug FROM public.departments WHERE id = (
          SELECT department_id FROM public.profiles WHERE id = auth.uid()
        )) IN (''fulfillment'', ''inventory'', ''customer-service'', ''sales'')
      )', 'ops_insert_' || tbl, tbl
    );

    -- Update: same access
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
        public.is_ops()
        OR (SELECT slug FROM public.departments WHERE id = (
          SELECT department_id FROM public.profiles WHERE id = auth.uid()
        )) IN (''fulfillment'', ''inventory'', ''customer-service'', ''sales'')
      )', 'ops_update_' || tbl, tbl
    );

    -- Delete: OPS only
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
        public.is_ops()
      )', 'ops_delete_' || tbl, tbl
    );
  END LOOP;
END $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00049_operations_system.sql
git commit -m "feat(operations): add 8 domain tables replacing masterlist spreadsheet ecosystem"
```

---

## Phase 2: Executive Dashboard Enhancements

### Task 4: Root Dashboard — Task Velocity, Goal Progress, Feedback, Empty States

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `src/app/api/feedback/route.ts` (implement POST handler)

This task implements the Executive Gateway Phase 1 items from the design doc: task velocity cards, goal progress section, feedback button, empty state guidance, bug fixes (announcements `body`→`content`, Promise.all parallelization).

- [ ] **Step 1: Read the current dashboard page fully to understand exact line positions**

Run: Read `src/app/(dashboard)/page.tsx` from line 1-414

- [ ] **Step 2: Add task velocity stat cards**

After the existing "My kanban cards" stat card, add two new stat cards visible to managers/OPS:
- "Tasks completed this week" — `SELECT count(*) FROM kanban_cards WHERE completed_at >= now() - interval '7 days'`
- "Overdue tasks" — `SELECT count(*) FROM kanban_cards WHERE due_date < CURRENT_DATE AND completed_at IS NULL`

These queries use `createAdminClient()` to bypass RLS for cross-department visibility.

- [ ] **Step 3: Replace "Active goals" count with goal progress mini-list**

Replace the simple count stat card with a section showing each active goal's:
- Title
- Progress bar: `current_value / target_value * 100` (guard: `target_value > 0 ? ... : 0`)
- RAG status based on `deadline_green_days` and `deadline_amber_days`

Query: `goals` table, `status = 'active'`, ordered by deadline ascending.

- [ ] **Step 4: Add "This isn't right" feedback button**

Add a small "?" icon on each stat card and KPI health bar. Clicking opens a modal with one text field: "What should this show instead?"

POST to `/api/feedback` with:
```json
{ "category": "missing_feature", "body": "<user input>", "page_url": "/" }
```

- [ ] **Step 5: Implement the feedback API POST handler**

The feedback table already exists (migration 00036). The API route file exists but is incomplete. Add:
```typescript
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { category, body, page_url } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Body required" }, { status: 400 });

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    department_id: user.department_id,
    category: category || "other",
    body: body.trim(),
    page_url: page_url || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Add empty state guidance**

When a department has zero `kpi_definitions`:
- OPS users see: "Set up KPIs for [Department] →" linking to `/analytics/kpis`
- Managers see: "Request KPI setup from OPS →"
- Regular users see nothing

When kanban has no boards for a department:
- Managers see: "Create your first board →" linking to `/productivity`

- [ ] **Step 7: Fix announcements query bug**

Change the announcements query from selecting `body` to `content`, and add `flair_text, flair_color` to the select.

- [ ] **Step 8: Parallelize dashboard queries with Promise.all**

Wrap the existing 9+ sequential `await` calls into a single `Promise.all([...])` block, matching the pattern used in the executive overview page.

- [ ] **Step 9: Add data staleness warning**

Before showing department metrics, check `MAX(period_date)` from `kpi_entries`. If older than 48 hours, show a warning badge.

- [ ] **Step 10: Commit**

```bash
git add src/app/(dashboard)/page.tsx src/app/api/feedback/route.ts
git commit -m "feat(dashboard): task velocity, goal progress, feedback button, empty states, bug fixes"
```

---

## Phase 3: Ads Ops Executive KPI Dashboard

### Task 5: Executive Ad-Ops Page — 4-Tier KPI Framework Display

**Files:**
- Create: `src/app/(dashboard)/executive/ad-ops/page.tsx`
- Modify: `src/app/(dashboard)/executive/marketing/page.tsx` (add link to ad-ops KPI view)

Builds a dedicated executive ad-ops page showing all Marketing department KPIs organized by the 4-tier framework (North Star, Supporting, Efficiency, Budget). Each KPI shows its current value, RAG status, trend sparkline, and threshold context.

- [ ] **Step 1: Create the executive ad-ops page**

Server component that:
1. Fetches all `kpi_definitions` for marketing dept, grouped by category
2. Fetches latest `kpi_entries` per definition (team-level, profile_id IS NULL)
3. Fetches last 7 entries per definition for sparkline trends
4. Computes RAG status using the existing `rag()` function pattern
5. Renders 4 tier sections: North Star (hero cards), Supporting (stat cards), Efficiency (compact grid), Budget (progress bars)

The North Star section should be visually prominent — large cards with the ROAS value front and center, RAG-colored border, and sparkline.

Query pattern (matches existing executive pages):
```typescript
const admin = createAdminClient();
const [{ data: defs }, { data: entries }] = await Promise.all([
  admin.from("kpi_definitions")
    .select("*")
    .eq("department_id", marketingDeptId)
    .eq("is_active", true)
    .order("sort_order"),
  admin.from("kpi_entries")
    .select("kpi_definition_id, value_numeric, period_date")
    .is("profile_id", null)
    .order("period_date", { ascending: false })
    .limit(500),
]);
```

Tier rendering:
- **North Star**: 2 large hero cards (Overall ROAS + Total Revenue) with RAG border glow
- **Supporting**: 3 medium cards in a row (Conversion ROAS, Messenger ROAS, Returning Customer Rate)
- **Efficiency**: 6-column compact grid (Online Store Visits, CPLV, CPM, CPC, CTR, CPMR) with mini RAG indicators
- **Budget**: 3 cards with progress-bar style visualization (Daily Budget Pacing, Monthly Spend Utilization, Total Ad Spend)

- [ ] **Step 2: Add navigation link from executive marketing page**

Add a prominent link card at the top of the marketing page: "View Ads KPI Dashboard →" linking to `/executive/ad-ops`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/executive/ad-ops/page.tsx src/app/(dashboard)/executive/marketing/page.tsx
git commit -m "feat(executive): ads ops KPI dashboard with 4-tier framework display"
```

---

## Phase 4: Creatives Executive KPI Dashboard

### Task 6: Rebuild Executive Creatives Page with 5-Category KPI Framework

**Files:**
- Modify: `src/app/(dashboard)/executive/creatives/page.tsx`

Rebuilds the existing creatives executive page to prominently display KPIs organized by the 5-category framework (Ad Content Performance, Ad Content Output, Stills Output/Quality, Stills Performance, Organic Content Performance), while keeping the existing content pipeline and platform analytics sections.

- [ ] **Step 1: Read the current file and plan section layout**

The current page (276 lines) has: content pipeline bar, platform breakdown, upcoming scheduled, platform analytics (7d), top posts. KPIs are completely absent.

New layout order:
1. **KPI Health Summary** — overall RAG bar across all 5 categories (same pattern as root dashboard KpiHealthBar)
2. **Ad Content Performance** — 5 KPI cards (Hook Rate, ThruPlay Rate, CTR, Cost per 3-sec Play, Video Avg Play Time) — data from marketing dept KPIs
3. **Ad Content Output** — 3 KPI cards (Videos Delivered, On-Time Delivery, Revision Efficiency) — data from creatives dept KPIs
4. **Stills Output/Quality** — 3 KPI cards (Stills Delivered, On-Time Delivery Stills, Revision Efficiency Stills) — creatives dept
5. **Stills Performance** — 5 KPI cards (CTR Stills, CPM Stills, CPLV Stills, CPC Stills, ATC Stills) — creatives dept
6. **Organic Content Performance** — 6 KPI cards (Hook Rate Organic, View Count, Watch Time, Retention, Engagement, Link Clicks) — creatives dept
7. **Content Pipeline** — existing section (keep as-is)
8. **Platform Analytics** — existing section (keep as-is)
9. **Top Posts** — existing section (keep as-is)

- [ ] **Step 2: Add KPI queries to the existing Promise.all**

Add to the existing `Promise.all`:
```typescript
// Creatives dept KPIs
admin.from("kpi_definitions")
  .select("*")
  .eq("department_id", creativesDeptId)
  .eq("is_active", true)
  .order("sort_order"),
// Marketing dept Ad Content Performance KPIs (shared)
admin.from("kpi_definitions")
  .select("*")
  .eq("department_id", marketingDeptId)
  .eq("is_active", true)
  .in("category", ["Ad Content Performance"])
  .order("sort_order"),
// Latest entries for both
admin.from("kpi_entries")
  .select("kpi_definition_id, value_numeric, period_date")
  .is("profile_id", null)
  .order("period_date", { ascending: false })
  .limit(500),
```

- [ ] **Step 3: Add KPI category sections above existing content**

For each category, render a section with:
- Category header with overall RAG summary (green/amber/red counts)
- Grid of KPI cards (3 or 4 columns depending on count)
- Each card shows: name, latest value with unit formatting, RAG dot, threshold context line

Use the same `rag()` function and `formatValue()` pattern from the KPI dashboard.

- [ ] **Step 4: Keep existing content pipeline, platform analytics, and top posts sections**

These sections remain below the KPI sections, unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/executive/creatives/page.tsx
git commit -m "feat(executive): creatives KPI dashboard with 5-category framework display"
```

---

## Phase 5: Creatives Tracker

### Task 7: Creative Content Items API Routes

**Files:**
- Create: `src/app/api/creatives/content-items/route.ts`

CRUD API for creative content items with auto-kanban card creation on insert.

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const week = url.searchParams.get("week");

  let query = supabase.from("creative_content_items")
    .select("*, assigned:profiles!assigned_to(id, first_name, last_name), creator:profiles!created_by(id, first_name, last_name)")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (week) query = query.eq("planned_week_start", week);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();

  // 1. Create the content item
  const { data: item, error: itemError } = await supabase
    .from("creative_content_items")
    .insert({ ...body, created_by: user.id })
    .select("id, title")
    .single();

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });

  // 2. Auto-create linked kanban card if a board exists for creatives dept
  const { data: board } = await admin.from("kanban_boards")
    .select("id, kanban_columns(id, name, sort_order)")
    .eq("department_id", user.department_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (board?.kanban_columns?.length) {
    const firstCol = board.kanban_columns.sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
    const { data: card } = await admin.from("kanban_cards")
      .insert({
        column_id: firstCol.id,
        title: `[Content] ${item.title}`,
        assigned_to: body.assigned_to || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (card) {
      await supabase.from("creative_content_items")
        .update({ linked_card_id: card.id })
        .eq("id", item.id);
    }
  }

  return NextResponse.json({ data: item });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // If linking to published content, set linked_at timestamp
  if (updates.linked_post_id || updates.linked_ad_asset_id || updates.linked_external_url) {
    updates.linked_at = new Date().toISOString();
  }

  const { error } = await supabase.from("creative_content_items")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("creative_content_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/creatives/content-items/route.ts
git commit -m "feat(creatives): content items API with auto-kanban card creation"
```

---

### Task 8: Creatives Tracker UI — Planned & Published Views

**Files:**
- Create: `src/app/(dashboard)/creatives/tracker/page.tsx`
- Create: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx`

Server component page fetches content items + available smm_posts for linking. Client component provides the full tracker UI with tabs for Planned (filtered by status: idea through scheduled) and Published (status: published + archived), create/edit modal, status workflow, and manual publish linking.

- [ ] **Step 1: Create the server page component**

Fetches: creative_content_items (all), profiles (for assignment), smm_posts (published, for linking), kanban status of linked cards.

- [ ] **Step 2: Create the client tracker view**

Two tabs: "Planned" and "Published"

**Planned tab** shows items where status is in [idea, in_production, submitted, approved, scheduled]:
- Table/card view with: title, type, status, funnel, campaign, assigned, planned week, kanban status
- Create button opens modal with all fields from the content item schema
- Inline status transitions (idea → in_production → submitted → etc.)
- Click row to edit

**Published tab** shows items where status is in [published, archived]:
- Same columns plus: linked post, linked ad, performance preview
- "Link to Published Content" button opens a picker modal showing recent smm_posts

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/creatives/tracker/
git commit -m "feat(creatives): tracker UI with planned/published views and publish linking"
```

---

## Phase 6: Operations System Pages

### Task 9: Operations Layout & Catalog Page

**Files:**
- Create: `src/app/(dashboard)/operations/layout.tsx` — shared nav sidebar for operations sub-pages
- Create: `src/app/(dashboard)/operations/page.tsx` — operations overview/redirect
- Create: `src/app/(dashboard)/operations/catalog/page.tsx`
- Create: `src/app/(dashboard)/operations/catalog/catalog-view.tsx`
- Create: `src/app/api/operations/catalog/route.ts`

The operations layout provides a sidebar with links to all 8 modules. The catalog page is the first module — SKU/product reference layer with CRUD.

- [ ] **Step 1: Create the operations layout with sidebar navigation**

```typescript
// src/app/(dashboard)/operations/layout.tsx
const NAV_ITEMS = [
  { href: "/operations/catalog",    label: "Catalog",           icon: "📦" },
  { href: "/operations/inventory",  label: "Inventory",         icon: "📊" },
  { href: "/operations/orders",     label: "Orders",            icon: "🛒" },
  { href: "/operations/dispatch",   label: "Dispatch",          icon: "🚚" },
  { href: "/operations/issues",     label: "Issues / Recovery", icon: "⚠️" },
  { href: "/operations/distressed", label: "Distressed Parcels",icon: "📭" },
  { href: "/operations/courier",    label: "Courier Tracking",  icon: "📍" },
  { href: "/operations/remittance", label: "Remittance",        icon: "💰" },
];
```

Layout: sidebar on left (collapsible on mobile), content area on right. Access: OPS + fulfillment + inventory + customer-service + sales departments.

- [ ] **Step 2: Create the catalog API route**

Standard CRUD following existing patterns. GET with search/filter, POST to create, PATCH to update, DELETE (OPS only).

- [ ] **Step 3: Create the catalog page and client view**

Server page fetches catalog_items. Client view shows a searchable table with columns: SKU, Product Name, Color, Size, Family, Collection, Active. Create/edit modal. Inline toggle for is_active.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/operations/ src/app/api/operations/catalog/
git commit -m "feat(operations): layout + catalog module"
```

---

### Task 10: Inventory Module

**Files:**
- Create: `src/app/(dashboard)/operations/inventory/page.tsx`
- Create: `src/app/(dashboard)/operations/inventory/inventory-view.tsx`
- Create: `src/app/api/operations/inventory/route.ts`

Inventory page shows current stock levels per catalog item and stock movement history. Supports adjustments (receive, dispatch, damage, correct).

- [ ] **Step 1: Create the inventory API route**

GET returns `inventory_records` joined with `catalog_items`. POST creates stock adjustments (inserts into `inventory_movements` and updates `inventory_records` counts).

- [ ] **Step 2: Create the inventory page and client view**

Dashboard view: stock summary cards (total items, low stock alerts, recent movements). Table: catalog item, available, reserved, damaged, total. Click to see movement history. "Adjust Stock" button opens modal with adjustment type, quantity, notes.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/operations/inventory/ src/app/api/operations/inventory/
git commit -m "feat(operations): inventory module with stock levels and adjustments"
```

---

### Task 11: Orders Module

**Files:**
- Create: `src/app/(dashboard)/operations/orders/page.tsx`
- Create: `src/app/(dashboard)/operations/orders/orders-view.tsx`
- Create: `src/app/api/operations/orders/route.ts`

Orders page shows clean order records with financial/fulfillment status. Can be populated manually or linked from shopify_orders.

- [ ] **Step 1: Create the orders API and page**

GET with filters (financial_status, fulfillment_status, date range, search by order number/customer). POST to create manual orders. PATCH to update status. Table view with order details expandable to show line items.

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/operations/orders/ src/app/api/operations/orders/
git commit -m "feat(operations): orders module"
```

---

### Task 12: Dispatch Module

**Files:**
- Create: `src/app/(dashboard)/operations/dispatch/page.tsx`
- Create: `src/app/(dashboard)/operations/dispatch/dispatch-view.tsx`
- Create: `src/app/api/operations/dispatch/route.ts`

Dispatch queue showing orders ready for fulfillment. Kanban-style columns: Pending → Picking → Packing → Ready → Handed Off.

- [ ] **Step 1: Create the dispatch API and page**

GET returns `dispatch_queue` joined with `ops_orders`. PATCH to update status (move through workflow). The UI is a horizontal pipeline with count badges per status and a detailed list below.

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/operations/dispatch/ src/app/api/operations/dispatch/
git commit -m "feat(operations): dispatch queue module"
```

---

### Task 13: Issues / Recovery Module

**Files:**
- Create: `src/app/(dashboard)/operations/issues/page.tsx`
- Create: `src/app/(dashboard)/operations/issues/issues-view.tsx`
- Create: `src/app/api/operations/issues/route.ts`

Issue tracking for order problems. Shows open issues queue with type, status, follow-up dates. CRM-like detail view with notes, resolution, follow-up tracking.

- [ ] **Step 1: Create the issues API and page**

GET with filters (issue_type, status, follow_up_date). POST to create. PATCH to update status/notes/resolution. Table view with expandable detail rows showing call notes, agent remarks, and resolution.

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/operations/issues/ src/app/api/operations/issues/
git commit -m "feat(operations): order issues / recovery module"
```

---

### Task 14: Distressed Parcels Module

**Files:**
- Create: `src/app/(dashboard)/operations/distressed/page.tsx`
- Create: `src/app/(dashboard)/operations/distressed/distressed-view.tsx`
- Create: `src/app/api/operations/distressed/route.ts`

Queue of parcels that are stuck, returned, damaged, or lost. Visible as a priority list with condition badges and action needed.

- [ ] **Step 1: Create the distressed parcels API and page**

GET with condition filter. POST to create. PATCH to update condition/resolution. Card-based queue with condition as colored badge, linked order number, action needed text, and resolve button.

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/operations/distressed/ src/app/api/operations/distressed/
git commit -m "feat(operations): distressed parcels module"
```

---

### Task 15: Courier Tracking Module

**Files:**
- Create: `src/app/(dashboard)/operations/courier/page.tsx`
- Create: `src/app/(dashboard)/operations/courier/courier-view.tsx`
- Create: `src/app/api/operations/courier/route.ts`

Event-based courier tracking. Shows shipments with their latest status and full event timeline.

- [ ] **Step 1: Create the courier API and page**

GET returns dispatched orders with their latest `courier_events`. POST to add new tracking events. UI: shipment list with latest status badge, expandable timeline showing all events in chronological order.

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/operations/courier/ src/app/api/operations/courier/
git commit -m "feat(operations): courier tracking module"
```

---

### Task 16: Remittance Module

**Files:**
- Create: `src/app/(dashboard)/operations/remittance/page.tsx`
- Create: `src/app/(dashboard)/operations/remittance/remittance-view.tsx`
- Create: `src/app/api/operations/remittance/route.ts`

Reconciliation batch management. Shows batches with expected vs received totals and mismatch highlighting.

- [ ] **Step 1: Create the remittance API and page**

GET returns `remittance_batches` with summary. POST to create batch. PATCH to update status/amounts. Detail view shows `remittance_items` within a batch with match/mismatch highlighting.

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/operations/remittance/ src/app/api/operations/remittance/
git commit -m "feat(operations): remittance / reconciliation module"
```

---

## Phase 7: Navigation & Integration

### Task 17: Add Navigation Links for New Sections

**Files:**
- Modify: Navigation config (check `src/app/(dashboard)/layout.tsx` or nav component)

Add sidebar links for:
- Operations section with sub-items (visible to OPS + fulfillment + inventory + customer-service + sales)
- Creatives > Tracker (visible to creatives + ad-ops + marketing + OPS)
- Executive > Ad-Ops KPIs (visible to managers + OPS)

- [ ] **Step 1: Read the navigation configuration and add entries**

- [ ] **Step 2: Commit**

```bash
git add <nav files>
git commit -m "feat(nav): add operations, tracker, and ad-ops KPI navigation links"
```

---

### Task 18: Executive Overview — Add Ad-Ops KPI Tier Summary + Task Velocity

**Files:**
- Modify: `src/app/(dashboard)/executive/page.tsx`

Add to the executive overview:
1. "View Ads KPI Dashboard" link card for OPS users
2. Task velocity summary (completed this week + overdue) from the design doc
3. KPI health grouped by the new tier categories

- [ ] **Step 1: Read and modify the executive overview page**

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/executive/page.tsx
git commit -m "feat(executive): add ad-ops KPI link, task velocity, and tier-grouped health"
```

---

## Phase 8: Final Integration & Build Verification

### Task 19: Production Build Check & Push

- [ ] **Step 1: Run production build**

Run: `cd "/Users/fc-international-1/Documents/Avalon New" && npm run build 2>&1 | tail -30`

Fix any TypeScript or build errors.

- [ ] **Step 2: Apply migrations to Supabase**

Run migrations against the database (this step depends on the deployment workflow — either `npx supabase db push` or manual application).

- [ ] **Step 3: Final commit and push**

```bash
git push origin main
```

- [ ] **Step 4: Verify deployment**

Check the Vercel deployment succeeds and the new pages are accessible.

---

## Execution Order Summary

| Phase | Tasks | Estimated Effort | Dependencies |
|-------|-------|-----------------|--------------|
| 1. Database | Tasks 1-3 | 1 hour | None |
| 2. Dashboard | Task 4 | 2 hours | Phase 1 (KPI framework) |
| 3. Ads Ops KPIs | Task 5 | 1.5 hours | Phase 1 |
| 4. Creatives KPIs | Task 6 | 1.5 hours | Phase 1 |
| 5. Creatives Tracker | Tasks 7-8 | 2 hours | Phase 1 (content items table) |
| 6. Operations | Tasks 9-16 | 4-5 hours | Phase 1 (operations tables) |
| 7. Navigation | Tasks 17-18 | 1 hour | Phases 2-6 |
| 8. Build & Deploy | Task 19 | 30 min | All phases |

**Total estimated: ~14-15 hours of focused work across multiple sessions.**

Phases 1-4 can ship as one commit batch (core executive gateway). Phases 5-6 can ship separately (creatives tracker + operations). This keeps each batch independently useful.
