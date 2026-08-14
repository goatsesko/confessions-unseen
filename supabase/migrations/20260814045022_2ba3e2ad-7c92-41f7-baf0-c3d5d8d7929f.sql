CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_username text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_label text,
  prev_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read audit logs"
ON public.admin_audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Staff can append audit logs"
ON public.admin_audit_logs FOR INSERT TO authenticated
WITH CHECK (
  admin_id = auth.uid()
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
);

CREATE INDEX admin_audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);
CREATE INDEX admin_audit_logs_admin_idx ON public.admin_audit_logs (admin_id);
CREATE INDEX admin_audit_logs_action_idx ON public.admin_audit_logs (action);
CREATE INDEX admin_audit_logs_target_idx ON public.admin_audit_logs (target_type, target_id);