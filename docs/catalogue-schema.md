# Catalogue Schema — Governed Herbs of Gold Catalogue

**Migration:** `supabase/migrations/20260807100000_governed_catalogue.sql`
(+ `20260807101000_product_image_storage.sql` for the storage bucket)
**Status:** written; **not yet applied to the live project** — see
`docs/ingestion-pipeline.md` for the apply steps (Lovable Cloud does not
auto-apply repo migrations).

## Design principles

1. **Stable identity.** `catalogue_products.hog_code` (`HOG-0001…`) is the
   canonical key from the corpus. UUIDs are internal FK targets only; nothing
   derives identity from a mutable product name.
2. **Raw alongside normalised.** `raw_text`/`text` keep the verbatim source;
   structured columns carry the parsed values.
3. **Review state everywhere clinical.** Products, indications, warnings,
   images and claims carry `review_status`
   (`extracted → needs_review → approved | rejected | superseded`).
   The clinical UI reads approved data by default (Phase 14).
4. **Long-text upsert keys.** Review-bearing tables use a pipeline-computed
   `content_key` (sha256) for uniqueness instead of indexing long text —
   re-ingestion updates in place and never wipes review decisions.
5. **Legacy untouched.** The flat `products` table remains until the app
   switches to this catalogue (Phase 7).

## Entity map

Core catalogue:
`catalogue_products` (identity, form, status, confidence, review) ·
`product_variants` (pack sizes) · `product_images` (sha256 content identity,
one `is_primary` per product, provenance in `original_source`) ·
`ingredients` + `ingredient_aliases` · `product_ingredients`
(strength/unit/equivalence, never flattened) · `product_indications` ·
`product_directions` · `product_warnings` (typed + severity + avoid_if_tags) ·
`product_interaction_flags` · `product_population_rules` ·
`product_keywords` (typed search terms plus corpus clinical-use / avoid-if /
interaction / counselling tags) · `product_synonyms`

Knowledge governance:
`source_documents` (sha256 + role) · `source_sections` ·
`source_claims` (typed claims: manufacturer_indication / ingredient_fact /
safety_warning / directions / interaction / educational / population_rule) ·
`claim_citations` (document + page + short excerpt) ·
`ingestion_runs` (source hashes, stats, dry-run flag) ·
`extraction_conflicts` · `data_quality_issues` (seeded from the corpus's
144 logged issues) · `catalogue_review_actions` (who/what/when/why audit)

Search ontology (content arrives in Phase 6):
`ontology_concepts` (symptom / condition / health_goal / medication_class /
medicine_ingredient / nutrient_depletion / cm_ingredient / contraindication /
warning / referral, each mapped to clinical_use_tags) ·
`ontology_synonyms` (typed + provenance; `auto_proposed` requires approval
before it is authoritative).

## RLS summary

| Data | anon | authenticated | write |
|---|---|---|---|
| Catalogue content (products, ingredients, indications, warnings, images, keywords, ontology) | read | read | service role only |
| Provenance (source documents/sections/claims/citations) | — | read | service role only |
| Governance (runs, conflicts, issues, review actions) | — | read | service role; staff may insert review actions (`reviewer = auth.uid()`) |
| Storage `product-images` bucket | read | read | service role only |

Patient-data privacy (cases/recommendations) is handled separately in
Phase 13 — this migration deliberately does not touch it.
