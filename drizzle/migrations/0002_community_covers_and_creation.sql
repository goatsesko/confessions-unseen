ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.communities SET category = CASE slug
  WHEN 'campus' THEN 'Campus'
  WHEN 'secrets' THEN 'Confessions'
  WHEN 'family' THEN 'Family'
  WHEN 'funny' THEN 'Funny'
  WHEN 'marriage' THEN 'Relationships'
  WHEN 'mental-health' THEN 'Lifestyle'
  WHEN 'relationships' THEN 'Relationships'
  WHEN 'story-time' THEN 'Confessions'
  WHEN 'work' THEN 'Work'
  ELSE 'General' END
WHERE category = 'General';

DROP POLICY IF EXISTS "Authenticated users can create communities" ON public.communities;
CREATE POLICY "Authenticated users can create communities"
ON public.communities FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Creators can update their community" ON public.communities;
CREATE POLICY "Creators can update their community"
ON public.communities FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

GRANT INSERT, UPDATE ON public.communities TO authenticated;

DROP POLICY IF EXISTS "Community media readable" ON storage.objects;
CREATE POLICY "Community media readable"
ON storage.objects FOR SELECT TO authenticated, anon
USING (bucket_id = 'community-media');

DROP POLICY IF EXISTS "Authenticated can upload community media" ON storage.objects;
CREATE POLICY "Authenticated can upload community media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'community-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "Owners can update community media" ON storage.objects;
CREATE POLICY "Owners can update community media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'community-media' AND owner = auth.uid())
WITH CHECK (bucket_id = 'community-media' AND owner = auth.uid());