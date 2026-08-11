-- Admin-only guard usable from RLS policies (has_role EXECUTE is restricted).
CREATE OR REPLACE FUNCTION public.is_catalogue_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
  )
$$;

REVOKE ALL ON FUNCTION public.is_catalogue_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_catalogue_admin() TO authenticated, service_role;

-- Review-status transitions: admins only.
DROP POLICY IF EXISTS "Staff review catalogue products" ON public.catalogue_products;
CREATE POLICY "Admins review catalogue products" ON public.catalogue_products
  FOR UPDATE TO authenticated
  USING (public.is_catalogue_admin())
  WITH CHECK (public.is_catalogue_admin() AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff review indications" ON public.product_indications;
CREATE POLICY "Admins review indications" ON public.product_indications
  FOR UPDATE TO authenticated
  USING (public.is_catalogue_admin())
  WITH CHECK (public.is_catalogue_admin() AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff review warnings" ON public.product_warnings;
CREATE POLICY "Admins review warnings" ON public.product_warnings
  FOR UPDATE TO authenticated
  USING (public.is_catalogue_admin())
  WITH CHECK (public.is_catalogue_admin() AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff review images" ON public.product_images;
CREATE POLICY "Admins review images" ON public.product_images
  FOR UPDATE TO authenticated
  USING (public.is_catalogue_admin())
  WITH CHECK (public.is_catalogue_admin() AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff review claims" ON public.source_claims;
CREATE POLICY "Admins review claims" ON public.source_claims
  FOR UPDATE TO authenticated
  USING (public.is_catalogue_admin())
  WITH CHECK (public.is_catalogue_admin() AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff approve ontology synonyms" ON public.ontology_synonyms;
CREATE POLICY "Admins approve ontology synonyms" ON public.ontology_synonyms
  FOR UPDATE TO authenticated
  USING (public.is_catalogue_admin())
  WITH CHECK (public.is_catalogue_admin());

DROP POLICY IF EXISTS "Staff triage data quality issues" ON public.data_quality_issues;
CREATE POLICY "Admins triage data quality issues" ON public.data_quality_issues
  FOR UPDATE TO authenticated
  USING (public.is_catalogue_admin())
  WITH CHECK (public.is_catalogue_admin() AND status IN ('open','in_review','resolved','wontfix'));

-- Audit trail writes: admins only.
DROP POLICY IF EXISTS "Staff insert review actions" ON public.catalogue_review_actions;
DROP POLICY IF EXISTS "Staff record review actions" ON public.catalogue_review_actions;
DROP POLICY IF EXISTS "Admins record review actions" ON public.catalogue_review_actions;
CREATE POLICY "Admins record review actions" ON public.catalogue_review_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_catalogue_admin() AND reviewer = auth.uid());