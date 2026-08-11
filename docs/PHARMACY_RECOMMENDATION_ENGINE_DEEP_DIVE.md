# Pharmacy Recommendation Engine — Deep Dive Audit

**Audit date:** 2026-08-12
**Live site:** https://hrecommender.lovable.app
**Repository:** hughn78/herbs-recommender (branch: hermes/medication-intelligence-expansion)
**Baseline:** 132 tests passing, typecheck clean, build clean

---

## 1. System Map

**PharmaPrompt OS** is a TanStack Start + Supabase application hosted on Lovable Cloud. It provides deterministic pharmacy decision support for Australian community pharmacy, focused on Herbs of Gold supplement recommendations.

### Technology stack
- Frontend: TanStack Start (React 19, TanStack Router, Tailwind CSS 4, shadcn/ui)
- Backend: Supabase (Postgres, Auth, Storage) managed by Lovable Cloud
- AI: Lovable AI Gateway (Gemini 2.5 Flash) for sense-check only
- Language: TypeScript throughout, server functions via TanStack Start

### Authentication model
- Public (sign-in-free) access to reference data: products, safety_rules, medication_dictionary, kb_chunks
- Authenticated staff access for patient case creation, governance review
- No patient identifiers stored; cases are age/sex/symptoms only
- Owner-scoped RLS on patient_cases, recommendations, sense_check_audits, pharmacist_feedback

---

## 2. Route Map

| Route | Access | Description |
|-------|--------|-------------|
| `/` | Public | Landing page with hero, "How it works", CTAs |
| `/auth` | Public | Sign-in / create-access page |
| `/app` | Authenticated | Dashboard with workspace stats |
| `/app` | Authenticated | Main index (dashboard) |
| `/app/review` | Authenticated | 3-step patient review wizard |
| `/app/cases` | Authenticated | Past reviews list (30 most recent) |
| `/app/case/:caseId` | Authenticated | Individual case detail with recommendations |
| `/app/references` | Authenticated | Source library + clinical knowledge search |
| `/app/products` | Authenticated | Herbs of Gold catalogue (103 products, browseable) |
| `/app/products/:hogCode` | Authenticated | Individual product detail page |
| `/app/governance` | Authenticated | Governance workflow (35 products need review) |
| `/app/queue` | Authenticated | Safety caution queue (currently clear) |
| `/app/_admin/setup` | Authenticated | Knowledge base ingestion controls |
| `/app/_admin/rules` | Authenticated | Safety rules read-only view |

### Live site observations
- Landing page renders correctly with clear messaging
- Products page shows 103 products from the governed Herbs of Gold catalogue
- Governance page shows 35 products needing review, 68 approved
- References page has 0 source documents registered (kb_chunks table empty on live)
- Queue is clear (no outstanding safety cautions)
- Admin setup page has KB ingestion controls
- Past reviews shows 1 existing case (56yo female, Depression)

---

## 3. Data-Flow Map

```
Patient intake form (3 steps)
    |
    v
Step 1: Age, sex, pregnancy, breastfeeding, allergies, medical history
    |
    v
Step 2: Medication list (free text) -> parser -> medication_dictionary lookup
         -> confirmed_medications[] (generic_name, brand_name, drug_class)
    |
    v
Step 3: Symptoms, counselling goal, existing supplements, pathology notes
    |
    v
createCaseFn (server function)
    |
    +-> load safety_rules from Supabase
    +-> loadEngineProducts (catalogue_products approved OR legacy products)
    +-> loadOntologyTagMaps (ontology_concepts + ontology_synonyms)
    |
    v
runEngine(ctx, rules, products, maps)
    |
    +-> detectPatientFactors(ctx) -> factors[]
    +-> Safety rules pass (trigger_drug_classes x trigger_patient_factors)
    +-> Symptom-driven counselling prompts (3 hardcoded symptom maps)
    +-> screenRedFlags(ctx, factors) -> red flag recs
    +-> checkOtcInteractions(ctx, factors) -> OTC interaction recs
    +-> recommendProducts(ctx, products, triggeredRules, maps)
         |
         +-> matchProduct (drug class tags, factor tags, symptom tags)
         +-> isSuppressed (avoid_if_tags, drug class conflicts, ingredient dup)
         +-> isAgeAppropriate (paediatric name gate)
         +-> Score + rank
    |
    v
attachEvidence(supabase, recs) -> kb_chunks text search for source references
    |
    v
runAiSenseCheck(ctx, baseRecs) -> Lovable AI Gateway (Gemini 2.5 Flash)
    |  (safer-only: can lower confidence, add caution, flag for review)
    |  (cannot add recs, remove recs, raise confidence, or undo safety rules)
    v
Persist: patient_cases + recommendations + sense_check_audits
    |
    v
Results page renders: recs sorted by type priority, severity tier, score
```

---

## 4. Recommendation Pipeline

### Current pipeline stages (in execution order)

1. **Patient factor detection** (`detectPatientFactors`)
   - Age-based: elderly (>=65), child (<12)
   - Medication-count: polypharmacy (>=5)
   - Pregnancy/breastfeeding from intake
   - History regex: renal, hepatic, diabetes, hypertension, epilepsy, postmenopausal, immunosuppressed
   - Drug-class derived: bleeding_risk, mineral_timing_risk, on_nsaid, on_renin_angiotensin_or_diuretic
   - Supplement duplication check

2. **Safety rules pass** (database-driven `safety_rules` table)
   - Matches trigger_drug_classes against confirmed medications
   - Matches trigger_patient_factors against detected factors
   - Generates safety_caution, administration, review_required recs

3. **Symptom-driven counselling** (3 hardcoded maps: cramp/magnesium, fatigue/iron_b12, reflux)
   - Very limited coverage: only 3 symptom patterns hardcoded

4. **Red-flag screening** (`screenRedFlags`)
   - 14 red flags: chest pain, stroke, dyspnoea, anaphylaxis, GI bleeding, dysphagia, headache, meningism, pregnancy bleeding, pre-eclampsia, child fever, child meningitis, suicidal ideation, anticoag bleeding, triple whammy

5. **OTC interactions** (`checkOtcInteractions`)
   - 16 curated interaction entries
   - Covers: NSAID interactions (6), St John's Wort (3), decongestants (2), mineral timing (4), antacid/iron (1), antihistamine/elderly (1)

6. **Product recommendations** (`recommendProducts`)
   - Tag-based matching: drug class -> clinical_use_tags, patient factor -> clinical_use_tags, symptom -> clinical_use_tags
   - Suppression: avoid_if_tags vs factors, avoid_if_tags vs drug classes, ingredient duplication, age gate
   - Scoring: matched tag count * 20 + 400 base

7. **Evidence attachment** (`attachEvidence`)
   - FTS search on kb_chunks table (currently empty on live site)

8. **AI sense-check** (`runAiSenseCheck`)
   - Gemini 2.5 Flash via Lovable AI Gateway
   - Safer-only constraints enforced in code

---

## 5. Current Strengths

1. **Deterministic safety architecture**: Safety rules, OTC interactions, and red flags run BEFORE product recommendations. No LLM can undo them. This is the correct hierarchy.

2. **Structured rationale system**: Every recommendation carries a `Rationale` object with severity tier (4-tier), evidence level (GRADE), matched factors, mechanism, alternatives, safety net, and source attribution. Pharmacist can defend in <10 seconds.

3. **AI sense-check with code-enforced safety**: AI can only lower confidence, add cautions, or flag for review. Cannot raise confidence, remove cautions, add/remove recommendations, or upgrade products. Fail-closed posture.

4. **Governed catalogue**: 103 Herbs of Gold products with full provenance chain (source_documents -> source_sections -> source_claims -> claim_citations). Review status workflow.

5. **Ontology-driven matching**: Clinical search ontology with consumer wording synonyms enables "tired all the time" to match energy products.

6. **Age gate**: Deterministic paediatric product suppression based on product name patterns.

7. **Suppression logic**: Three-layer product suppression (factor conflict, drug class conflict, ingredient duplication) prevents unsafe recommendations.

8. **Comprehensive OTC interaction table**: 16 curated, pharmacist-reviewed interaction entries with mechanism, onset, alternatives, safety nets.

---

## 6. Current Weaknesses

1. **Medication dictionary is tiny**: The `medication_dictionary` table has approximately 30-50 entries (hand-curated). The parser cannot recognise most Australian medicines. eMIMS has 16,740 product files representing ~1,800 unique generics. This is the single biggest gap.

2. **Drug class detection is manual**: Each medication_dictionary entry has a single `drug_class` string. There is no taxonomy, no multi-class membership, no corpus-backed class mapping. 16,740 eMIMS files have a `MIMS Class` field that is not being used.

3. **Symptom maps are hardcoded**: Only 3 symptom patterns (cramp, fatigue, reflux) are hardcoded in `engine.ts`. The SYMPTOM_MAP array is not data-driven. No path for corpus-backed symptom associations.

4. **No medication knowledge in recommendations**: The engine knows a medication's `drug_class` string but has no access to contraindications, precautions, interactions, renal/hepatic considerations, pregnancy categories, or administration advice from AMH/eMIMS. The recommendation cannot say "atorvastatin may cause muscle symptoms - consider this before attributing cramps to magnesium deficiency."

5. **References page is empty**: The `kb_chunks` table is empty on the live site. `attachEvidence` returns nothing. The References page shows 0 source documents. The provenance chain exists in the schema but has no data.

6. **No medication detail view**: There is no `/app/medicines/:id` route. The pharmacist cannot look up a medication and see its class, brands, interactions, or patient-factor flags.

7. **Combination products not supported**: The parser does not split "Coversyl Plus" into perindopril + indapamide. The engine treats the combination as a single drug_class string. The OTC interaction checker's `expandedClasses` splits on `/` but this is fragile.

8. **No fuzzy matching with confirmation**: The parser does fuzzy matching but the result is just a suggestion string. There is no user confirmation step for fuzzy matches in the current review wizard (the parser returns "fuzzy" status but the UI doesn't handle it differently from "unknown").

9. **No patient-factor detection from medications**: The engine detects `bleeding_risk` from drug classes but does not detect diabetes from metformin, thyroid therapy from levothyroxine, or anticoagulation from apixaban specifically. It relies on the drug_class string being correct.

10. **No source conflict detection**: AMH and eMIMS may disagree on contraindications, precautions, or pregnancy categories. The system has no way to surface or resolve these disagreements.

---

## 7. Clinical-Information Gaps

| Gap | Impact | Source Available |
|-----|--------|-----------------|
| No pregnancy category data | Cannot flag pregnancy category D/X drugs | eMIMS header has A/B/C/D/X |
| No renal dosing guidance | Cannot advise on CKD patients | AMH has Renal subsection |
| No hepatic dosing guidance | Cannot advise on liver disease | AMH has Hepatic subsection |
| No breastfeeding guidance | Cannot advise nursing mothers | AMH has Breastfeeding subsection |
| No drug-drug interaction data | Cannot check prescribed drug interactions | eMIMS has Interactions section |
| No adverse effect data | Cannot warn about common ADRs | Both have Adverse Effects |
| No administration timing | Cannot advise when to take relative to food/other meds | eMIMS has Food field, AMH has Administration |
| No crushing/splitting info | Cannot advise PEG/enteral patients | Not in either source (would need DRTC) |
| No counselling points | Cannot provide medication-specific counselling | AMH has Counselling section |
| No mechanism of action | Cannot explain why a drug causes an effect | AMH has Mode of action, eMIMS has Use |

---

## 8. UX Gaps

1. **Review wizard Step 2 (medication list)**: Pasting a medication list produces recognised/unknown status but no drug class display, no brand-to-generic translation, no combination product expansion. The pharmacist sees "recognised" but not "recognised as perindopril + indapamide (ACE inhibitor + diuretic)."

2. **Results page**: Recommendations are shown but lack medication context. A magnesium recommendation for a statin patient with cramps does not explain the statin-cramp relationship or suggest checking CK.

3. **References page**: Empty. No clinical search capability. A pharmacist cannot type "Coversyl Plus" or "apixaban magnesium" and get useful results.

4. **No medication detail view**: No way to browse a medication and see its Australian brands, class, key safety considerations, or supplement cautions.

5. **Progressive disclosure**: The results page shows all details at once. For a busy pharmacist, the most important information should be visible at first glance with expandable detail.

6. **No polypharmacy alert**: When 8+ medications are entered, there is no visual flag for polypharmacy risk beyond the factor detection.

7. **Product cards**: Show product name, brand, confidence, and tags but not the full reasoning chain. The `why_triggered` is present but not prominently displayed.

---

## 9. Data-Model Gaps

1. **medication_dictionary is a flat table**: generic_name, brand_names[], drug_class, aliases[], atc_hint. No relationships, no provenance, no assertions, no version tracking.

2. **No medication concept entity**: There is no canonical medication concept that multiple brands map to. "Lipitor" and "Apo-Atorvastatin" are separate dictionary entries, not the same concept.

3. **No assertion model**: Clinical knowledge (contraindications, precautions, interactions) cannot be stored as atomic, source-backed facts. There is no way to say "AMH says X about atorvastatin" vs "eMIMS says Y about atorvastatin."

4. **No source versioning**: No tracking of which AMH/eMIMS version was ingested, when, or what changed. No idempotent re-ingestion capability.

5. **No medication-supplement bridge table**: No structured way to say "magnesium suppresses product X for patients on bisphosphonates" that is backed by a source assertion rather than a hardcoded avoid_if_tag.

6. **kb_chunks is generic**: The knowledge base chunks table has no medication-specific structure. It cannot distinguish a medication assertion from a general reference chunk.

7. **No data quality tracking**: No table for recording parse failures, duplicate detections, or extraction issues during ingestion.

---

## 10. Reliability/Safety Gaps

1. **Parser failure mode is silent**: When the parser does not recognise a medication, it returns "unknown" and the engine silently skips it. There is no warning to the pharmacist that a medication was not processed.

2. **Drug class string matching is fuzzy**: The engine uses `includes()` for drug class matching. `"statin"` would match `"anticoagulant"` if the class string were malformed. No exact class code lookup.

3. **No safety rule validation**: Safety rules in the database are not validated against the medication concept model. A rule could reference a drug class that does not exist.

4. **AI sense-check can timeout**: If the Lovable AI Gateway is slow, the sense-check can timeout. The code handles this with a try/catch returning status="error" and unchanged recs, which is safe.

5. **No rate limiting on case creation**: The createCaseFn does not rate-limit. A malicious actor could spam cases. The RLS policy limits to authenticated users, but there is no per-user limit.

6. **No audit trail for safety rule changes**: Safety rules can be modified via the admin UI but there is no audit trail for who changed what.

7. **No cross-reference validation**: When a safety rule says "avoid product keyword: magnesium," there is no validation that "magnesium" appears in any product's active_ingredients.

---

## 11. Highest-Value Opportunities

Ranked by clinical and workflow impact:

1. **Ingest AMH + eMIMS into canonical medication model** (2,654 concepts, 10,690 names, 57,918 assertions) — transforms recognition from ~30 drugs to ~2,650 drugs
2. **Upgrade parser to use corpus-backed names** — recognises Australian brands, misspellings, combination products
3. **Corpus-backed drug class taxonomy** — 22 class mappings from AMH chapters + eMIMS MIMS Class
4. **Medication x supplement safety layer** — bridge medication assertions to product suppression/downgrade rules
5. **Medication detail view** (`/app/medicines/:id`) — pharmacist workspace for medication knowledge
6. **References page powered by medication assertions** — clinical search with source-backed results
7. **Patient-factor detection from medication patterns** — "metformin suggests diabetes - confirm with patient"
8. **Symptom + medication reasoning** — "statin + cramps = consider medicine-related cause before supplement"
9. **Combination product parsing** — "Coversyl Plus" -> perindopril + indapamide -> ACE inhibitor + diuretic
10. **Source conflict detection and display** — AMH vs eMIMS disagreements surfaced for pharmacist review
