-- Backfill: first 5 accounts by join date become founders/admins
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 5) p
ON CONFLICT DO NOTHING;

-- Keep the rule going for future early signups
CREATE OR REPLACE FUNCTION public.enforce_profile_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE existing int; minlen int;
BEGIN
  NEW.username := lower(trim(NEW.username));
  IF NEW.username !~ '^[a-z0-9_]+$' OR length(NEW.username) > 20 THEN
    RAISE EXCEPTION 'Usernames may only use letters, numbers and underscores (max 20).';
  END IF;
  SELECT count(*) INTO existing FROM public.profiles;
  minlen := CASE WHEN existing < 5 THEN 2 ELSE 5 END;
  IF length(NEW.username) < minlen THEN
    RAISE EXCEPTION 'Username must be at least % characters.', minlen;
  END IF;
  IF existing < 5 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id,'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;