-- Account-level security flags managed by OPS/managers
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_mfa           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_password_change boolean NOT NULL DEFAULT true;
