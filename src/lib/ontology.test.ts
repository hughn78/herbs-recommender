/**
 * Phase 6 tests — data-driven clinical/search ontology.
 *
 * The ontology tables (ontology_concepts + ontology_synonyms) replace the
 * hardcoded tag maps in recommend-products.ts. These tests verify:
 *   1. buildTagMaps routes concept types into the right matcher map and
 *      normalises terms exactly like the matcher does.
 *   2. Brand aliases / consumer wording / spelling variants reach products.
 *   3. Unapproved (auto-proposed) synonyms never influence matching.
 *   4. Duplicate terms across concepts merge tags.
 *   5. recommendProducts end-to-end with ontology-built maps — including a
 *      consumer-wording search that the old hardcoded maps could not match.
 */
import { describe, it, expect } from "vitest";
import {
  buildTagMaps,
  type OntologyConceptRow,
  type OntologySynonymRow,
} from "./ontology";
import { recommendProducts, type ProductRow } from "./recommend-products";
import type { PatientCtx } from "./engine";

function concept(
  id: string,
  type: string,
  label: string,
  tags: string[],
): OntologyConceptRow {
  return {
    concept_id: id,
    concept_type: type,
    canonical_label: label,
    clinical_use_tags: tags,
  };
}

function synonym(
  conceptId: string,
  term: string,
  approved = true,
): OntologySynonymRow {
  return { concept_id: conceptId, term, synonym_type: "curated_search", approved };
}

function makeProduct(overrides: Partial<ProductRow>): ProductRow {
  return {
    product_id: "HOG-TEST-001",
    name: "Test Product",
    brand: "Herbs of Gold",
    category: "supplement",
    active_ingredients: ["test ingredient"],
    indications: [],
    cautions: [],
    pack_sizes: [],
    schedule: null,
    reviewed: true,
    source_url: null,
    notes: null,
    clinical_use_tags: [],
    avoid_if_tags: [],
    medicine_interaction_flags: [],
    counselling_flags: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<PatientCtx>): PatientCtx {
  return {
    age: 45,
    sex: "female",
    pregnancy_status: "no",
    breastfeeding_status: "no",
    allergies: "",
    medical_history: "",
    symptoms: "",
    counselling_goal: "",
    existing_supplements: "",
    pathology_notes: "",
    confirmed_medications: [],
    ...overrides,
  };
}

describe("buildTagMaps", () => {
  it("routes concept types into the correct matcher map", () => {
    const concepts = [
      concept("c1", "medication_class", "statin", ["heart_health"]),
      concept("c2", "patient_factor", "elderly", ["vitamin_d_support"]),
      concept("c3", "symptom", "fatigue", ["energy_support"]),
      concept("c4", "health_goal", "immunity", ["immune_support"]),
      concept("c5", "contraindication", "warfarin", ["should_not_appear"]),
    ];
    const synonyms = [
      synonym("c1", "statin"),
      synonym("c2", "elderly"),
      synonym("c3", "tired all the time"),
      synonym("c4", "frequent colds"),
      synonym("c5", "warfarin"),
    ];
    const maps = buildTagMaps(concepts, synonyms);
    expect(maps.drugClassMap).toEqual({ statin: ["heart_health"] });
    expect(maps.factorMap).toEqual({ elderly: ["vitamin_d_support"] });
    expect(maps.symptomMap).toEqual({
      "tired all the time": ["energy_support"],
      "frequent colds": ["immune_support"],
    });
  });

  it("normalises terms like the matcher (case, punctuation, whitespace)", () => {
    const concepts = [concept("c1", "symptom", "sleep", ["sleep_support"])];
    const synonyms = [synonym("c1", "  Can't   Sleep! ")];
    const maps = buildTagMaps(concepts, synonyms);
    expect(maps.symptomMap).toEqual({ "can t sleep": ["sleep_support"] });
  });

  it("excludes unapproved (auto-proposed) synonyms", () => {
    const concepts = [concept("c1", "medication_class", "statin", ["heart_health"])];
    const synonyms = [
      synonym("c1", "statin"),
      synonym("c1", "unreviewed-alias", false),
    ];
    const maps = buildTagMaps(concepts, synonyms);
    expect(maps.drugClassMap).toEqual({ statin: ["heart_health"] });
    expect(maps.drugClassMap?.["unreviewed-alias"]).toBeUndefined();
  });

  it("merges tags when two concepts share a normalised term", () => {
    const concepts = [
      concept("c1", "symptom", "stress", ["stress_support"]),
      concept("c2", "health_goal", "calm", ["nervous_system_support"]),
    ];
    const synonyms = [synonym("c1", "anxiety"), synonym("c2", "Anxiety")];
    const maps = buildTagMaps(concepts, synonyms);
    expect(maps.symptomMap?.anxiety).toEqual(
      expect.arrayContaining(["stress_support", "nervous_system_support"]),
    );
  });

  it("registers suppression-only factors with empty tag arrays", () => {
    const concepts = [concept("c1", "patient_factor", "renal_disease", [])];
    const maps = buildTagMaps(concepts, [synonym("c1", "kidney disease")]);
    expect(maps.factorMap).toEqual({ "kidney disease": [] });
  });
});

describe("recommendProducts with ontology-built maps", () => {
  const magnesiumProduct = makeProduct({
    product_id: "HOG-0050",
    name: "Magnesium Forte",
    clinical_use_tags: ["magnesium_support", "muscle_cramps"],
  });

  it("matches a consumer-wording symptom the hardcoded maps never covered", () => {
    // "night cramps" exists only in the curated ontology, not in the legacy
    // hardcoded symptom map.
    const maps = buildTagMaps(
      [concept("c1", "symptom", "muscle cramps", ["magnesium_support", "muscle_cramps"])],
      [synonym("c1", "night cramps")],
    );
    const recs = recommendProducts(
      makeCtx({ symptoms: "I get night cramps most evenings" }),
      [magnesiumProduct],
      [],
      maps,
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].product_id).toBe("HOG-0050");
    expect(recs[0].matched_product_tags).toEqual(
      expect.arrayContaining(["magnesium_support", "muscle_cramps"]),
    );
  });

  it("matches a medicine brand alias against the patient's drug class", () => {
    const maps = buildTagMaps(
      [concept("c1", "medication_class", "ppi", ["magnesium_support"])],
      [synonym("c1", "nexium")],
    );
    const recs = recommendProducts(
      makeCtx({
        symptoms: "leg cramps",
        confirmed_medications: [
          { generic_name: "esomeprazole", drug_class: "nexium" },
        ],
      }),
      [magnesiumProduct],
      [],
      maps,
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].matched_medicines).toContain("esomeprazole");
  });

  it("falls back to built-in maps when no ontology maps are supplied", () => {
    // Same patient, no maps argument: the legacy default symptom map still
    // matches "cramp" → magnesium_support.
    const recs = recommendProducts(
      makeCtx({ symptoms: "muscle cramps at night" }),
      [magnesiumProduct],
      [],
    );
    expect(recs).toHaveLength(1);
  });
});
