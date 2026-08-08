-- ============================================================
-- Phase 14 — clinical content governance workflow
--
-- The governed catalogue migration (20260807100000) made catalogue content
-- writable only via the service role (ingestion). Governance reviewers need
-- exactly one write capability: transitioning review_status / approval flags
-- and recording reviewer notes. This migration grants that least-privilege
-- capability to authenticated staff:
--
--   * column-level UPDATE grants on review_status / reviewer_notes /
--     approved / data_quality_issues.status only — no other column can be
--     edited through the API;
--   * UPDATE policies restricted to the same intent;
--   * catalogue_review_actions (already insertable by staff) remains the
--     audit trail: who changed what, previous → new value, reason, when.
--
-- Idempotent: safe to re-run via the Supabase SQL editor.
-- ============================================================

-- Review-status transitions on the main governed entities.
GRANT UPDATE (review_status, reviewer_notes) ON public.catalogue_products TO authenticated;
GRANT UPDATE (review_status) ON public.product_indications TO authenticated;
GRANT UPDATE (review_status) ON public.product_warnings TO authenticated;
GRANT UPDATE (review_status) ON public.product_images TO authenticated;
GRANT UPDATE (review_status, reviewer_notes) ON public.source_claims TO authenticated;
-- Auto-proposed ontology synonyms become authoritative only on approval.
GRANT UPDATE (approved) ON public.ontology_synonyms TO authenticated;
-- Data-quality issue triage (open → resolved / wontfix).
GRANT UPDATE (status) ON public.data_quality_issues TO authenticated;

DROP POLICY IF EXISTS "Staff review catalogue products" ON public.catalogue_products;
CREATE POLICY "Staff review catalogue products" ON public.catalogue_products
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff review indications" ON public.product_indications;
CREATE POLICY "Staff review indications" ON public.product_indications
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff review warnings" ON public.product_warnings;
CREATE POLICY "Staff review warnings" ON public.product_warnings
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff review images" ON public.product_images;
CREATE POLICY "Staff review images" ON public.product_images
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff review claims" ON public.source_claims;
CREATE POLICY "Staff review claims" ON public.source_claims
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Staff approve ontology synonyms" ON public.ontology_synonyms;
CREATE POLICY "Staff approve ontology synonyms" ON public.ontology_synonyms
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (approved IN (true, false));

DROP POLICY IF EXISTS "Staff triage data quality issues" ON public.data_quality_issues;
CREATE POLICY "Staff triage data quality issues" ON public.data_quality_issues
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (status IN ('open','in_review','resolved','wontfix'));
