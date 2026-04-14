-- ============================================================
-- 00044_room_availability.sql
-- Avalon — Room availability hours and slot duration
-- ============================================================

-- Add operating hours and slot duration to rooms
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS open_time time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS close_time time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS slot_duration integer NOT NULL DEFAULT 30;

-- slot_duration must be 15, 30, or 60
ALTER TABLE public.rooms
  ADD CONSTRAINT chk_slot_duration
  CHECK (slot_duration IN (15, 30, 60));

-- open_time must be before close_time
ALTER TABLE public.rooms
  ADD CONSTRAINT chk_room_hours
  CHECK (close_time > open_time);

-- Add booking_invitees table for meeting invites
CREATE TABLE public.booking_invitees (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid NOT NULL REFERENCES public.room_bookings(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_booking_invitee UNIQUE (booking_id, user_id)
);

CREATE INDEX idx_booking_invitees_booking ON public.booking_invitees (booking_id);
CREATE INDEX idx_booking_invitees_user ON public.booking_invitees (user_id);

-- RLS for booking_invitees
ALTER TABLE public.booking_invitees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_invitees FORCE ROW LEVEL SECURITY;

-- Anyone can see invitees for bookings they can see
CREATE POLICY booking_invitees_select ON public.booking_invitees FOR SELECT USING (
  public.is_ops()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.room_bookings b WHERE b.id = booking_id AND b.booked_by = auth.uid()
  )
);

-- Booking creator or OPS can insert invitees
CREATE POLICY booking_invitees_insert ON public.booking_invitees FOR INSERT WITH CHECK (
  public.is_ops()
  OR EXISTS (
    SELECT 1 FROM public.room_bookings b WHERE b.id = booking_id AND b.booked_by = auth.uid()
  )
);

-- Booking creator or OPS can delete invitees
CREATE POLICY booking_invitees_delete ON public.booking_invitees FOR DELETE USING (
  public.is_ops()
  OR EXISTS (
    SELECT 1 FROM public.room_bookings b WHERE b.id = booking_id AND b.booked_by = auth.uid()
  )
);
