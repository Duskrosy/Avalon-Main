-- Migration 00045: Announcement Reactions + Notifications Type Default
-- ===========================================================================

-- 1. Fix notifications.type to have a default so inserts without type don't fail
ALTER TABLE public.notifications ALTER COLUMN type SET DEFAULT 'general';

-- 2. Announcement reactions table
CREATE TABLE public.announcement_reactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id, emoji)
);

CREATE INDEX idx_announcement_reactions_ann ON public.announcement_reactions (announcement_id);
CREATE INDEX idx_announcement_reactions_user ON public.announcement_reactions (user_id);

-- RLS
ALTER TABLE public.announcement_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reactions FORCE ROW LEVEL SECURITY;

-- Everyone can see reactions
CREATE POLICY announcement_reactions_select ON public.announcement_reactions
  FOR SELECT USING (true);

-- Users can insert their own reactions
CREATE POLICY announcement_reactions_insert ON public.announcement_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can delete their own reactions
CREATE POLICY announcement_reactions_delete ON public.announcement_reactions
  FOR DELETE USING (user_id = auth.uid());
