-- ─── Birthday Cards & Messages ────────────────────────────────────────────────
-- One card per person per year; multiple teammates can leave signed messages
-- (with optional GIF). Card expires 7 days after the birthday.

CREATE TABLE public.birthday_cards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, year)
);

CREATE TABLE public.birthday_messages (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id   uuid NOT NULL REFERENCES public.birthday_cards(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message   text NOT NULL CHECK (char_length(message) <= 280),
  gif_url   text,
  emoji     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, author_id)
);

CREATE INDEX idx_birthday_cards_person ON public.birthday_cards (person_id, year);
CREATE INDEX idx_birthday_messages_card ON public.birthday_messages (card_id);

ALTER TABLE public.birthday_cards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.birthday_cards    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.birthday_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.birthday_messages FORCE ROW LEVEL SECURITY;

-- All authenticated users can read cards and messages
CREATE POLICY "authenticated read birthday_cards"
  ON public.birthday_cards FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated read birthday_messages"
  ON public.birthday_messages FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (API) inserts cards (done by cron)
-- Users can insert / update / delete their own message
CREATE POLICY "users manage own birthday_messages"
  ON public.birthday_messages FOR ALL
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Service role bypasses RLS — no extra policy needed
