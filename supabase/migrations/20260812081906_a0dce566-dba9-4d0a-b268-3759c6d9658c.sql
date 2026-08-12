CREATE TABLE IF NOT EXISTS public.med_source_documents (
  document_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code      text NOT NULL,
  title            text NOT NULL,
  corpus_path      text,
  sha256           text NOT NULL,
  file_count       integer,
  scrape_date      timestamptz,
  source_version   text,
  ingested_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_code, sha256)
);
CREATE INDEX IF NOT EXISTS med_source_docs_code_idx ON public.med_source_documents (source_code);

CREATE TABLE IF NOT EXISTS public.med_ingestion_runs (
  run_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code      text NOT NULL,
  document_id      uuid REFERENCES public.med_source_documents(document_id) ON DELETE SET NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  files_processed  integer NOT NULL DEFAULT 0,
  files_skipped    integer NOT NULL DEFAULT 0,
  files_failed     integer NOT NULL DEFAULT 0,
  new_concepts     integer NOT NULL DEFAULT 0,
  updated_concepts integer NOT NULL DEFAULT 0,
  new_assertions   integer NOT NULL DEFAULT 0,
  changed_assertions integer NOT NULL DEFAULT 0,
  conflicts_found  integer NOT NULL DEFAULT 0,
  error_summary    text,
  report_json      jsonb
);

CREATE TABLE IF NOT EXISTS public.medication_concepts (
  concept_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name   text NOT NULL,
  name_normalised  text NOT NULL,
  atc_code         text,
  description      text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','discontinued','unknown')),
  review_status    text NOT NULL DEFAULT 'extracted' CHECK (review_status IN ('extracted','needs_review','approved','rejected','superseded')),
  reviewer_notes   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name_normalised)
);
CREATE INDEX IF NOT EXISTS med_concepts_norm_idx ON public.medication_concepts (name_normalised);
CREATE INDEX IF NOT EXISTS med_concepts_review_idx ON public.medication_concepts (review_status);

CREATE TABLE IF NOT EXISTS public.medication_names (
  name_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id       uuid NOT NULL REFERENCES public.medication_concepts(concept_id) ON DELETE CASCADE,
  name             text NOT NULL,
  name_type        text NOT NULL CHECK (name_type IN ('generic','brand','abbreviation','alias','spelling_variant')),
  is_primary       boolean NOT NULL DEFAULT false,
  source_code      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, name, name_type)
);
CREATE INDEX IF NOT EXISTS med_names_name_idx ON public.medication_names (lower(name));
CREATE INDEX IF NOT EXISTS med_names_concept_idx ON public.medication_names (concept_id);

CREATE TABLE IF NOT EXISTS public.medication_components (
  component_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id       uuid NOT NULL REFERENCES public.medication_concepts(concept_id) ON DELETE CASCADE,
  combination_label text NOT NULL,
  combination_brand text,
  role             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, combination_label)
);
CREATE INDEX IF NOT EXISTS med_components_combo_idx ON public.medication_components (combination_label);

CREATE TABLE IF NOT EXISTS public.medication_classes (
  class_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_code       text NOT NULL UNIQUE,
  class_label      text NOT NULL,
  class_category   text,
  parent_class_id  uuid REFERENCES public.medication_classes(class_id),
  source_code      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS med_classes_code_idx ON public.medication_classes (class_code);

CREATE TABLE IF NOT EXISTS public.medication_class_memberships (
  membership_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id      uuid NOT NULL REFERENCES public.medication_concepts(concept_id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES public.medication_classes(class_id) ON DELETE CASCADE,
  source_code     text,
  confidence      text NOT NULL DEFAULT 'high' CHECK (confidence IN ('high','medium','low')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, class_id)
);
CREATE INDEX IF NOT EXISTS med_class_mem_concept_idx ON public.medication_class_memberships (concept_id);
CREATE INDEX IF NOT EXISTS med_class_mem_class_idx ON public.medication_class_memberships (class_id);

CREATE TABLE IF NOT EXISTS public.medication_forms (
  form_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id       uuid NOT NULL REFERENCES public.medication_concepts(concept_id) ON DELETE CASCADE,
  dosage_form      text NOT NULL,
  route            text,
  strength_text    text,
  source_code      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, dosage_form, strength_text)
);
CREATE INDEX IF NOT EXISTS med_forms_concept_idx ON public.medication_forms (concept_id);

CREATE TABLE IF NOT EXISTS public.medication_assertions (
  assertion_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id       uuid NOT NULL REFERENCES public.medication_concepts(concept_id) ON DELETE CASCADE,
  assertion_type   text NOT NULL,
  assertion_value  text,
  statement        text NOT NULL,
  source_code      text NOT NULL,
  source_document_id uuid REFERENCES public.med_source_documents(document_id) ON DELETE SET NULL,
  source_file      text,
  source_section   text,
  source_locator   text,
  extraction_method text NOT NULL DEFAULT 'section_parser' CHECK (extraction_method IN ('section_parser','field_parser','manual','nlp_assisted')),
  confidence       text NOT NULL DEFAULT 'high' CHECK (confidence IN ('high','medium','low')),
  content_hash     text NOT NULL,
  ingestion_run_id uuid REFERENCES public.med_ingestion_runs(run_id) ON DELETE SET NULL,
  review_status    text NOT NULL DEFAULT 'extracted' CHECK (review_status IN ('extracted','needs_review','approved','rejected','superseded')),
  reviewer_notes   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_hash)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'valid_assertion_type'
      AND conrelid = 'public.medication_assertions'::regclass
  ) THEN
    ALTER TABLE public.medication_assertions ADD CONSTRAINT valid_assertion_type
      CHECK (assertion_type IN (
        'indication','dosage','administration','timing','contraindication','precaution','warning',
        'drug_interaction','food_interaction','supplement_interaction','adverse_effect_common',
        'adverse_effect_serious','monitoring','renal_consideration','hepatic_consideration',
        'pregnancy','breastfeeding','paediatric','elderly','mechanism','counselling',
        'crushing_splitting','clinical_note','pregnancy_category','mims_class','amh_chapter',
        'storage','duration','dose_form','route_info'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS med_assertions_concept_idx ON public.medication_assertions (concept_id);
CREATE INDEX IF NOT EXISTS med_assertions_type_idx ON public.medication_assertions (assertion_type);
CREATE INDEX IF NOT EXISTS med_assertions_source_idx ON public.medication_assertions (source_code);
CREATE INDEX IF NOT EXISTS med_assertions_review_idx ON public.medication_assertions (review_status);
CREATE INDEX IF NOT EXISTS med_assertions_hash_idx ON public.medication_assertions (content_hash);
CREATE INDEX IF NOT EXISTS med_assertions_fts_idx ON public.medication_assertions USING gin (to_tsvector('english', statement));

CREATE TABLE IF NOT EXISTS public.medication_assertion_conflicts (
  conflict_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id       uuid NOT NULL REFERENCES public.medication_concepts(concept_id) ON DELETE CASCADE,
  assertion_type   text NOT NULL,
  source_a         text NOT NULL,
  source_b         text NOT NULL,
  assertion_a_id   uuid REFERENCES public.medication_assertions(assertion_id) ON DELETE SET NULL,
  assertion_b_id   uuid REFERENCES public.medication_assertions(assertion_id) ON DELETE SET NULL,
  statement_a      text NOT NULL,
  statement_b      text NOT NULL,
  clinical_significance text NOT NULL DEFAULT 'minor' CHECK (clinical_significance IN ('minor','moderate','major')),
  resolution       text NOT NULL DEFAULT 'unresolved' CHECK (resolution IN ('unresolved','reviewed_amh_preferred','reviewed_emims_preferred','reviewed_neither','resolved')),
  reviewer_notes   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);
CREATE INDEX IF NOT EXISTS med_conflicts_concept_idx ON public.medication_assertion_conflicts (concept_id);
CREATE INDEX IF NOT EXISTS med_conflicts_resolution_idx ON public.medication_assertion_conflicts (resolution);

CREATE TABLE IF NOT EXISTS public.medication_supplement_safety (
  rule_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id        uuid REFERENCES public.medication_concepts(concept_id) ON DELETE CASCADE,
  class_id          uuid REFERENCES public.medication_classes(class_id) ON DELETE CASCADE,
  supplement_ingredient text,
  product_tags      text[] NOT NULL DEFAULT '{}',
  action            text NOT NULL CHECK (action IN ('suppress','downgrade','require_review','counsel','admin_timing')),
  severity_tier     text NOT NULL CHECK (severity_tier IN ('contraindicated','major','moderate','minor')),
  mechanism         text,
  advice            text NOT NULL,
  pharmacist_checks text[] NOT NULL DEFAULT '{}',
  safety_net        text,
  source_code       text NOT NULL DEFAULT 'curated',
  source_assertion_id uuid REFERENCES public.medication_assertions(assertion_id) ON DELETE SET NULL,
  review_status     text NOT NULL DEFAULT 'needs_review' CHECK (review_status IN ('needs_review','approved','rejected','superseded')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (concept_id IS NOT NULL OR class_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS med_supp_safety_concept_idx ON public.medication_supplement_safety (concept_id);
CREATE INDEX IF NOT EXISTS med_supp_safety_class_idx ON public.medication_supplement_safety (class_id);
CREATE INDEX IF NOT EXISTS med_supp_safety_ingredient_idx ON public.medication_supplement_safety (supplement_ingredient);
CREATE INDEX IF NOT EXISTS med_supp_safety_review_idx ON public.medication_supplement_safety (review_status);

CREATE TABLE IF NOT EXISTS public.medication_patient_factor_rules (
  rule_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id          uuid REFERENCES public.medication_classes(class_id) ON DELETE CASCADE,
  concept_id        uuid REFERENCES public.medication_concepts(concept_id) ON DELETE CASCADE,
  patient_factor    text NOT NULL,
  detection_label   text NOT NULL,
  source_code       text NOT NULL DEFAULT 'curated',
  review_status     text NOT NULL DEFAULT 'approved' CHECK (review_status IN ('needs_review','approved','rejected','superseded')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (class_id IS NOT NULL OR concept_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS med_pf_rules_class_idx ON public.medication_patient_factor_rules (class_id);
CREATE INDEX IF NOT EXISTS med_pf_rules_concept_idx ON public.medication_patient_factor_rules (concept_id);
CREATE INDEX IF NOT EXISTS med_pf_rules_factor_idx ON public.medication_patient_factor_rules (patient_factor);

CREATE TABLE IF NOT EXISTS public.med_data_quality (
  issue_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code      text,
  concept_id       uuid REFERENCES public.medication_concepts(concept_id) ON DELETE SET NULL,
  issue_type        text NOT NULL,
  severity          text NOT NULL DEFAULT 'medium' CHECK (severity IN ('high','medium','low')),
  description       text NOT NULL,
  source_file       text,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','wontfix')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS med_dq_status_idx ON public.med_data_quality (status);
CREATE INDEX IF NOT EXISTS med_dq_type_idx ON public.med_data_quality (issue_type);

ALTER TABLE public.med_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.med_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_class_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_assertion_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_supplement_safety ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_patient_factor_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.med_data_quality ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone read med source docs" ON public.med_source_documents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med ingestion runs" ON public.med_ingestion_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med concepts" ON public.medication_concepts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med names" ON public.medication_names FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med components" ON public.medication_components FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med classes" ON public.medication_classes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med class memberships" ON public.medication_class_memberships FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med forms" ON public.medication_forms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med assertions" ON public.medication_assertions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med conflicts" ON public.medication_assertion_conflicts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med supp safety" ON public.medication_supplement_safety FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med pf rules" ON public.medication_patient_factor_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone read med dq" ON public.med_data_quality FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.med_source_documents TO anon, authenticated;
GRANT SELECT ON public.med_ingestion_runs TO anon, authenticated;
GRANT SELECT ON public.medication_concepts TO anon, authenticated;
GRANT SELECT ON public.medication_names TO anon, authenticated;
GRANT SELECT ON public.medication_components TO anon, authenticated;
GRANT SELECT ON public.medication_classes TO anon, authenticated;
GRANT SELECT ON public.medication_class_memberships TO anon, authenticated;
GRANT SELECT ON public.medication_forms TO anon, authenticated;
GRANT SELECT ON public.medication_assertions TO anon, authenticated;
GRANT SELECT ON public.medication_assertion_conflicts TO anon, authenticated;
GRANT SELECT ON public.medication_supplement_safety TO anon, authenticated;
GRANT SELECT ON public.medication_patient_factor_rules TO anon, authenticated;
GRANT SELECT ON public.med_data_quality TO anon, authenticated;

GRANT ALL ON public.med_source_documents TO service_role;
GRANT ALL ON public.med_ingestion_runs TO service_role;
GRANT ALL ON public.medication_concepts TO service_role;
GRANT ALL ON public.medication_names TO service_role;
GRANT ALL ON public.medication_components TO service_role;
GRANT ALL ON public.medication_classes TO service_role;
GRANT ALL ON public.medication_class_memberships TO service_role;
GRANT ALL ON public.medication_forms TO service_role;
GRANT ALL ON public.medication_assertions TO service_role;
GRANT ALL ON public.medication_assertion_conflicts TO service_role;
GRANT ALL ON public.medication_supplement_safety TO service_role;
GRANT ALL ON public.medication_patient_factor_rules TO service_role;
GRANT ALL ON public.med_data_quality TO service_role;

GRANT UPDATE (review_status, reviewer_notes) ON public.medication_concepts TO authenticated;
GRANT UPDATE (review_status) ON public.medication_assertions TO authenticated;
GRANT UPDATE (review_status) ON public.medication_supplement_safety TO authenticated;
GRANT UPDATE (review_status) ON public.medication_patient_factor_rules TO authenticated;
GRANT UPDATE (status) ON public.med_data_quality TO authenticated;

DROP POLICY IF EXISTS "Admins review med concepts" ON public.medication_concepts;
CREATE POLICY "Admins review med concepts" ON public.medication_concepts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins review med assertions" ON public.medication_assertions;
CREATE POLICY "Admins review med assertions" ON public.medication_assertions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    AND review_status IN ('extracted','needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins review med supp safety" ON public.medication_supplement_safety;
CREATE POLICY "Admins review med supp safety" ON public.medication_supplement_safety
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    AND review_status IN ('needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins review med pf rules" ON public.medication_patient_factor_rules;
CREATE POLICY "Admins review med pf rules" ON public.medication_patient_factor_rules
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    AND review_status IN ('needs_review','approved','rejected','superseded'));

DROP POLICY IF EXISTS "Admins triage med dq" ON public.med_data_quality;
CREATE POLICY "Admins triage med dq" ON public.med_data_quality
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    AND status IN ('open','in_review','resolved','wontfix'));