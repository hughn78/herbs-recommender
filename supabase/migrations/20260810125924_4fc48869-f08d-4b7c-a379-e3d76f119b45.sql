-- ============================================================
-- Phase 4 — Governed Herbs of Gold catalogue
-- ============================================================
-- Replaces the flat `products` model with a normalised, governed
-- catalogue shaped by the actual corpus (docs/herbsofgold_scraped).
--
-- Design notes:
--   * Stable identity: catalogue_products.hog_code (HOG-####) from the
--     corpus, never derived from a mutable product name.
--   * Raw source text is retained alongside normalised values
--     (raw_text / excerpt columns).
--   * Every clinical claim carries review_status; the clinical UI reads
--     approved data by default.
--   * The legacy `products` table is untouched; app code migrates to
--     these tables in Phase 7.
--   * Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS throughout, so
--     manual application via the SQL editor (Lovable workflow) is safe
--     to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Core catalogue
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.catalogue_products (
  product_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hog_code              text NOT NULL UNIQUE,           -- HOG-0001 …
  brand                 text NOT NULL DEFAULT 'Herbs of Gold',
  name                  text NOT NULL,
  name_normalised       text NOT NULL,
  product_family        text,
  category              text,
  subcategory           text,
  dosage_form           text,
  status                text NOT NULL DEFAULT 'current'
                          CHECK (status IN ('current','discontinued','unknown')),
  austl                 text,                           -- absent from source; review task
  extraction_confidence text CHECK (extraction_confidence IN ('High','Medium','Low')),
  source_page           integer,
  review_status         text NOT NULL DEFAULT 'extracted'
                          CHECK (review_status IN
                            ('extracted','needs_review','approved','rejected','superseded')),
  reviewer_notes        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_products_name_norm_key
  ON public.catalogue_products (name_normalised);
CREATE INDEX IF NOT EXISTS catalogue_products_review_idx
  ON public.catalogue_products (review_status);
CREATE INDEX IF NOT EXISTS catalogue_products_category_idx
  ON public.catalogue_products (category);

CREATE TABLE IF NOT EXISTS public.product_variants (
  variant_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  pack_size    text NOT NULL,                            -- "60 capsules", "120 capsules"
  sku          text,
  status       text NOT NULL DEFAULT 'current'
                 CHECK (status IN ('current','discontinued','unknown')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, pack_size)
);

CREATE TABLE IF NOT EXISTS public.product_images (
  image_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid REFERENCES public.catalogue_products(product_id) ON DELETE SET NULL,
  sha256           text NOT NULL UNIQUE,                 -- content identity
  storage_path     text,                                 -- app storage location (Phase 5)
  derived_path     text,                                 -- workspace extraction path
  original_source  jsonb NOT NULL DEFAULT '[]',          -- [{archive, member, match_method}]
  source_url       text,                                 -- external URL if ever scraped
  mime_type        text,
  width            integer,
  height           integer,
  bytes            integer,
  role             text NOT NULL DEFAULT 'product_packshot'
                     CHECK (role IN ('product_packshot','content_graphic','boilerplate')),
  is_primary       boolean NOT NULL DEFAULT false,
  match_method     text,
  match_confidence numeric,
  alt_text         text,
  review_status    text NOT NULL DEFAULT 'extracted'
                     CHECK (review_status IN
                       ('extracted','needs_review','approved','rejected','superseded')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- One primary image per product (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS product_images_primary_key
  ON public.product_images (product_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS product_images_product_idx
  ON public.product_images (product_id);

CREATE TABLE IF NOT EXISTS public.ingredients (
  ingredient_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL UNIQUE,                   -- normalised display name
  name_normalised text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ingredients_norm_idx ON public.ingredients (name_normalised);

CREATE TABLE IF NOT EXISTS public.ingredient_aliases (
  alias_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(ingredient_id) ON DELETE CASCADE,
  alias         text NOT NULL,
  alias_type    text NOT NULL DEFAULT 'synonym'
                  CHECK (alias_type IN ('synonym','abbreviation','spelling_variant','brand')),
  provenance    text NOT NULL DEFAULT 'source_corpus',   -- source_corpus | curated | auto_proposed
  approved      boolean NOT NULL DEFAULT true,           -- auto_proposed starts false
  UNIQUE (ingredient_id, alias)
);

CREATE TABLE IF NOT EXISTS public.product_ingredients (
  product_ingredient_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  ingredient_id      uuid NOT NULL REFERENCES public.ingredients(ingredient_id) ON DELETE RESTRICT,
  ingredient_form    text,                               -- e.g. "hydrochloride", "glycinate"
  strength           text,                               -- kept as text: source uses mixed precision
  strength_unit      text,
  equivalent_amount  text,                               -- "derived from dry herb 2g"
  equivalent_unit    text,
  equivalent_name    text,
  standardised_to    text,                               -- "stand. to contain gymnemic acids 25mg"
  raw_text           text,                               -- verbatim source line
  source_page        integer,
  extraction_confidence text CHECK (extraction_confidence IN ('High','Medium','Low')),
  content_key        text NOT NULL,                      -- sha256 of identity fields (pipeline-computed)
  UNIQUE (product_id, content_key)
);
CREATE INDEX IF NOT EXISTS product_ingredients_product_idx
  ON public.product_ingredients (product_id);
CREATE INDEX IF NOT EXISTS product_ingredients_ingredient_idx
  ON public.product_ingredients (ingredient_id);

CREATE TABLE IF NOT EXISTS public.product_indications (
  indication_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  text            text NOT NULL,
  indication_type text NOT NULL DEFAULT 'source_label_claim',
  clinical_use_tag text,
  source_page     integer,
  content_key     text NOT NULL,
  review_status   text NOT NULL DEFAULT 'extracted'
                    CHECK (review_status IN
                      ('extracted','needs_review','approved','rejected','superseded')),
  UNIQUE (product_id, content_key)
);
CREATE INDEX IF NOT EXISTS product_indications_tag_idx
  ON public.product_indications (clinical_use_tag);

CREATE TABLE IF NOT EXISTS public.product_directions (
  product_id  uuid PRIMARY KEY REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  adult_dose  text,
  child_dose  text,
  timing      text,
  duration    text,
  raw_text    text
);

CREATE TABLE IF NOT EXISTS public.product_warnings (
  warning_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  text         text NOT NULL,
  warning_type text NOT NULL DEFAULT 'caution'
                 CHECK (warning_type IN
                   ('caution','contraindication','warning','pregnancy_breastfeeding',
                    'child_use','allergy')),
  severity     text CHECK (severity IN ('high','medium','low')),
  avoid_if_tags text[] NOT NULL DEFAULT '{}',
  source_page  integer,
  content_key  text NOT NULL,
  review_status text NOT NULL DEFAULT 'extracted'
                 CHECK (review_status IN
                   ('extracted','needs_review','approved','rejected','superseded')),
  UNIQUE (product_id, content_key)
);
CREATE INDEX IF NOT EXISTS product_warnings_tags_idx
  ON public.product_warnings USING gin (avoid_if_tags);

CREATE TABLE IF NOT EXISTS public.product_interaction_flags (
  flag_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  ingredient_name text,
  interacting_medicine_or_class text,
  interaction_text text NOT NULL,
  action       text,                                   -- e.g. allow_with_counselling
  severity     text CHECK (severity IN ('high','medium','low')),
  flags        text[] NOT NULL DEFAULT '{}',
  source_page  integer,
  content_key  text NOT NULL,
  UNIQUE (product_id, content_key)
);
CREATE INDEX IF NOT EXISTS product_interaction_flags_flags_idx
  ON public.product_interaction_flags USING gin (flags);

CREATE TABLE IF NOT EXISTS public.product_population_rules (
  rule_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  rule_type  text NOT NULL
               CHECK (rule_type IN ('age','sex','pregnancy','breastfeeding','renal','hepatic')),
  rule_value text NOT NULL,                            -- e.g. "not recommended", "adults only"
  source     text,
  UNIQUE (product_id, rule_type, rule_value)
);

CREATE TABLE IF NOT EXISTS public.product_keywords (
  keyword_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  keyword    text NOT NULL,
  keyword_type text NOT NULL DEFAULT 'search',
  provenance text NOT NULL DEFAULT 'source_corpus',
  approved   boolean NOT NULL DEFAULT true,
  UNIQUE (product_id, keyword_type, keyword)
);
CREATE INDEX IF NOT EXISTS product_keywords_keyword_idx ON public.product_keywords (keyword);

CREATE TABLE IF NOT EXISTS public.product_synonyms (
  synonym_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.catalogue_products(product_id) ON DELETE CASCADE,
  synonym    text NOT NULL,
  synonym_type text NOT NULL DEFAULT 'common_name',
  provenance text NOT NULL DEFAULT 'source_corpus',
  approved   boolean NOT NULL DEFAULT true,
  UNIQUE (product_id, synonym)
);

-- ------------------------------------------------------------
-- 2. Knowledge governance
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.source_documents (
  document_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  format       text NOT NULL,                            -- pdf | docx | xlsx | markdown | html
  corpus_path  text NOT NULL,
  sha256       text NOT NULL,
  page_count   integer,
  role         text,                                     -- source_of_truth | cross_check | …
  extracted_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corpus_path)
);

CREATE TABLE IF NOT EXISTS public.source_sections (
  section_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.source_documents(document_id) ON DELETE CASCADE,
  hog_code    text,                                      -- product section, when applicable
  heading     text,
  page        integer,
  text        text,
  UNIQUE (document_id, hog_code, heading, page)
);
CREATE INDEX IF NOT EXISTS source_sections_doc_idx ON public.source_sections (document_id);

CREATE TABLE IF NOT EXISTS public.source_claims (
  claim_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hog_code     text NOT NULL,
  claim_type   text NOT NULL
                 CHECK (claim_type IN
                   ('manufacturer_indication','ingredient_fact','safety_warning',
                    'directions','interaction','educational','population_rule')),
  text         text NOT NULL,
  structured   jsonb,                                    -- normalised payload
  extraction_confidence text CHECK (extraction_confidence IN ('High','Medium','Low')),
  explicit_or_inferred text NOT NULL DEFAULT 'explicit'
                 CHECK (explicit_or_inferred IN ('explicit','inferred')),
  review_status text NOT NULL DEFAULT 'extracted'
                 CHECK (review_status IN
                   ('extracted','needs_review','approved','rejected','superseded')),
  reviewer_notes text,
  content_key  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hog_code, claim_type, content_key)
);
CREATE INDEX IF NOT EXISTS source_claims_product_idx ON public.source_claims (hog_code);
CREATE INDEX IF NOT EXISTS source_claims_review_idx ON public.source_claims (review_status);

CREATE TABLE IF NOT EXISTS public.claim_citations (
  citation_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id     uuid NOT NULL REFERENCES public.source_claims(claim_id) ON DELETE CASCADE,
  document_id  uuid REFERENCES public.source_documents(document_id) ON DELETE SET NULL,
  page         integer,
  section_heading text,
  excerpt      text,                                     -- short supporting excerpt
  source_format text,
  UNIQUE (claim_id, document_id, page, section_heading)
);

CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  run_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  dry_run      boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running','complete','error','cancelled')),
  source_hashes jsonb NOT NULL DEFAULT '{}',
  stats        jsonb NOT NULL DEFAULT '{}',              -- products created/updated, claims, conflicts, images
  last_error   text,
  triggered_by uuid                                      -- auth.users, when run from admin UI
);

CREATE TABLE IF NOT EXISTS public.extraction_conflicts (
  conflict_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hog_code    text NOT NULL,
  field       text NOT NULL,
  values      jsonb NOT NULL,                            -- [{source, value, page}]
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','resolved','wontfix')),
  resolution  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.data_quality_issues (
  issue_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hog_code    text,
  issue_type  text NOT NULL,
  description text,
  severity    text CHECK (severity IN ('high','medium','low')),
  source_file text,
  source_page integer,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','resolved','wontfix')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hog_code, issue_type, description)
);

CREATE TABLE IF NOT EXISTS public.catalogue_review_actions (
  action_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,                            -- product | image | claim | warning | synonym …
  entity_id    text NOT NULL,
  action       text NOT NULL
                 CHECK (action IN ('approve','reject','supersede','edit','merge','flag')),
  previous_value jsonb,
  new_value      jsonb,
  reviewer     uuid,                                     -- auth.users
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS catalogue_review_actions_entity_idx
  ON public.catalogue_review_actions (entity_type, entity_id);

-- ------------------------------------------------------------
-- 3. Search ontology (Phase 6 — schema now, content via ingestion)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ontology_concepts (
  concept_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_type   text NOT NULL
                   CHECK (concept_type IN
                     ('symptom','condition','health_goal','medication_class',
                      'patient_factor','medicine_ingredient','nutrient_depletion',
                      'cm_ingredient','contraindication','warning','referral')),
  canonical_label text NOT NULL,
  clinical_use_tags text[] NOT NULL DEFAULT '{}',        -- tag(s) this concept maps to
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_type, canonical_label)
);

CREATE TABLE IF NOT EXISTS public.ontology_synonyms (
  synonym_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id   uuid NOT NULL REFERENCES public.ontology_concepts(concept_id) ON DELETE CASCADE,
  term         text NOT NULL,
  synonym_type text NOT NULL
                 CHECK (synonym_type IN
                   ('manufacturer_wording','clinical_synonym','consumer_wording',
                    'medicine_brand_alias','spelling_variant','curated_search',
                    'auto_proposed')),
  approved     boolean NOT NULL DEFAULT true,            -- auto_proposed starts false
  provenance   text NOT NULL DEFAULT 'curated',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, term)
);
CREATE INDEX IF NOT EXISTS ontology_synonyms_term_idx ON public.ontology_synonyms (term);

-- ------------------------------------------------------------
-- 4. Row Level Security
-- ------------------------------------------------------------
-- Catalogue content is manufacturer product information, not patient
-- data: readable by pharmacy staff and the anonymous clinical flow
-- (until Phase 13 completes the auth transition, the engine reads it
-- via the public middleware). Governance data is staff-only.
-- Writes go through the service role (ingestion) — no direct client writes.

ALTER TABLE public.catalogue_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_indications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_interaction_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_population_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ontology_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ontology_synonyms ENABLE ROW LEVEL SECURITY;

-- Explicit API grants. RLS policies below still decide row visibility; these
-- grants make the tables reachable at all on projects without default grants.
GRANT SELECT ON
  public.catalogue_products,
  public.product_variants,
  public.product_images,
  public.ingredients,
  public.ingredient_aliases,
  public.product_ingredients,
  public.product_indications,
  public.product_directions,
  public.product_warnings,
  public.product_interaction_flags,
  public.product_population_rules,
  public.product_keywords,
  public.product_synonyms,
  public.ontology_concepts,
  public.ontology_synonyms
TO anon, authenticated;

GRANT SELECT ON
  public.source_documents,
  public.source_sections,
  public.source_claims,
  public.claim_citations,
  public.ingestion_runs,
  public.extraction_conflicts,
  public.data_quality_issues,
  public.catalogue_review_actions
TO authenticated;
GRANT INSERT ON public.catalogue_review_actions TO authenticated;

GRANT ALL ON
  public.catalogue_products,
  public.product_variants,
  public.product_images,
  public.ingredients,
  public.ingredient_aliases,
  public.product_ingredients,
  public.product_indications,
  public.product_directions,
  public.product_warnings,
  public.product_interaction_flags,
  public.product_population_rules,
  public.product_keywords,
  public.product_synonyms,
  public.source_documents,
  public.source_sections,
  public.source_claims,
  public.claim_citations,
  public.ingestion_runs,
  public.extraction_conflicts,
  public.data_quality_issues,
  public.catalogue_review_actions,
  public.ontology_concepts,
  public.ontology_synonyms
TO service_role;

-- Read: catalogue + ontology visible to anon and authenticated.
DROP POLICY IF EXISTS "Read catalogue products" ON public.catalogue_products;
CREATE POLICY "Read catalogue products" ON public.catalogue_products
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read product variants" ON public.product_variants;
CREATE POLICY "Read product variants" ON public.product_variants
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read product images" ON public.product_images;
CREATE POLICY "Read product images" ON public.product_images
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read ingredients" ON public.ingredients;
CREATE POLICY "Read ingredients" ON public.ingredients
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read ingredient aliases" ON public.ingredient_aliases;
CREATE POLICY "Read ingredient aliases" ON public.ingredient_aliases
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read product ingredients" ON public.product_ingredients;
CREATE POLICY "Read product ingredients" ON public.product_ingredients
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read product indications" ON public.product_indications;
CREATE POLICY "Read product indications" ON public.product_indications
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read product directions" ON public.product_directions;
CREATE POLICY "Read product directions" ON public.product_directions
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read product warnings" ON public.product_warnings;
CREATE POLICY "Read product warnings" ON public.product_warnings
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read interaction flags" ON public.product_interaction_flags;
CREATE POLICY "Read interaction flags" ON public.product_interaction_flags
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read population rules" ON public.product_population_rules;
CREATE POLICY "Read population rules" ON public.product_population_rules
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read product keywords" ON public.product_keywords;
CREATE POLICY "Read product keywords" ON public.product_keywords
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read product synonyms" ON public.product_synonyms;
CREATE POLICY "Read product synonyms" ON public.product_synonyms
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read ontology concepts" ON public.ontology_concepts;
CREATE POLICY "Read ontology concepts" ON public.ontology_concepts
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Read ontology synonyms" ON public.ontology_synonyms;
CREATE POLICY "Read ontology synonyms" ON public.ontology_synonyms
  FOR SELECT TO anon, authenticated USING (true);

-- Provenance: readable by staff (references explorer), not anon.
DROP POLICY IF EXISTS "Staff read source documents" ON public.source_documents;
CREATE POLICY "Staff read source documents" ON public.source_documents
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff read source sections" ON public.source_sections;
CREATE POLICY "Staff read source sections" ON public.source_sections
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff read source claims" ON public.source_claims;
CREATE POLICY "Staff read source claims" ON public.source_claims
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff read claim citations" ON public.claim_citations;
CREATE POLICY "Staff read claim citations" ON public.claim_citations
  FOR SELECT TO authenticated USING (true);

-- Governance: staff read; writes via service role / admin review functions.
DROP POLICY IF EXISTS "Staff read ingestion runs" ON public.ingestion_runs;
CREATE POLICY "Staff read ingestion runs" ON public.ingestion_runs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff read extraction conflicts" ON public.extraction_conflicts;
CREATE POLICY "Staff read extraction conflicts" ON public.extraction_conflicts
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff read data quality issues" ON public.data_quality_issues;
CREATE POLICY "Staff read data quality issues" ON public.data_quality_issues
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff read review actions" ON public.catalogue_review_actions;
CREATE POLICY "Staff read review actions" ON public.catalogue_review_actions
  FOR SELECT TO authenticated USING (true);

-- Reviewers (any authenticated staff for now; admin gating in Phase 14)
-- may insert review actions for the audit trail.
DROP POLICY IF EXISTS "Staff insert review actions" ON public.catalogue_review_actions;
CREATE POLICY "Staff insert review actions" ON public.catalogue_review_actions
  FOR INSERT TO authenticated WITH CHECK (reviewer = auth.uid());