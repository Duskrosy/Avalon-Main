-- Extend content_type enum with new taxonomy values
ALTER TYPE public.content_type ADD VALUE IF NOT EXISTS 'ads';
ALTER TYPE public.content_type ADD VALUE IF NOT EXISTS 'offline_other';

-- Create creative_item_type enum for the creative format field
DO $$ BEGIN
  CREATE TYPE public.creative_item_type AS ENUM ('video', 'stills', 'asset');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add creative_type column to creative_content_items (nullable — existing rows default NULL)
ALTER TABLE public.creative_content_items
  ADD COLUMN IF NOT EXISTS creative_type public.creative_item_type;
