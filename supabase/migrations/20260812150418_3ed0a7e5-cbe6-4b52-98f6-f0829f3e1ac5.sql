REVOKE ALL ON FUNCTION public.enforce_profile_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_confession_spam() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bump_confession_views(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_confession_views(bigint) TO anon, authenticated;