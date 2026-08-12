-- 1. roles ------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 2. username rules + founder admins ----------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.enforce_profile_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_enforce_rules ON public.profiles;
CREATE TRIGGER profiles_enforce_rules BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_rules();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (username);

-- 3. bans --------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz;

CREATE OR REPLACE FUNCTION private.is_restricted(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND (banned OR (suspended_until IS NOT NULL AND suspended_until > now()))
  )
$$;

DROP POLICY IF EXISTS "members can comment" ON public.comments;
CREATE POLICY "members can comment" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT private.is_restricted(auth.uid()) AND length(body) BETWEEN 1 AND 3000);

DROP POLICY IF EXISTS "admins moderate comments" ON public.comments;
CREATE POLICY "admins moderate comments" ON public.comments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins moderate profiles" ON public.profiles;
CREATE POLICY "admins moderate profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. reposts -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confession_id uuid NOT NULL REFERENCES public.confessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (confession_id, user_id)
);
GRANT SELECT ON public.reposts TO anon;
GRANT SELECT, INSERT, DELETE ON public.reposts TO authenticated;
GRANT ALL ON public.reposts TO service_role;
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reposts are public" ON public.reposts;
CREATE POLICY "reposts are public" ON public.reposts FOR SELECT USING (true);
DROP POLICY IF EXISTS "repost a confession" ON public.reposts;
CREATE POLICY "repost a confession" ON public.reposts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT private.is_restricted(auth.uid()));
DROP POLICY IF EXISTS "undo repost" ON public.reposts;
CREATE POLICY "undo repost" ON public.reposts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. confession moderation ---------------------------------------------------
ALTER TABLE public.confessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

DROP POLICY IF EXISTS "confessions are public" ON public.confessions;
CREATE POLICY "confessions are public" ON public.confessions FOR SELECT
  USING (status = 'published');
DROP POLICY IF EXISTS "admins read all confessions" ON public.confessions;
CREATE POLICY "admins read all confessions" ON public.confessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admins moderate confessions" ON public.confessions;
CREATE POLICY "admins moderate confessions" ON public.confessions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admins delete confessions" ON public.confessions;
CREATE POLICY "admins delete confessions" ON public.confessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- duplicate / spam guard
CREATE OR REPLACE FUNCTION public.guard_confession_spam()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(NEW.body) < 3 OR length(NEW.body) > 5000 THEN
    RAISE EXCEPTION 'Confessions must be between 3 and 5000 characters.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.confessions
    WHERE body = NEW.body AND created_at > now() - interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'That confession was already posted moments ago.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_confession_spam() FROM PUBLIC;
DROP TRIGGER IF EXISTS confessions_guard_spam ON public.confessions;
CREATE TRIGGER confessions_guard_spam BEFORE INSERT ON public.confessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_confession_spam();

-- view counter
CREATE OR REPLACE FUNCTION public.bump_confession_views(_number bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.confessions SET views = views + 1 WHERE number = _number AND status = 'published';
$$;
REVOKE ALL ON FUNCTION public.bump_confession_views(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_confession_views(bigint) TO anon, authenticated, service_role;

-- 6. reports queue -----------------------------------------------------------
DROP POLICY IF EXISTS "admins read reports" ON public.reports;
CREATE POLICY "admins read reports" ON public.reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admins resolve reports" ON public.reports;
CREATE POLICY "admins resolve reports" ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT UPDATE ON public.reports TO authenticated;

-- 7. indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS confessions_created_idx ON public.confessions (created_at DESC);
CREATE INDEX IF NOT EXISTS confessions_community_idx ON public.confessions (community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS confessions_parent_idx ON public.confessions (parent_number);
CREATE INDEX IF NOT EXISTS comments_confession_idx ON public.comments (confession_id, created_at);
CREATE INDEX IF NOT EXISTS reactions_confession_idx ON public.confession_reactions (confession_id);
CREATE INDEX IF NOT EXISTS reposts_user_idx ON public.reposts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);