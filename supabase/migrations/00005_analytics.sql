-- ============================================================
-- 00005_analytics.sql
-- Avalon Rebuild — Phase 5: Analytics (KPIs + Goals)
-- ============================================================


-- ==========================
-- KPI DEFINITIONS
-- Seeded per-department. direction: higher_better | lower_better
-- threshold_green / threshold_amber: the RAG boundary values.
--   higher_better: value >= green → green, >= amber → amber, else red
--   lower_better:  value <= green → green, <= amber → amber, else red
-- is_platform_tracked: will be auto-populated by platform in future
-- ==========================
CREATE TYPE public.kpi_frequency AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE public.kpi_direction AS ENUM ('higher_better', 'lower_better');
CREATE TYPE public.kpi_unit AS ENUM ('percent', 'number', 'currency_php', 'days', 'weeks', 'seconds');

CREATE TABLE public.kpi_definitions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id       uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  name                text NOT NULL,
  category            text NOT NULL,
  unit                public.kpi_unit NOT NULL DEFAULT 'percent',
  direction           public.kpi_direction NOT NULL DEFAULT 'higher_better',
  frequency           public.kpi_frequency NOT NULL DEFAULT 'monthly',
  threshold_green     numeric NOT NULL,
  threshold_amber     numeric NOT NULL,
  hint                text,
  is_platform_tracked boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_def_dept ON public.kpi_definitions (department_id);


-- ==========================
-- KPI ENTRIES
-- One row per KPI per period. profile_id optional for per-agent KPIs.
-- ==========================
CREATE TABLE public.kpi_entries (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kpi_definition_id uuid NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  profile_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  period_date       date NOT NULL,    -- week start (Mon) or 1st of month
  value_numeric     numeric NOT NULL,
  notes             text,
  entered_by        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (kpi_definition_id, profile_id, period_date)
);

CREATE INDEX idx_kpi_entries_def_id    ON public.kpi_entries (kpi_definition_id);
CREATE INDEX idx_kpi_entries_profile   ON public.kpi_entries (profile_id);
CREATE INDEX idx_kpi_entries_period    ON public.kpi_entries (period_date DESC);

CREATE TRIGGER trg_audit_kpi_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.kpi_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- GOALS
-- Strategic department goals with target/current value + deadline
-- ==========================
CREATE TYPE public.goal_status AS ENUM ('active', 'achieved', 'cancelled');

CREATE TABLE public.goals (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  target_value  numeric NOT NULL,
  current_value numeric NOT NULL DEFAULT 0,
  unit          text NOT NULL DEFAULT '%',
  deadline      date NOT NULL,
  status        public.goal_status NOT NULL DEFAULT 'active',
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_dept      ON public.goals (department_id);
CREATE INDEX idx_goals_status    ON public.goals (status);
CREATE INDEX idx_goals_deadline  ON public.goals (deadline);

CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_goals
  AFTER INSERT OR UPDATE OR DELETE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- ENABLE RLS
-- ==========================
ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_entries     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.goals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals           FORCE ROW LEVEL SECURITY;


-- ==========================
-- RLS — KPI DEFINITIONS (read-only for staff, OPS can manage)
-- ==========================
CREATE POLICY kpi_def_select ON public.kpi_definitions FOR SELECT USING (
  is_active = true AND (
    public.is_ops()
    OR department_id IS NULL
    OR department_id = public.get_my_department_id()
  )
);
CREATE POLICY kpi_def_insert ON public.kpi_definitions FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY kpi_def_update ON public.kpi_definitions FOR UPDATE USING (public.is_ops());
CREATE POLICY kpi_def_delete ON public.kpi_definitions FOR DELETE USING (public.is_ops());


-- ==========================
-- RLS — KPI ENTRIES
-- ==========================
CREATE POLICY kpi_entries_select ON public.kpi_entries FOR SELECT USING (
  public.is_ops()
  OR EXISTS (
    SELECT 1 FROM public.kpi_definitions d
    WHERE d.id = kpi_definition_id
    AND d.department_id = public.get_my_department_id()
  )
);
CREATE POLICY kpi_entries_insert ON public.kpi_entries FOR INSERT WITH CHECK (
  public.is_manager_or_above()
);
CREATE POLICY kpi_entries_update ON public.kpi_entries FOR UPDATE USING (
  public.is_manager_or_above()
);
CREATE POLICY kpi_entries_delete ON public.kpi_entries FOR DELETE USING (
  public.is_ops() OR entered_by = auth.uid()
);


-- ==========================
-- RLS — GOALS
-- ==========================
CREATE POLICY goals_select ON public.goals FOR SELECT USING (
  department_id IS NULL
  OR public.is_ops()
  OR department_id = public.get_my_department_id()
);
CREATE POLICY goals_insert ON public.goals FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY goals_update ON public.goals FOR UPDATE USING (
  public.is_ops()
  OR (public.is_manager_or_above() AND department_id = public.get_my_department_id())
);
CREATE POLICY goals_delete ON public.goals FOR DELETE USING (
  public.is_ops() OR created_by = auth.uid()
);


-- ============================================================
-- SEED KPI DEFINITIONS
-- ============================================================

-- CREATIVES: Ad Performance
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order
FROM public.departments d,
(VALUES
  ('Hook Rate',                  'Performance', 'percent',      'higher_better', 'weekly',  30,   25,   'Above 30% target. Measures how many viewers watch past the hook.',    1),
  ('ThruPlay Rate',              'Performance', 'percent',      'higher_better', 'weekly',  15,   10,   'Above 15%. Percentage of viewers who watch 15s or to 97% completion.', 2),
  ('Click Through Rate',         'Performance', 'percent',      'higher_better', 'weekly',  1.5,  1.0,  'Above 1.5%. Clicks ÷ impressions.',                                   3),
  ('Cost per 3-sec Video Play',  'Performance', 'currency_php', 'lower_better',  'weekly',  0.60, 0.90, 'Below ₱0.60. Cost for each 3-second play.',                           4),
  ('Video Avg. Play Time',       'Performance', 'seconds',      'higher_better', 'weekly',  6,    3,    'Above 6 seconds average view duration.',                              5),
  ('Ad Videos Delivered',        'Output',      'number',       'higher_better', 'weekly',  5,    4,    '5+ per week. On-time delivery of ad content videos.',                 6),
  ('On-Time Delivery',           'Output',      'percent',      'higher_better', 'weekly',  100,  80,   '100% on-time delivery target.',                                       7),
  ('Revision Efficiency',        'Output',      'percent',      'higher_better', 'weekly',  90,   80,   '≥90%. First-pass or revision-within-one-round rate.',                 8)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order)
WHERE d.slug = 'creatives';


-- CUSTOMER SERVICE
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order
FROM public.departments d,
(VALUES
  ('Customer Return Rate',     'Service Quality', 'percent', 'higher_better', 'monthly', 30, 20, '≥30% monthly. Measures how often customers come back.', 1),
  ('Good Customer Review Rate','Service Quality', 'percent', 'higher_better', 'monthly', 99, 95, '≥99%. Only 1 complaint per 100 orders accepted. Replacements & refunds not counted unless bad review.', 2),
  ('Cancellation Rate',        'Service Quality', 'percent', 'lower_better',  'monthly', 5,  7,  '<5% target. Above 7% is a critical flag regardless of sales volume.', 3),
  ('On-Hand Utilization Rate', 'Inventory',       'percent', 'higher_better', 'monthly', 40, 30, '≥40% of delivered orders must come from on-hand inventory.', 4)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order)
WHERE d.slug = 'customer-service';


-- FULFILLMENT
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order
FROM public.departments d,
(VALUES
  ('Error Rate',                    'Operations', 'percent', 'lower_better',  'monthly', 1,   3,   '<1% target. Includes wrong items, wrong sizes, mispacks. Shared with Inventory.', 1),
  ('Return-to-Sender Rate',         'Operations', 'percent', 'lower_better',  'monthly', 7,   10,  '<7% target. Must stay below 10% at all times.', 2),
  ('Arrival to Dispatch Time',      'Operations', 'days',    'lower_better',  'monthly', 3,   5,   '<3 days from inventory arrival to dispatch.', 3),
  ('Marketplace Score',             'Operations', 'percent', 'higher_better', 'monthly', 97,  93,  '≥97% across Shopee, Lazada, and TikTok Shop.', 4),
  ('Masterlist Order Allocation',   'Compliance', 'percent', 'higher_better', 'monthly', 100, 95,  '100% allocated — Delivered, Cancelled, or RTS. Zero "No Update" beyond 1 month.', 5),
  ('Remittance Accuracy',           'Compliance', 'percent', 'higher_better', 'monthly', 100, 95,  '100% accuracy required. Any discrepancy requires immediate investigation.', 6)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order)
WHERE d.slug = 'fulfillment';


-- INVENTORY
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order
FROM public.departments d,
(VALUES
  ('Inventory Accuracy',       'Stock Control', 'percent', 'higher_better', 'monthly', 99,   95,   '≥99% system vs physical count match. Activates upon Zetpy migration.', 1),
  ('Error Rate',               'Stock Control', 'percent', 'lower_better',  'monthly', 1,    3,    '<1% target. Includes wrong items, sizes, mispacks. Shared with Fulfillment.', 2),
  ('Shipping Time from Order', 'Stock Control', 'weeks',   'lower_better',  'monthly', 3,    4,    '<3 weeks from order placement to receipt.', 3),
  ('Total Inventory Level',    'Stock Levels',  'number',  'higher_better', 'monthly', 2500, 2000, '≥2,500 pairs. Below 2,000 is a critical stock alert.', 4),
  ('Packaging & Supplies',     'Stock Levels',  'percent', 'higher_better', 'monthly', 100,  50,   'All items fully stocked. 0% = zero stock on any item (immediate RED). 50% = critically low.', 5)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order)
WHERE d.slug = 'inventory';


-- SALES
INSERT INTO public.kpi_definitions
  (department_id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, sort_order, is_platform_tracked)
SELECT d.id, kpi.name, kpi.category, kpi.unit::public.kpi_unit, kpi.direction::public.kpi_direction,
       kpi.frequency::public.kpi_frequency, kpi.tg, kpi.ta, kpi.hint, kpi.sort_order, kpi.auto
FROM public.departments d,
(VALUES
  ('Monthly Team Pairs Sold',        'Volume',   'number',  'higher_better', 'monthly', 1200,  1060,  '≥1,200 pairs/month target. 1,060 is the adjusted baseline (85% of theoretical max).', 1,  true),
  ('Individual Agent Daily Target',  'Volume',   'number',  'higher_better', 'daily',   8,     6,     '8 pairs/day per agent. Below 6 is critical.', 2, true),
  ('Individual Agent Monthly Total', 'Volume',   'number',  'higher_better', 'monthly', 208,   166,   '≥208 pairs/month based on 26 working days.', 3, true),
  ('Quality Score',                  'Quality',  'percent', 'higher_better', 'monthly', 80,    70,    '≥80% QA grade. Below 70% requires immediate corrective action.', 4, true),
  ('Cancellation Rate',              'Quality',  'percent', 'lower_better',  'monthly', 5,     7,     '<5% target. Above 7% is a RED FLAG even at high volume.', 5, true),
  ('Overall ROAS',                   'Marketing','number',  'higher_better', 'monthly', 14,    10,    '≥14x return on ad spend per month. Below 10 requires immediate ad strategy review.', 6, false),
  ('Monthly Messages Volume',        'Activity', 'number',  'higher_better', 'monthly', 25000, 20000, '≥25,000 messages/month across all sales channels.', 7, false),
  ('On-Hand Inventory Utilization',  'Activity', 'percent', 'higher_better', 'monthly', 50,    40,    '≥50% of delivered orders from on-hand stock.', 8, false)
) AS kpi(name, category, unit, direction, frequency, tg, ta, hint, sort_order, auto)
WHERE d.slug = 'sales';
