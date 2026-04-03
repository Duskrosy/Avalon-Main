-- ============================================================
-- 00006_sales.sql
-- Avalon Rebuild — Phase 6: Sales Operations
-- ============================================================


-- ==========================
-- ENUMS
-- ==========================
CREATE TYPE public.qa_tier        AS ENUM ('Tier 3', 'Tier 2', 'Tier 1', 'Fail');
CREATE TYPE public.downtime_type  AS ENUM ('system', 'internet', 'power', 'tool', 'other');
CREATE TYPE public.payout_status  AS ENUM ('draft', 'approved', 'paid', 'disputed');


-- ==========================
-- SALES DAILY VOLUME
-- One row per agent per date. confirmed_regular is computed.
-- ==========================
CREATE TABLE public.sales_daily_volume (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  date                 date NOT NULL,
  follow_ups           integer NOT NULL DEFAULT 0,
  confirmed_total      integer NOT NULL DEFAULT 0,
  confirmed_abandoned  integer NOT NULL DEFAULT 0,
  confirmed_regular    integer GENERATED ALWAYS AS (GREATEST(0, confirmed_total - confirmed_abandoned)) STORED,
  buffer_approved      boolean NOT NULL DEFAULT false,
  buffer_reason        text,
  buffer_proof_link    text,
  buffer_approved_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  buffer_approved_at   timestamptz,
  on_leave             boolean NOT NULL DEFAULT false,
  excluded_hours       numeric NOT NULL DEFAULT 0,
  notes                text,
  source               text NOT NULL DEFAULT 'manual',
  created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (agent_id, date)
);

CREATE INDEX idx_sdv_agent_date ON public.sales_daily_volume (agent_id, date DESC);
CREATE INDEX idx_sdv_date       ON public.sales_daily_volume (date DESC);

CREATE TRIGGER trg_sdv_updated_at
  BEFORE UPDATE ON public.sales_daily_volume
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_sdv
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_daily_volume
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- SALES CONFIRMED SALES
-- ==========================
CREATE TABLE public.sales_confirmed_sales (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  confirmed_date   date NOT NULL,
  hour_range       text,
  duration_text    text,
  order_id         text NOT NULL,
  agent_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sale_type        text,
  design           text,
  quantity         integer NOT NULL DEFAULT 1,
  net_value        numeric NOT NULL DEFAULT 0,
  discount_offered text,
  abandoned_cart   boolean NOT NULL DEFAULT false,
  ads_source       text,
  alex_assist      text,
  payment_mode     text,
  status           text NOT NULL DEFAULT 'confirmed',
  notes            text,
  source           text NOT NULL DEFAULT 'manual',
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scs_agent_date ON public.sales_confirmed_sales (agent_id, confirmed_date DESC);
CREATE INDEX idx_scs_date       ON public.sales_confirmed_sales (confirmed_date DESC);
CREATE INDEX idx_scs_order_id   ON public.sales_confirmed_sales (order_id);

CREATE TRIGGER trg_scs_updated_at
  BEFORE UPDATE ON public.sales_confirmed_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_scs
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_confirmed_sales
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- SALES QA LOG
-- One entry per agent per date (1 QA check per agent per working day).
-- ==========================
CREATE TABLE public.sales_qa_log (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  qa_date      date NOT NULL,
  message_link text NOT NULL,
  qa_tier      public.qa_tier NOT NULL,
  qa_points    integer NOT NULL DEFAULT 0,
  qa_fail      boolean NOT NULL DEFAULT false,
  qa_reason    text NOT NULL,
  evaluator    text NOT NULL,
  notes        text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (agent_id, qa_date)
);

CREATE INDEX idx_sql_agent_date ON public.sales_qa_log (agent_id, qa_date DESC);
CREATE INDEX idx_sql_date       ON public.sales_qa_log (qa_date DESC);
CREATE INDEX idx_sql_tier       ON public.sales_qa_log (qa_tier);

CREATE TRIGGER trg_audit_sql
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_qa_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- SALES DOWNTIME LOG
-- ==========================
CREATE TABLE public.sales_downtime_log (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  date           date NOT NULL,
  agent_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  downtime_type  public.downtime_type NOT NULL,
  affected_tool  text,
  start_time     time NOT NULL,
  end_time       time,
  duration_hours numeric,
  ticket_ref     text,
  description    text NOT NULL,
  verified       boolean NOT NULL DEFAULT false,
  verified_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sdl_date ON public.sales_downtime_log (date DESC);

CREATE TRIGGER trg_audit_sdl
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_downtime_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- SALES CONSISTENCY
-- Monthly per-agent consistency score. Manager-confirmed.
-- ranges_hit: 0-3 (how many of the 3 month ranges hit ≥70 avg FPS)
-- ==========================
CREATE TABLE public.sales_consistency (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  month             text NOT NULL,        -- 'YYYY-MM'
  ranges_hit        integer NOT NULL DEFAULT 0 CHECK (ranges_hit BETWEEN 0 AND 3),
  consistency_score integer NOT NULL DEFAULT 0,
  evaluator         text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (agent_id, month)
);

CREATE INDEX idx_sc_agent_month ON public.sales_consistency (agent_id, month DESC);

CREATE TRIGGER trg_sc_updated_at
  BEFORE UPDATE ON public.sales_consistency
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- SALES INCENTIVE PAYOUTS
-- One record per agent per month. Computed then saved.
-- ==========================
CREATE TABLE public.sales_incentive_payouts (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  month                 text NOT NULL,
  gate_passed           boolean NOT NULL DEFAULT false,
  mtd_confirmed_regular integer NOT NULL DEFAULT 0,
  gate_threshold        integer NOT NULL DEFAULT 180,
  avg_fps               numeric,
  scored_days           integer NOT NULL DEFAULT 0,
  consistency_score     integer NOT NULL DEFAULT 0,
  final_fps             numeric,
  payout_tier           text,
  -- Pair counts (entered by manager for payout calculation)
  paid_pairs            integer NOT NULL DEFAULT 0,
  abandoned_pairs       integer NOT NULL DEFAULT 0,
  onhand_pairs          integer NOT NULL DEFAULT 0,
  total_delivered       integer NOT NULL DEFAULT 0,
  -- Payout breakdown (₱)
  main_tier_payout      numeric NOT NULL DEFAULT 0,
  abandoned_payout      numeric NOT NULL DEFAULT 0,
  onhand_payout         numeric NOT NULL DEFAULT 0,
  total_payout          numeric NOT NULL DEFAULT 0,
  -- Approval workflow
  status                public.payout_status NOT NULL DEFAULT 'draft',
  approved_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at           timestamptz,
  paid_at               timestamptz,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (agent_id, month)
);

CREATE INDEX idx_sip_agent_month ON public.sales_incentive_payouts (agent_id, month DESC);
CREATE INDEX idx_sip_month       ON public.sales_incentive_payouts (month DESC);
CREATE INDEX idx_sip_status      ON public.sales_incentive_payouts (status);

CREATE TRIGGER trg_sip_updated_at
  BEFORE UPDATE ON public.sales_incentive_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_sip
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_incentive_payouts
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- RLS HELPER: is user in sales dept or OPS?
-- ==========================
CREATE OR REPLACE FUNCTION public.is_sales_or_ops() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.is_ops() OR (
    SELECT slug FROM public.departments WHERE id = public.get_my_department_id() LIMIT 1
  ) = 'sales'
$$;


-- ==========================
-- ENABLE RLS
-- ==========================
ALTER TABLE public.sales_daily_volume      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_daily_volume      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales_confirmed_sales   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_confirmed_sales   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales_qa_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_qa_log            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales_downtime_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_downtime_log      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales_consistency       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_consistency       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales_incentive_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_incentive_payouts FORCE ROW LEVEL SECURITY;


-- ==========================
-- RLS POLICIES
-- ==========================

-- Daily Volume
CREATE POLICY sdv_select ON public.sales_daily_volume FOR SELECT USING (public.is_sales_or_ops());
CREATE POLICY sdv_insert ON public.sales_daily_volume FOR INSERT WITH CHECK (public.is_sales_or_ops());
CREATE POLICY sdv_update ON public.sales_daily_volume FOR UPDATE USING (public.is_sales_or_ops());
CREATE POLICY sdv_delete ON public.sales_daily_volume FOR DELETE USING (public.is_manager_or_above());

-- Confirmed Sales
CREATE POLICY scs_select ON public.sales_confirmed_sales FOR SELECT USING (public.is_sales_or_ops());
CREATE POLICY scs_insert ON public.sales_confirmed_sales FOR INSERT WITH CHECK (public.is_sales_or_ops());
CREATE POLICY scs_update ON public.sales_confirmed_sales FOR UPDATE USING (public.is_sales_or_ops());
CREATE POLICY scs_delete ON public.sales_confirmed_sales FOR DELETE USING (public.is_manager_or_above());

-- QA Log
CREATE POLICY sql_select ON public.sales_qa_log FOR SELECT USING (public.is_sales_or_ops());
CREATE POLICY sql_insert ON public.sales_qa_log FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY sql_update ON public.sales_qa_log FOR UPDATE USING (public.is_manager_or_above());
CREATE POLICY sql_delete ON public.sales_qa_log FOR DELETE USING (public.is_manager_or_above());

-- Downtime Log
CREATE POLICY sdl_select ON public.sales_downtime_log FOR SELECT USING (public.is_sales_or_ops());
CREATE POLICY sdl_insert ON public.sales_downtime_log FOR INSERT WITH CHECK (public.is_sales_or_ops());
CREATE POLICY sdl_update ON public.sales_downtime_log FOR UPDATE USING (public.is_manager_or_above());
CREATE POLICY sdl_delete ON public.sales_downtime_log FOR DELETE USING (public.is_manager_or_above());

-- Consistency
CREATE POLICY sc_select ON public.sales_consistency FOR SELECT USING (public.is_sales_or_ops());
CREATE POLICY sc_insert ON public.sales_consistency FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY sc_update ON public.sales_consistency FOR UPDATE USING (public.is_manager_or_above());
CREATE POLICY sc_delete ON public.sales_consistency FOR DELETE USING (public.is_manager_or_above());

-- Incentive Payouts
CREATE POLICY sip_select ON public.sales_incentive_payouts FOR SELECT USING (public.is_sales_or_ops());
CREATE POLICY sip_insert ON public.sales_incentive_payouts FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY sip_update ON public.sales_incentive_payouts FOR UPDATE USING (public.is_manager_or_above());
CREATE POLICY sip_delete ON public.sales_incentive_payouts FOR DELETE USING (public.is_ops());
