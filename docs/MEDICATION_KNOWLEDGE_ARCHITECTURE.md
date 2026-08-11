# Medication Knowledge Architecture

**Date:** 2026-08-12
**Status:** Implemented (migration + ingestion pipeline + parser + tests)

---

## 1. Design Principles

1. **Generic/active ingredient is the canonical concept**, not brand. "atorvastatin" is the concept; "Lipitor", "Apo-Atorvastatin", "Atorvachol" are names pointing to it.
2. **Every clinical assertion is atomic and source-backed.** Not a JSON blob. Each assertion knows its concept, type, source, source section, and content hash.
3. **AMH and eMIMS disagreements are modelled as conflicts**, not silently resolved.
4. **Raw corpus text is never stored or committed.** Only structured facts, short verification excerpts (<=256 chars), and provenance metadata.
5. **Deterministic safety logic > structured source evidence > retrieval > AI interpretation.** AI may summarise or downgrade, never invent or override.
6. **Idempotent ingestion.** Content hashes prevent duplicate assertions. A second run against identical files produces zero new rows.

---

## 2. Entity Model

### Core entities

```
medication_concepts (2,654 rows)
  ├── medication_names (10,690 rows) — brands, generics, aliases
  ├── medication_components — combination product relationships
  ├── medication_forms — dosage forms, routes, strengths
  ├── medication_class_memberships — concept -> class mapping
  ├── medication_assertions (57,918 rows) — atomic clinical facts
  └── medication_assertion_conflicts — AMH vs eMIMS disagreements

medication_classes (22 rows)
  └── medication_class_memberships — many-to-many to concepts

medication_supplement_safety — bridges medication knowledge to product catalogue
medication_patient_factor_rules — medication-driven patient factor detection

med_source_documents — source corpus versioning
med_ingestion_runs — ingestion run tracking with change reports
med_data_quality — automated QA issues
```

### Key design decisions

**Why not extend the existing `medication_dictionary` table?**
The flat table (generic_name, brand_names[], drug_class, aliases[]) cannot represent:
- Multiple class memberships (atorvastatin is both "statin" and "cardiovascular")
- Source-backed assertions with provenance
- Combination product components
- Source conflicts
- Version tracking

The new tables are additive; the old table remains for backward compatibility and the parser falls back to it.

**Why atomic assertions instead of JSON blobs?**
- Searchable: each assertion is a row with FTS index on `statement`
- Deduplication: content_hash prevents duplicate knowledge across ingestion runs
- Conflict detection: same concept + assertion_type from different sources can be compared
- Granular review: a pharmacist can review one precaution at a time, not a monolith
- Selective exposure: the UI can show only `approved` assertions; `needs_review` stay internal

---

## 3. Assertion Types

Extracted from actual corpus inspection:

| Type | Source | Example |
|------|--------|---------|
| indication | Both | "Hypercholesterolaemia" |
| dosage | AMH | "10-80 mg once daily" |
| administration | AMH | "May be taken with or without food" |
| contraindication | Both | "Active hepatic disease" |
| precaution | Both | "Monitor LFTs incl baseline" |
| warning | Both | "Myopathy risk (monitor CK)" |
| drug_interaction | Both | "CYP3A4 inhibitors eg macrolides" |
| food_interaction | eMIMS | "May be taken with or without food" |
| adverse_effect_common | Both | "GI upset; nasopharyngitis" |
| adverse_effect_serious | Both | "Rhabdomyolysis; hepatitis" |
| monitoring | AMH | "Monitor renal function and CK regularly" |
| renal_consideration | AMH | "Impairment increases risk of myopathy" |
| hepatic_consideration | AMH | "Chronic liver disease increases concentration" |
| pregnancy | AMH | "Avoid use; specialists may advise in very high risk" |
| breastfeeding | AMH | "Avoid breastfeeding" |
| paediatric | AMH | "Specialists may start from age 8 years" |
| elderly | AMH | "Risk of myopathy higher if frail, age >80" |
| mechanism | AMH | "Competitively inhibit HMG-CoA reductase" |
| counselling | AMH | Present for some drugs |
| pregnancy_category | eMIMS | "D" (A/B/C/D/X system) |
| mims_class | eMIMS | "Hypolipidaemic agents" |
| amh_chapter | AMH | "cardiovascular-drugs" |
| dose_form | eMIMS | From Available Products section |
| clinical_note | Both | Practice points, additional info |

---

## 4. Source Versioning

Each ingestion run creates a `med_ingestion_runs` row tracking:
- Source code (AMH / eMIMS)
- Document ID (linking to `med_source_documents`)
- Files processed/skipped/failed
- New concepts, updated concepts, new assertions, changed assertions
- Conflicts found
- Full report JSON

Source documents are hashed (sha256) for change detection. A second ingestion of the same file produces zero changes. A modified file triggers changed assertions via content_hash mismatch.

---

## 5. Medication x Supplement Safety Bridge

The `medication_supplement_safety` table bridges medication knowledge to the product catalogue:

```
medication_supplement_safety
  ├─ concept_id OR class_id (medication side)
  ├─ supplement_ingredient OR product_tags (supplement side)
  ├─ action: suppress | downgrade | require_review | counsel | admin_timing
  ├─ severity_tier: contraindicated | major | moderate | minor
  ├─ mechanism, advice, pharmacist_checks, safety_net
  └─ source_assertion_id (links to the assertion that backs this rule)
```

This replaces the hardcoded `AVOID_TAG_DRUG_CLASS_MAP` and `AVOID_TAG_FACTOR_MAP` in `recommend-products.ts` with corpus-backed, reviewable rules. The existing hardcoded maps remain as fallback.

---

## 6. Retrieval Architecture

```
Question type                  → Retrieval method
──────────────────────────────────────────────────────
"What is atorvastatin?"        → medication_concepts lookup by name
"Show brands for atorvastatin" → medication_names WHERE concept_id = X
"What class is apixaban?"      → medication_class_memberships JOIN medication_classes
"Coversyl Plus interactions"   → medication_assertions WHERE assertion_type = 'drug_interaction'
"renal dosing for metformin"   → medication_assertions WHERE assertion_type = 'renal_consideration'
"apixaban magnesium"          → medication_supplement_safety WHERE concept_id = X
"statin cramps"                → FTS on medication_assertions.statement
Broad clinical context         → FTS + optional vector search on assertions
```

Exact lookup is always first. Vector/semantic search is last resort, not first.