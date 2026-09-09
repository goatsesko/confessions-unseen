-- Admin-only context lookup for reported direct messages (messages are RLS-scoped
-- to conversation members, so moderators need a definer function).
CREATE OR REPLACE FUNCTION public.admin_message_context(_id uuid)
RETURNS TABLE (id uuid, body text, image_url text, audio_url text, sender_username text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, m.body, m.image_url, m.audio_url, p.username, m.created_at
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.id = _id
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
$$;

REVOKE ALL ON FUNCTION public.admin_message_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_message_context(uuid) TO authenticated;

-- Admin-only hard delete of a reported direct message.
CREATE OR REPLACE FUNCTION public.admin_delete_message(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  DELETE FROM public.messages WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_message(uuid) TO authenticated;
