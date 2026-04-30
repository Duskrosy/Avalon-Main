-- ============================================================
-- 00099_calendar_events_extended.sql
-- Seed additional PH holidays + commercial special events
-- (Mother's Day, Father's Day, Valentine's, Halloween, BFCM, etc.)
-- Dates anchored to 2026; movable holidays use 2026 placeholder.
-- ============================================================

-- Regular & Special Non-Working PH Holidays
INSERT INTO public.calendar_events (title, event_date, event_type, is_recurring, recurrence_rule, description) VALUES
  ('Chinese New Year',                  '2026-02-17', 'holiday', true, 'yearly', 'Special non-working holiday — date varies yearly'),
  ('EDSA People Power Anniversary',     '2026-02-25', 'holiday', true, 'yearly', 'Special non-working holiday'),
  ('Maundy Thursday',                   '2026-04-02', 'holiday', true, 'yearly', 'Regular holiday — date varies yearly (Holy Week)'),
  ('Good Friday',                       '2026-04-03', 'holiday', true, 'yearly', 'Regular holiday — date varies yearly (Holy Week)'),
  ('Black Saturday',                    '2026-04-04', 'holiday', true, 'yearly', 'Special non-working holiday — date varies yearly'),
  ('Easter Sunday',                     '2026-04-05', 'holiday', true, 'yearly', 'Date varies yearly'),
  ('Eid''l Fitr',                       '2026-03-21', 'holiday', true, 'yearly', 'Regular holiday — date varies yearly (lunar)'),
  ('Eid''l Adha',                       '2026-05-27', 'holiday', true, 'yearly', 'Regular holiday — date varies yearly (lunar)'),
  ('Ninoy Aquino Day',                  '2026-08-21', 'holiday', true, 'yearly', 'Special non-working holiday'),
  ('All Saints'' Day',                  '2026-11-01', 'holiday', true, 'yearly', 'Special non-working holiday'),
  ('All Souls'' Day',                   '2026-11-02', 'holiday', true, 'yearly', 'Additional special non-working holiday'),
  ('Feast of the Immaculate Conception','2026-12-08', 'holiday', true, 'yearly', 'Special non-working holiday'),
  ('Christmas Eve',                     '2026-12-24', 'holiday', true, 'yearly', 'Additional special non-working holiday');

-- Commercial / cultural special events (sale drivers)
INSERT INTO public.calendar_events (title, event_date, event_type, is_recurring, recurrence_rule, description) VALUES
  ('Valentine''s Day',  '2026-02-14', 'sale_event', true, 'yearly', 'Gifting peak — prepare campaigns'),
  ('Mother''s Day',     '2026-05-10', 'sale_event', true, 'yearly', '2nd Sunday of May — gifting peak, prepare campaigns'),
  ('Father''s Day',     '2026-06-21', 'sale_event', true, 'yearly', '3rd Sunday of June — gifting peak, prepare campaigns'),
  ('Halloween',         '2026-10-31', 'sale_event', true, 'yearly', 'Themed promos — prepare campaigns'),
  ('Black Friday',      '2026-11-27', 'sale_event', true, 'yearly', 'Day after US Thanksgiving — major sale, prepare campaigns'),
  ('Cyber Monday',      '2026-11-30', 'sale_event', true, 'yearly', 'Monday after Black Friday — major sale, prepare campaigns');
