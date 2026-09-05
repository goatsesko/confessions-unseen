ALTER TABLE public.confessions ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS confessions_author_id_idx ON public.confessions(author_id);
DROP POLICY IF EXISTS "anyone can confess" ON public.confessions;
CREATE POLICY "anyone can confess" ON public.confessions FOR INSERT TO public
  WITH CHECK (author_id IS NULL OR author_id = auth.uid());