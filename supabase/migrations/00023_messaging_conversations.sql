-- Add messaging_conversations column to meta_ad_stats
-- Stores onsite_conversion.messaging_conversation_started_7d count per ad per day
ALTER TABLE meta_ad_stats
  ADD COLUMN IF NOT EXISTS messaging_conversations int4 DEFAULT 0;
