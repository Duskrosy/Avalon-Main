-- ============================================================
-- 00040_custom_fields.sql
-- Avalon — Custom Fields System for Kanban
-- Field definitions, field values, updated RLS, realtime
-- ============================================================


-- ==========================
-- CUSTOM FIELD TYPE ENUM
-- ==========================
CREATE TYPE public.custom_field_type AS ENUM (
  'text',        -- Single line text
  'textarea',    -- Multi-line text
  'number',      -- Numeric value
  'date',        -- Date picker
  'dropdown',    -- Single select from options
  'multi_select',-- Multiple select from options
  'checkbox',    -- Boolean
  'person',      -- Reference to profiles
  'url',         -- URL with validation
  'email'        -- Email with validation
);


-- ==========================
-- FIELD DEFINITIONS (per board)
-- ==========================
CREATE TABLE public.kanban_field_definitions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id      uuid NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  name          text NOT NULL,
  field_type    public.custom_field_type NOT NULL,
  description   text,
  is_required   boolean NOT NULL DEFAULT false,
  options       jsonb,  -- For dropdown/multi_select: [{id, label, color}]
  default_value jsonb,  -- Default value for new cards
  sort_order    integer NOT NULL DEFAULT 0,
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_field_name_per_board UNIQUE (board_id, name)
);

CREATE INDEX idx_field_defs_board ON public.kanban_field_definitions (board_id);


-- ==========================
-- FIELD VALUES (per card)
-- ==========================
CREATE TABLE public.kanban_card_field_values (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id               uuid NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  field_definition_id   uuid NOT NULL REFERENCES public.kanban_field_definitions(id) ON DELETE CASCADE,
  value_text            text,
  value_number          numeric,
  value_date            date,
  value_boolean         boolean,
  value_json            jsonb,  -- For multi_select, person arrays, dropdown
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_field_per_card UNIQUE (card_id, field_definition_id)
);

CREATE INDEX idx_field_values_card ON public.kanban_card_field_values (card_id);
CREATE INDEX idx_field_values_def ON public.kanban_card_field_values (field_definition_id);

CREATE TRIGGER trg_field_values_updated_at
  BEFORE UPDATE ON public.kanban_card_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================
-- ADD completed_at TO CARDS
-- ==========================
ALTER TABLE public.kanban_cards ADD COLUMN IF NOT EXISTS completed_at timestamptz;


-- ==========================
-- ENABLE RLS
-- ==========================
ALTER TABLE public.kanban_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_field_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_field_values FORCE ROW LEVEL SECURITY;


-- ==========================
-- RLS — FIELD DEFINITIONS
-- ==========================
-- Select: same access as boards
CREATE POLICY field_defs_select ON public.kanban_field_definitions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);

-- Insert: managers+ in their department
CREATE POLICY field_defs_insert ON public.kanban_field_definitions FOR INSERT WITH CHECK (
  public.is_manager_or_above()
  AND EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);

-- Update: managers+ in their department
CREATE POLICY field_defs_update ON public.kanban_field_definitions FOR UPDATE USING (
  public.is_manager_or_above()
  AND EXISTS (
    SELECT 1 FROM public.kanban_boards b WHERE b.id = board_id
    AND (public.is_ops() OR b.department_id = public.get_my_department_id())
  )
);

-- Delete: OPS only (destructive — cascades to all values)
CREATE POLICY field_defs_delete ON public.kanban_field_definitions FOR DELETE USING (
  public.is_ops()
);


-- ==========================
-- RLS — FIELD VALUES
-- Follows card visibility: own dept OR assignee OR OPS
-- ==========================
CREATE POLICY field_values_select ON public.kanban_card_field_values FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.kanban_cards c
    JOIN public.kanban_columns col ON col.id = c.column_id
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE c.id = card_id
    AND (
      public.is_ops()
      OR b.department_id = public.get_my_department_id()
      OR c.assigned_to = auth.uid()
    )
  )
);

CREATE POLICY field_values_insert ON public.kanban_card_field_values FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kanban_cards c
    JOIN public.kanban_columns col ON col.id = c.column_id
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE c.id = card_id
    AND (
      public.is_ops()
      OR b.department_id = public.get_my_department_id()
      OR c.assigned_to = auth.uid()
    )
  )
);

CREATE POLICY field_values_update ON public.kanban_card_field_values FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.kanban_cards c
    JOIN public.kanban_columns col ON col.id = c.column_id
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE c.id = card_id
    AND (
      public.is_ops()
      OR b.department_id = public.get_my_department_id()
      OR c.assigned_to = auth.uid()
    )
  )
);

CREATE POLICY field_values_delete ON public.kanban_card_field_values FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.kanban_cards c
    JOIN public.kanban_columns col ON col.id = c.column_id
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE c.id = card_id
    AND (
      public.is_ops()
      OR b.department_id = public.get_my_department_id()
      OR c.assigned_to = auth.uid()
    )
  )
);


-- ==========================
-- UPDATE CARD RLS — add assignee visibility
-- ==========================
-- Drop existing policies
DROP POLICY IF EXISTS kanban_cards_select ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_insert ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_update ON public.kanban_cards;

-- Recreate with assignee visibility
CREATE POLICY kanban_cards_select ON public.kanban_cards FOR SELECT USING (
  public.is_ops()
  OR assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.kanban_columns col
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE col.id = column_id
    AND b.department_id = public.get_my_department_id()
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
  public.is_ops()
  OR assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.kanban_columns col
    JOIN public.kanban_boards b ON b.id = col.board_id
    WHERE col.id = column_id
    AND b.department_id = public.get_my_department_id()
  )
);


-- ==========================
-- REQUIRED FIELD ENFORCEMENT
-- ==========================
CREATE OR REPLACE FUNCTION public.enforce_required_fields()
RETURNS TRIGGER AS $$
DECLARE
  missing_field text;
BEGIN
  -- Check for missing required fields after a short delay to allow field values to be inserted
  -- This is called AFTER insert/update, so field values should exist if provided in same transaction
  SELECT fd.name INTO missing_field
  FROM public.kanban_field_definitions fd
  JOIN public.kanban_columns col ON col.board_id = fd.board_id
  WHERE col.id = NEW.column_id
    AND fd.is_required = true
    AND NOT EXISTS (
      SELECT 1 FROM public.kanban_card_field_values fv
      WHERE fv.card_id = NEW.id
        AND fv.field_definition_id = fd.id
        AND (fv.value_text IS NOT NULL OR fv.value_number IS NOT NULL
             OR fv.value_date IS NOT NULL OR fv.value_boolean IS NOT NULL
             OR fv.value_json IS NOT NULL)
    )
  LIMIT 1;

  IF missing_field IS NOT NULL THEN
    RAISE EXCEPTION 'Required field "%" must have a value', missing_field;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Trigger is created as CONSTRAINT trigger with DEFERRABLE
-- This allows field values to be inserted in the same transaction before check runs
CREATE CONSTRAINT TRIGGER check_required_fields
  AFTER INSERT OR UPDATE ON public.kanban_cards
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_required_fields();


-- ==========================
-- ENABLE REALTIME
-- ==========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_card_field_values;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_columns;
