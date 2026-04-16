-- ============================================================
-- 00055_kpi_calendar.sql
-- 1. Add data_source_status to kpi_definitions
-- 2. Create calendar_events table
-- 3. Seed Philippine holidays + double-digit sales
-- ============================================================

-- 1. KPI wiring status
ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS data_source_status text NOT NULL DEFAULT 'standalone';

-- Add check constraint separately (IF NOT EXISTS not supported for constraints)
DO $$ BEGIN
  ALTER TABLE public.kpi_definitions
    ADD CONSTRAINT kpi_def_data_source_check
    CHECK (data_source_status IN ('standalone', 'to_be_wired', 'wired'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Calendar events
CREATE TABLE public.calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  event_date      date NOT NULL,
  end_date        date,
  event_type      text NOT NULL DEFAULT 'custom'
                  CHECK (event_type IN ('sale_event', 'holiday', 'company', 'custom')),
  is_recurring    boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  description     text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cal_events_date ON public.calendar_events(event_date);
CREATE INDEX idx_cal_events_type ON public.calendar_events(event_type);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events FORCE ROW LEVEL SECURITY;

CREATE POLICY cal_select ON public.calendar_events FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY cal_insert ON public.calendar_events FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY cal_update ON public.calendar_events FOR UPDATE USING (public.is_ops());
CREATE POLICY cal_delete ON public.calendar_events FOR DELETE USING (public.is_ops());

-- 3. Seed: PH Double-Digit Sales (recurring yearly)
INSERT INTO public.calendar_events (title, event_date, event_type, is_recurring, recurrence_rule, description) VALUES
  ('1.1 New Year Sale',     '2026-01-01', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('2.2 Sale',              '2026-02-02', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('3.3 Sale',              '2026-03-03', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('4.4 Sale',              '2026-04-04', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('5.5 Sale',              '2026-05-05', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('6.6 Sale',              '2026-06-06', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('7.7 Sale',              '2026-07-07', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('8.8 Sale',              '2026-08-08', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('9.9 Sale',              '2026-09-09', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('10.10 Sale',            '2026-10-10', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('11.11 Sale',            '2026-11-11', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns'),
  ('12.12 Sale',            '2026-12-12', 'sale_event', true, 'yearly', 'Double-digit sale — prepare campaigns');

-- Seed: Major PH Holidays (recurring yearly)
INSERT INTO public.calendar_events (title, event_date, event_type, is_recurring, recurrence_rule) VALUES
  ('New Year''s Day',       '2026-01-01', 'holiday', true, 'yearly'),
  ('Araw ng Kagitingan',    '2026-04-09', 'holiday', true, 'yearly'),
  ('Labor Day',             '2026-05-01', 'holiday', true, 'yearly'),
  ('Independence Day',      '2026-06-12', 'holiday', true, 'yearly'),
  ('National Heroes Day',   '2026-08-31', 'holiday', true, 'yearly'),
  ('Bonifacio Day',         '2026-11-30', 'holiday', true, 'yearly'),
  ('Christmas Day',         '2026-12-25', 'holiday', true, 'yearly'),
  ('Rizal Day',             '2026-12-30', 'holiday', true, 'yearly'),
  ('New Year''s Eve',       '2026-12-31', 'holiday', true, 'yearly');
