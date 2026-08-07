-- ============================================================
-- Phase 13 — privacy lockdown for patient review data
-- ============================================================
-- Reverses the 20260806033355 anonymous-access model for patient
-- cases. Patient reviews now require an authenticated staff session;
-- rows are owned by the reviewer and visible only to them (organisation
-- scoping can be layered on later via a shared org_id).
--
-- Reference data (products, safety_rules, medication_dictionary,
-- kb_chunks, lookup_indexes) remains publicly readable — it contains
-- no patient information.
--
-- NOTE: rows previously stored with user_id IS NULL become inaccessible
-- to API roles after this migration (service role retains full access).
-- The project this targets has zero case rows; on any project that has
-- legacy ownerless rows, export or reassign them BEFORE applying.
-- Idempotent: safe to re-run via the SQL editor.
-- ============================================================

-- 1. Revoke anonymous CRUD on patient-data tables
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.patient_cases FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.recommendations FROM anon;
REVOKE SELECT, INSERT ON public.sense_check_audits FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pharmacist_feedback FROM anon;

-- Grant least-privilege access to authenticated staff. Grants are explicit so
-- this migration works on projects where table privileges were not pre-seeded
-- by the hosting dashboard.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO authenticated;
GRANT SELECT, INSERT ON public.sense_check_audits TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.pharmacist_feedback TO authenticated;

-- Reference data remains non-patient and readable by both anonymous public
-- pages and signed-in staff. The authenticated policies are required for
-- server functions that use the staff-scoped Supabase client (notably
-- References search and evidence attachment).
GRANT SELECT ON public.safety_rules TO authenticated;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.medication_dictionary TO authenticated;
GRANT SELECT ON public.kb_chunks TO authenticated;
GRANT SELECT ON public.lookup_indexes TO authenticated;

-- 2. Drop the anonymous ownerless-row policies
DROP POLICY IF EXISTS "Anonymous manage ownerless cases" ON public.patient_cases;
DROP POLICY IF EXISTS "Authenticated read ownerless cases" ON public.patient_cases;
DROP POLICY IF EXISTS "Anonymous manage ownerless recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Authenticated read ownerless recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Anonymous insert ownerless audits" ON public.sense_check_audits;
DROP POLICY IF EXISTS "Anonymous read ownerless audits" ON public.sense_check_audits;
DROP POLICY IF EXISTS "Authenticated read ownerless audits" ON public.sense_check_audits;
DROP POLICY IF EXISTS "Anonymous manage ownerless feedback" ON public.pharmacist_feedback;
DROP POLICY IF EXISTS "Authenticated read ownerless feedback" ON public.pharmacist_feedback;

-- 3. Owner-scoped policies for authenticated staff
DROP POLICY IF EXISTS "Staff manage own cases" ON public.patient_cases;
CREATE POLICY "Staff manage own cases"
  ON public.patient_cases FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff manage own recommendations" ON public.recommendations;
CREATE POLICY "Staff manage own recommendations"
  ON public.recommendations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff manage own audits" ON public.sense_check_audits;
CREATE POLICY "Staff manage own audits"
  ON public.sense_check_audits FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff manage own feedback" ON public.pharmacist_feedback;
CREATE POLICY "Staff manage own feedback"
  ON public.pharmacist_feedback FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. Authenticated staff read policies for non-patient reference data
DROP POLICY IF EXISTS "Staff read safety rules" ON public.safety_rules;
CREATE POLICY "Staff read safety rules"
  ON public.safety_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff read products" ON public.products;
CREATE POLICY "Staff read products"
  ON public.products FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff read medication dictionary" ON public.medication_dictionary;
CREATE POLICY "Staff read medication dictionary"
  ON public.medication_dictionary FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff read kb chunks" ON public.kb_chunks;
CREATE POLICY "Staff read kb chunks"
  ON public.kb_chunks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff read lookup indexes" ON public.lookup_indexes;
CREATE POLICY "Staff read lookup indexes"
  ON public.lookup_indexes FOR SELECT TO authenticated USING (true);
