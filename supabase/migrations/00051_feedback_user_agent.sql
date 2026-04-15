-- Add user_agent to feedback for device/browser context
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS user_agent text;
