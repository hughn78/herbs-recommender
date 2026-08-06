-- Rewrite policies that depended on public.has_role so we can revoke API access to it.
DROP POLICY IF EXISTS "Admins manage ingestion jobs" ON public.ingestion_jobs;

CREATE POLICY "Admins manage ingestion jobs"
ON public.ingestion_jobs
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role
));

-- has_role is SECURITY DEFINER; it must not be directly callable through the Data API.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;