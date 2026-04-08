-- Add reactions JSONB to birthday_messages
-- Structure: { "❤️": ["userId1", "userId2"], "🎉": ["userId3"] }
ALTER TABLE public.birthday_messages
  ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}';
