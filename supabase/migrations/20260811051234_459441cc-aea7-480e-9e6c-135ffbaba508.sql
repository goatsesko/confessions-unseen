-- 1) Trigger-only SECURITY DEFINER functions should not be callable by API roles
REVOKE EXECUTE ON FUNCTION public.touch_conversation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM anon;

-- 2) comment_likes / comment_votes: authenticated only
DROP POLICY IF EXISTS "comment likes are public" ON public.comment_likes;
CREATE POLICY "authenticated can read comment likes" ON public.comment_likes
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.comment_likes FROM anon;

DROP POLICY IF EXISTS "comment votes are public" ON public.comment_votes;
CREATE POLICY "authenticated can read comment votes" ON public.comment_votes
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.comment_votes FROM anon;

-- 3) community_members: authenticated only
DROP POLICY IF EXISTS "memberships are public" ON public.community_members;
CREATE POLICY "authenticated can read memberships" ON public.community_members
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.community_members FROM anon;

-- 4) follows: authenticated only
DROP POLICY IF EXISTS "follows are public" ON public.follows;
CREATE POLICY "authenticated can read follows" ON public.follows
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.follows FROM anon;

-- 5) notifications: only the actor can create them
DROP POLICY IF EXISTS "create notifications" ON public.notifications;
CREATE POLICY "actors create notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id AND actor_id IS DISTINCT FROM user_id);

-- 6) reports: require authentication and true reporter identity
DROP POLICY IF EXISTS "anyone can report" ON public.reports;
CREATE POLICY "authenticated can report" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND length(reason) <= 2000);
REVOKE INSERT ON public.reports FROM anon;