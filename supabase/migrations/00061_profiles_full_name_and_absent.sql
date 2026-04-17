-- Add full_name as a computed column (first_name || ' ' || last_name)
-- Fixes "column profiles_1.full_name does not exist" crash on /people/leaves
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text
  GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;

-- Add absent to the leave_request_type enum
ALTER TYPE public.leave_request_type ADD VALUE IF NOT EXISTS 'absent';
