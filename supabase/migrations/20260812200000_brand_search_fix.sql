-- Brand search fix: add trigram index for fast fuzzy/contains matching
-- on medication_names, and an FTS index on medication_concepts.canonical_name.
-- Also add a concept name trigram index for prefix/contains search on canonical names.

-- pg_trgm enables fast ILIKE '%query%' via GIN trigram index
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN index on medication_names.name (supports ILIKE '%term%' efficiently)
DROP INDEX IF EXISTS med_names_name_trgm_idx;
CREATE INDEX med_names_name_trgm_idx
  ON public.medication_names USING gin (name gin_trgm_ops);

-- Keep the existing btree index for exact/prefix lookups
-- (med_names_name_idx on lower(name) already exists)

-- Trigram index on canonical_name for concept-level search
DROP INDEX IF EXISTS med_concepts_canonical_trgm_idx;
CREATE INDEX med_concepts_canonical_trgm_idx
  ON public.medication_concepts USING gin (canonical_name gin_trgm_ops);

-- Also index the normalised name for exact lookups
DROP INDEX IF EXISTS med_concepts_norm_trgm_idx;
CREATE INDEX med_concepts_norm_trgm_idx
  ON public.medication_concepts USING gin (name_normalised gin_trgm_ops);