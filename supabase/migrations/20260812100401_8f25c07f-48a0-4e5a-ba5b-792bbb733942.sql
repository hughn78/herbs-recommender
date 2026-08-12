CREATE EXTENSION IF NOT EXISTS pg_trgm;
DROP INDEX IF EXISTS med_names_name_trgm_idx;
CREATE INDEX med_names_name_trgm_idx
  ON public.medication_names USING gin (name gin_trgm_ops);
DROP INDEX IF EXISTS med_concepts_canonical_trgm_idx;
CREATE INDEX med_concepts_canonical_trgm_idx
  ON public.medication_concepts USING gin (canonical_name gin_trgm_ops);
DROP INDEX IF EXISTS med_concepts_norm_trgm_idx;
CREATE INDEX med_concepts_norm_trgm_idx
  ON public.medication_concepts USING gin (name_normalised gin_trgm_ops);