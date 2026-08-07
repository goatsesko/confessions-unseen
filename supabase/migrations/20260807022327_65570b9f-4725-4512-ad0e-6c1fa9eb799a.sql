-- profiles: 18+ confirmation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz;

-- messages: voice notes + replies
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- conversation members: message requests
ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS accepted boolean NOT NULL DEFAULT true;

-- FOLLOWS
CREATE TABLE public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT ON public.follows TO anon;
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows are public" ON public.follows FOR SELECT USING (true);
CREATE POLICY "follow someone" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "unfollow someone" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id OR auth.uid() = user_id);
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- COMMENT VOTES (helpful / funny)
CREATE TABLE public.comment_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('helpful','funny')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id, kind)
);
GRANT SELECT ON public.comment_votes TO anon;
GRANT SELECT, INSERT, DELETE ON public.comment_votes TO authenticated;
GRANT ALL ON public.comment_votes TO service_role;
ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comment votes are public" ON public.comment_votes FOR SELECT USING (true);
CREATE POLICY "vote on comment" ON public.comment_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unvote comment" ON public.comment_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- MESSAGE REACTIONS
CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read message reactions" ON public.message_reactions FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "members react" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "members unreact" ON public.message_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- BLOCKS
CREATE TABLE public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read blocks involving me" ON public.blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);
CREATE POLICY "block someone" ON public.blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "unblock someone" ON public.blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- REPORTS
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('confession','comment','message','user')),
  target_id text NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.reports TO anon;
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can report" ON public.reports FOR INSERT WITH CHECK (true);
CREATE POLICY "read own reports" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;