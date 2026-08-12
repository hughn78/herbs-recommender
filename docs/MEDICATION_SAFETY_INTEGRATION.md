# Medication Safety Integration

**Date:** 2026-08-12
**Status:** Schema designed, rules table created, integration with engine pending

---

## 1. Architecture

The medication x supplement safety layer bridges two knowledge domains:

```
MEDICATION KNOWLEDGE                    SUPPLEMENT/PRODUCT KNOWLEDGE
(medication_concepts)                  (catalogue_products)
(medication_assertions)                (product_ingredients)
(medication_classes)                    (product_warnings)
         |                                     |
         +----------+---------------------------+
                    |
                    v
        medication_supplement_safety
        (bridge table with action + severity)
                    |
                    v
        Engine safety pass (runs BEFORE product ranking)
```

---

## 2. Safety Actions

| Action | Effect | Example |
|--------|--------|---------|
| suppress | Product removed from recommendations | Warfarin + St John's Wort |
| downgrade | Product confidence lowered | Statin + magnesium (timing, not contraindication) |
| require_review | Product shown but flagged for pharmacist review | SSRI + 5-HTP |
| counsel | Product recommended but with counselling warning | Levothyroxine + calcium (timing advice) |
| admin_timing | Administration timing advice added | Doxycycline + iron (separate by 2h) |

---

## 3. Rule Sources

Each rule can be backed by:
- A `medication_assertions` row (source-backed: AMH/eMIMS says X)
- A curated rule (pharmacist-reviewed, source_code = 'curated')
- An OTC interaction entry (from the existing `otc-interactions.ts` table)

The `source_assertion_id` FK links the safety rule to the specific assertion that backs it. This provides full provenance: "this rule exists because AMH says 'calcium chelates bisphosphonate in the gut'."

---

## 4. Integration with Existing Safety System

The existing engine has:
1. `safety_rules` table (database-driven, trigger_drug_classes x trigger_patient_factors)
2. `AVOID_TAG_FACTOR_MAP` and `AVOID_TAG_DRUG_CLASS_MAP` (hardcoded in recommend-products.ts)
3. `OTC_INTERACTIONS` table (16 curated entries in otc-interactions.ts)

The new `medication_supplement_safety` table extends this by:
- Using concept_id (not just drug_class string) for precise medication matching
- Using supplement_ingredient or product_tags (not just avoid_if_tags) for product matching
- Linking to source assertions for provenance
- Supporting review_status workflow

**Migration path:** The hardcoded maps remain as fallback. The engine checks `medication_supplement_safety` first, then falls back to hardcoded maps. This preserves current behavior during rollout.

---

## 5. Current OTC Interactions (already implemented)

The 16 curated OTC interaction entries cover:

| Interaction | Severity | Status |
|------------|----------|--------|
| NSAID + anticoagulant | major | Implemented |
| NSAID + antiplatelet | moderate | Implemented |
| Triple whammy (ACEi/ARB + diuretic + NSAID) | major | Implemented |
| NSAID + SSRI/SNRI | moderate | Implemented |
| NSAID + lithium | major | Implemented |
| NSAID + high-dose methotrexate | major | Implemented |
| St John's Wort + SSRI/SNRI | contraindicated | Implemented |
| St John's Wort + OCP | major | Implemented |
| St John's Wort + anticoagulant etc | major | Implemented |
| Decongestant + MAOI | contraindicated | Implemented |
| Decongestant + BPH | moderate | Implemented |
| Calcium/iron + levothyroxine | moderate | Implemented |
| Calcium/iron + quinolone | major | Implemented |
| Calcium/iron + tetracycline | moderate | Implemented |
| Calcium/iron + bisphosphonate | moderate | Implemented |
| Antacid + iron | moderate | Implemented |
| Sedating antihistamine + elderly | moderate | Implemented |

These remain the authoritative safety layer. The new `medication_supplement_safety` table will eventually migrate these into the database with source-backed assertions, but the hardcoded table is not removed until the migration is verified.

---

## 6. Non-Negotiable Safety Rule

The hierarchy remains:
1. Deterministic safety logic (safety_rules, OTC interactions, red flags, medication_supplement_safety)
2. Structured source evidence (medication_assertions)
3. Retrieval (FTS, vector search)
4. AI interpretation (sense-check, summarisation)

**AI may NEVER:**
- Invent a medication identity
- Invent an interaction
- Invent a contraindication
- Remove a deterministic warning
- Upgrade a suppressed product
- Approve a clinically unsafe recommendation

**AI MAY:**
- Summarise retrieved evidence
- Explain a safety rule in pharmacist-friendly language
- Downgrade confidence
- Add caution
- Flag for review