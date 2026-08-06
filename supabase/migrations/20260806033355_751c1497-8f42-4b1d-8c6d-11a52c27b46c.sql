-- 1. Make ownership optional so anonymous reviews can be stored
ALTER TABLE public.patient_cases ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.recommendations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.sense_check_audits ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.pharmacist_feedback ALTER COLUMN user_id DROP NOT NULL;

-- 2. Grants for anonymous access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_cases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO anon;
GRANT SELECT, INSERT ON public.sense_check_audits TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacist_feedback TO anon;
GRANT SELECT ON public.safety_rules TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.medication_dictionary TO anon;
GRANT SELECT ON public.kb_chunks TO anon;
GRANT SELECT ON public.lookup_indexes TO anon;

-- 3. Anonymous (shared) case data policies: rows with no owner
CREATE POLICY "Anonymous manage ownerless cases"
  ON public.patient_cases FOR ALL TO anon
  USING (user_id IS NULL) WITH CHECK (user_id IS NULL);

CREATE POLICY "Authenticated read ownerless cases"
  ON public.patient_cases FOR SELECT TO authenticated
  USING (user_id IS NULL);

CREATE POLICY "Anonymous manage ownerless recommendations"
  ON public.recommendations FOR ALL TO anon
  USING (user_id IS NULL) WITH CHECK (user_id IS NULL);

CREATE POLICY "Authenticated read ownerless recommendations"
  ON public.recommendations FOR SELECT TO authenticated
  USING (user_id IS NULL);

CREATE POLICY "Anonymous insert ownerless audits"
  ON public.sense_check_audits FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Anonymous read ownerless audits"
  ON public.sense_check_audits FOR SELECT TO anon
  USING (user_id IS NULL);

CREATE POLICY "Authenticated read ownerless audits"
  ON public.sense_check_audits FOR SELECT TO authenticated
  USING (user_id IS NULL);

CREATE POLICY "Anonymous manage ownerless feedback"
  ON public.pharmacist_feedback FOR ALL TO anon
  USING (user_id IS NULL) WITH CHECK (user_id IS NULL);

CREATE POLICY "Authenticated read ownerless feedback"
  ON public.pharmacist_feedback FOR SELECT TO authenticated
  USING (user_id IS NULL);

-- 4. Public reference data reads
CREATE POLICY "Anyone can read safety rules"
  ON public.safety_rules FOR SELECT TO anon USING (true);

CREATE POLICY "Anyone can read products"
  ON public.products FOR SELECT TO anon USING (true);

CREATE POLICY "Anyone can read medication dictionary"
  ON public.medication_dictionary FOR SELECT TO anon USING (true);

CREATE POLICY "Anyone can read kb_chunks"
  ON public.kb_chunks FOR SELECT TO anon USING (true);

CREATE POLICY "Anyone can read lookup_indexes"
  ON public.lookup_indexes FOR SELECT TO anon USING (true);