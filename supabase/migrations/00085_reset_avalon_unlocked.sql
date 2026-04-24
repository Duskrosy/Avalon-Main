-- Reset everyone's Avalon easter-egg unlock.
-- The `avalon_unlocked` flag lives inside the `profiles.user_preferences` jsonb
-- column. This migration removes the key entirely so every user starts locked
-- and must re-earn it via the Konami code + 7-click materia flow.

UPDATE profiles
SET user_preferences = user_preferences - 'avalon_unlocked'
WHERE user_preferences ? 'avalon_unlocked';

-- If any user currently has `theme = 'avalon'` in their preferences, also
-- bounce them back to light so the UI doesn't render the parchment palette
-- for a now-locked user.
UPDATE profiles
SET user_preferences = jsonb_set(user_preferences, '{theme}', '"light"')
WHERE user_preferences->>'theme' = 'avalon';
