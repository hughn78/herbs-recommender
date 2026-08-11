DROP POLICY IF EXISTS "Admins review catalogue products" ON public.catalogue_products;
CREATE POLICY "Admins review catalogue products" ON public.catalogue_products
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins review indications" ON public.product_indications;
CREATE POLICY "Admins review indications" ON public.product_indications
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins review warnings" ON public.product_warnings;
CREATE POLICY "Admins review warnings" ON public.product_warnings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins review images" ON public.product_images;
CREATE POLICY "Admins review images" ON public.product_images
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins review claims" ON public.source_claims;
CREATE POLICY "Admins review claims" ON public.source_claims
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins approve ontology synonyms" ON public.ontology_synonyms;
CREATE POLICY "Admins approve ontology synonyms" ON public.ontology_synonyms
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins triage data quality issues" ON public.data_quality_issues;
CREATE POLICY "Admins triage data quality issues" ON public.data_quality_issues
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    AND status IN ('open','in_review','resolved','wontfix'));

DROP POLICY IF EXISTS "Admins record review actions" ON public.catalogue_review_actions;
CREATE POLICY "Admins record review actions" ON public.catalogue_review_actions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    AND reviewer = auth.uid());

DROP FUNCTION IF EXISTS public.is_catalogue_admin();