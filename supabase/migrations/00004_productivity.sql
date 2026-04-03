-- ============================================================
-- 00004_productivity.sql
-- Avalon Rebuild — Phase 4: Productivity & Communications
-- Kanban, Rooms, Announcements
-- ============================================================


-- ==========================
-- ENUMS
-- ==========================
CREATE TYPE public.card_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.announcement_priority AS ENUM ('normal', 'important', 'urgent');


-- ==========================
-- KANBAN BOARDS
-- ==========================
CREATE TABLE public.kanban_boards (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Main Board',
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kanban_boards_dept ON public.kanban_boards (department_id);


-- ==========================
-- KANBAN COLUMNS
-- ==========================
CREATE TABLE public.kanban_columns (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id   uuid NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kanban_columns_board ON public.kanban_columns (board_id);


-- ==========================
-- KANBAN CARDS
-- ==========================
CREATE TABLE public.kanban_cards (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  column_id   uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date    date,
  priority    public.card_priority NOT NULL DEFAULT 'medium',
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kanban_cards_column     ON public.kanban_cards (column_id);
CREATE INDEX idx_kanban_cards_assigned   ON public.kanban_cards (assigned_to);
CREATE INDEX idx_kanban_cards_due_date   ON public.kanban_cards (due_date);

CREATE TRIGGER trg_kanban_cards_updated_at
  BEFORE UPDATE ON public.kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_kanban_cards
  AFTER INSERT OR UPDATE OR DELETE ON public.kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- ROOMS
-- ==========================
CREATE TABLE public.rooms (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      text NOT NULL,
  capacity  integer,
  location  text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_active ON public.rooms (is_active);


-- ==========================
-- ROOM BOOKINGS
-- ==========================
CREATE TABLE public.room_bookings (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id    uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  booked_by  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title      text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time   timestamptz NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_booking_time CHECK (end_time > start_time)
);

CREATE INDEX idx_room_bookings_room     ON public.room_bookings (room_id);
CREATE INDEX idx_room_bookings_bookedby ON public.room_bookings (booked_by);
CREATE INDEX idx_room_bookings_time     ON public.room_bookings (start_time, end_time);

CREATE TRIGGER trg_audit_room_bookings
  AFTER INSERT OR UPDATE OR DELETE ON public.room_bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- ANNOUNCEMENTS
-- ==========================
CREATE TABLE public.announcements (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         text NOT NULL,
  content       text NOT NULL,
  priority      public.announcement_priority NOT NULL DEFAULT 'normal',
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_dept      ON public.announcements (department_id);
CREATE INDEX idx_announcements_priority  ON public.announcements (priority);
CREATE INDEX idx_announcements_expires   ON public.announcements (expires_at);
CREATE INDEX idx_announcements_created   ON public.announcements (created_at DESC);

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_announcements
  AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- ENABLE RLS
-- ==========================
ALTER TABLE public.kanban_boards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_boards   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.room_bookings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_bookings   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.announcements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements   FORCE ROW LEVEL SECURITY;


-- ==========================
-- RLS — KANBAN BOARDS
-- ==========================
CREATE POLICY kanban_boards_select ON public.kanban_boards FOR SELECT USING (
  public.is_ops()
  OR department_id = public.get_my_department_id()
);
CREATE POLICY kanban_boards_insert ON public.kanban_boards FOR INSERT WITH CHECK (
  public.is_manager_or_above()
  AND (public.is_ops() OR department_id = public.get_my_department_id())
);
CREATE POLICY kanban_boards_delete ON public.kanban_boards FOR DELETE USING (public.is_ops());


-- ==========================
-- RLS — KANBAN COLUMNS
-- ==========================
CREATE POLICY kanban_columns_select ON public.kanban_columns FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);
CREATE POLICY kanban_columns_insert ON public.kanban_columns FOR INSERT WITH CHECK (
  public.is_manager_or_above()
  AND EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);
CREATE POLICY kanban_columns_delete ON public.kanban_columns FOR DELETE USING (
  public.is_manager_or_above()
  AND EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);


-- ==========================
-- RLS — KANBAN CARDS
-- ==========================
CREATE POLICY kanban_cards_select ON public.kanban_cards FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.kanban_columns col
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE col.id = column_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);
CREATE POLICY kanban_cards_insert ON public.kanban_cards FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kanban_columns col
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE col.id = column_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);
CREATE POLICY kanban_cards_update ON public.kanban_cards FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.kanban_columns col
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE col.id = column_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);
CREATE POLICY kanban_cards_delete ON public.kanban_cards FOR DELETE USING (
  public.is_ops()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.kanban_columns col
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE col.id = column_id
    AND public.is_manager_or_above()
    AND b.department_id = public.get_my_department_id()
  )
);


-- ==========================
-- RLS — ROOMS (all see active, OPS manages)
-- ==========================
CREATE POLICY rooms_select ON public.rooms FOR SELECT USING (is_active = true OR public.is_ops());
CREATE POLICY rooms_insert ON public.rooms FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY rooms_update ON public.rooms FOR UPDATE USING (public.is_ops());
CREATE POLICY rooms_delete ON public.rooms FOR DELETE USING (public.is_ops());


-- ==========================
-- RLS — ROOM BOOKINGS
-- ==========================
CREATE POLICY room_bookings_select ON public.room_bookings FOR SELECT USING (true);
CREATE POLICY room_bookings_insert ON public.room_bookings FOR INSERT WITH CHECK (
  booked_by = auth.uid()
);
CREATE POLICY room_bookings_delete ON public.room_bookings FOR DELETE USING (
  booked_by = auth.uid() OR public.is_ops()
);


-- ==========================
-- RLS — ANNOUNCEMENTS
-- ==========================
CREATE POLICY announcements_select ON public.announcements FOR SELECT USING (
  (expires_at IS NULL OR expires_at > now())
  AND (
    department_id IS NULL
    OR public.is_ops()
    OR department_id = public.get_my_department_id()
  )
);
CREATE POLICY announcements_insert ON public.announcements FOR INSERT WITH CHECK (
  public.is_manager_or_above()
  AND (public.is_ops() OR department_id = public.get_my_department_id() OR department_id IS NULL)
);
CREATE POLICY announcements_delete ON public.announcements FOR DELETE USING (
  public.is_ops() OR created_by = auth.uid()
);
