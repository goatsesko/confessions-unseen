CREATE TABLE public.notification_prefs (
  user_id uuid PRIMARY KEY,
  kinds text[] NOT NULL DEFAULT ARRAY['reply','mention','like','follow','message','community'],
  quiet_enabled boolean NOT NULL DEFAULT false,
  quiet_start smallint NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end smallint NOT NULL DEFAULT 7 CHECK (quiet_end BETWEEN 0 AND 23),
  tz_offset_min smallint NOT NULL DEFAULT 180,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs select" ON public.notification_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own prefs insert" ON public.notification_prefs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own prefs update" ON public.notification_prefs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());