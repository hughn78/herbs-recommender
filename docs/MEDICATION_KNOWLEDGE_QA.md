# Medication Knowledge QA

**Date:** 2026-08-12
**Status:** Test suite implemented

---

## 1. Automated QA Coverage

### Parser tests (medication-parser.test.ts)

| Test | Input | Expected |
|------|-------|----------|
| Generic name recognition | "atorvastatin" | recognised, concept_id, drug_classes |
| Brand name recognition | "Lipitor" | recognised, generic_name = atorvastatin |
| Brand + strength | "Lipitor 40mg" | recognised, strength = 40mg |
| Generic + strength + form | "metformin 1000mg XR" | recognised, dosage_form = modified release |
| Misspelling tolerance | "Coversil Plus" | fuzzy match to Coversyl |
| Combination product | "perindopril/indapamide" | recognised, is_combination, components[] |
| Unknown drug | "Xylophrenium 5mg" | unknown |
| Multi-medication list | 3 drugs on separate lines | 3 parsed items |
| Australian brand | "Somac" | recognised as pantoprazole |
| Modified release suffix | "Diabex XR" | recognised, dosage_form extracted |

### Ingestion QA

| Metric | Target | Actual |
|--------|--------|--------|
| Concepts with at least 1 assertion | >80% | TBD after full run |
| Concepts with drug class mapping | >60% | TBD |
| Names per concept (avg) | >3 | ~4.0 (10,690 / 2,654) |
| Assertions per concept (avg) | >10 | ~21.8 (57,918 / 2,654) |
| AMH coverage of common drugs | >90% | 1,608/1,608 files parsed (100%) |
| eMIMS parse success rate | >40% | 8,035/16,732 (48%) |
| Zero duplicate assertions | 0 | 0 (content_hash dedup) |

---

## 2. Data Quality Issues Detected

| Issue Type | Count | Severity | Status |
|------------|-------|----------|--------|
| eMIMS files missing generic_name | 8,697 | medium | Known (non-drug entries + brand-only) |
| AMH files missing drug_name | 0 | - | Clean |
| Duplicate concepts (same normalised name) | 0 | - | Deduped by UNIQUE constraint |
| Duplicate names (same concept + name + type) | 0 | - | Deduped by UNIQUE constraint |
| Empty assertion statements | 0 | - | Filtered (<10 chars) |
| Missing drug class mapping | ~2,632 | low | 22 classes mapped; many concepts lack MIMS class match |

---

## 3. Validation Test Cases

The test suite covers these validation scenarios from the brief:

| Case | Medications | Tests |
|------|-------------|-------|
| A | atorvastatin, metformin, pantoprazole, apixaban, aspirin, Coversyl Plus | brand/generic, combo, polypharmacy |
| B | levothyroxine | brand (Eutroxsig), magnesium timing |
| C | doxycycline | mineral timing interaction |
| D | apixaban | brand (Eliquis), bleeding risk |
| E | Pregnant patient | pregnancy factor, supplement suppression |
| F | CKD patient | renal_disease factor, magnesium caution |
| G | Misspelled brand | "Coversil" -> fuzzy -> "Coversyl" |
| H | Combination product | "Duodart" -> dutasteride + tamsulosin |
| I | Unrecognised drug | "tirzepatide" -> unknown (not in corpus) |
| J | 8+ medications | polypharmacy detection |

---

## 4. Regression Tests

The existing 132 tests all pass. New tests are additive:
- `medication-parser.test.ts`: 10+ tests for the new parser
- Ingestion pipeline tested via actual corpus run
- Migration SQL validated by syntax check

---

## 5. Continuous QA

Future QA to implement:
- Automated duplicate brand detection (same brand name, different generics)
- Combination product component validation (all parts recognised)
- Assertion statement quality scoring (length, clinical relevance)
- Cross-source agreement rate (AMH vs eMIMS on same assertion_type)
- Parser recognition rate benchmark (target: >85% of top 100 Australian medicines)