CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- helper: conversation membership (moved out of exposed public schema)
CREATE OR REPLACE FUNCTION private.is_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = _conversation_id AND user_id = _user_id
    )
  END;
$$;

CREATE OR REPLACE FUNCTION private.is_blocked_pair(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

-- true when the user is blocked by / blocking anyone else already in the conversation
CREATE OR REPLACE FUNCTION private.blocked_in_conversation(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    JOIN public.blocks b
      ON (b.blocker_id = cm.user_id AND b.blocked_id = _user_id)
      OR (b.blocker_id = _user_id AND b.blocked_id = cm.user_id)
    WHERE cm.conversation_id = _conversation_id
      AND cm.user_id <> _user_id
  );
$$;

CREATE OR REPLACE FUNCTION private.can_notify(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _actor IS NOT NULL
     AND _target IS NOT NULL
     AND _actor <> _target
     AND NOT private.is_blocked_pair(_actor, _target)
     AND (
       EXISTS (SELECT 1 FROM public.follows f
                WHERE (f.follower_id = _actor AND f.following_id = _target)
                   OR (f.follower_id = _target AND f.following_id = _actor))
       OR EXISTS (SELECT 1 FROM public.conversation_members a
                  JOIN public.conversation_members b ON a.conversation_id = b.conversation_id
                  WHERE a.user_id = _actor AND b.user_id = _target)
       OR EXISTS (SELECT 1 FROM public.comment_likes cl
                  JOIN public.comments c ON c.id = cl.comment_id
                  WHERE cl.user_id = _actor AND c.user_id = _target)
       OR EXISTS (SELECT 1 FROM public.comment_votes cv
                  JOIN public.comments c ON c.id = cv.comment_id
                  WHERE cv.user_id = _actor AND c.user_id = _target)
       OR EXISTS (SELECT 1 FROM public.comments child
                  JOIN public.comments parent ON parent.id = child.parent_id
                  WHERE child.user_id = _actor AND parent.user_id = _target)
       OR EXISTS (SELECT 1 FROM public.comments c1
                  JOIN public.comments c2 ON c1.confession_id = c2.confession_id
                  WHERE c1.user_id = _actor AND c2.user_id = _target)
     );
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_blocked_pair(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.blocked_in_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_notify(uuid, uuid) TO authenticated;

-- rewrite policies to use private helpers
DROP POLICY IF EXISTS "add members" ON public.conversation_members;
DROP POLICY IF EXISTS "read own memberships and peers" ON public.conversation_members;
CREATE POLICY "add members" ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR private.is_conversation_member(conversation_id, auth.uid()))
    AND NOT private.blocked_in_conversation(conversation_id, user_id)
  );
CREATE POLICY "read own memberships and peers" ON public.conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "members read conversations" ON public.conversations;
DROP POLICY IF EXISTS "members touch conversation" ON public.conversations;
CREATE POLICY "members read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (private.is_conversation_member(id, auth.uid()));
CREATE POLICY "members touch conversation" ON public.conversations FOR UPDATE TO authenticated
  USING (private.is_conversation_member(id, auth.uid()))
  WITH CHECK (private.is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS "members read messages" ON public.messages;
DROP POLICY IF EXISTS "members send messages" ON public.messages;
DROP POLICY IF EXISTS "recipients mark read" ON public.messages;
CREATE POLICY "members read messages" ON public.messages FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND private.is_conversation_member(conversation_id, auth.uid())
    AND NOT private.blocked_in_conversation(conversation_id, auth.uid())
  );
CREATE POLICY "recipients mark read" ON public.messages FOR UPDATE TO authenticated
  USING (private.is_conversation_member(conversation_id, auth.uid()))
  WITH CHECK (private.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "members react" ON public.message_reactions;
DROP POLICY IF EXISTS "members read message reactions" ON public.message_reactions;
CREATE POLICY "members react" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND private.is_conversation_member(conversation_id, auth.uid())
    AND NOT private.blocked_in_conversation(conversation_id, auth.uid())
  );
CREATE POLICY "members read message reactions" ON public.message_reactions FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id, auth.uid()));

-- notifications: require a legitimate interaction context
DROP POLICY IF EXISTS "actors create notifications" ON public.notifications;
CREATE POLICY "actors create notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND actor_id IS DISTINCT FROM user_id
    AND private.can_notify(actor_id, user_id)
  );

DROP FUNCTION IF EXISTS public.is_conversation_member(uuid, uuid);