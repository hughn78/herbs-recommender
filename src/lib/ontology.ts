// Phase 6 — data-driven clinical/search ontology loader.
//
// The product matcher (recommend-products.ts) needs three term→tag maps:
//   drugClassMap : medication class wording  → clinical-use tags
//   factorMap    : patient factor wording    → clinical-use tags
//   symptomMap   : symptom / health-goal wording → clinical-use tags
//
// Historically these were hardcoded TypeScript constants. They now come from
// the governed ontology tables (ontology_concepts + ontology_synonyms), seeded
// from data/ontology/clinical-search-ontology.json and reviewable in the
// Phase 14 governance workflow. The hardcoded defaults remain as a fallback
// when the tables are missing or empty (e.g. before migrations are applied).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TagMaps } from "./recommend-products";

export type OntologyConceptRow = {
  concept_id: string;
  concept_type: string;
  canonical_label: string;
  clinical_use_tags: string[] | null;
};

export type OntologySynonymRow = {
  concept_id: string;
  term: string;
  synonym_type: string;
  approved: boolean | null;
};

export type OntologyMapLoad = {
  /** Empty maps on failure/empty — recommendProducts then uses its defaults. */
  maps: Partial<TagMaps>;
  source: "ontology" | "fallback";
  error?: string;
  conceptCount: number;
  synonymCount: number;
};

/** Match the normalisation used by the product matcher so map keys align
 *  with the normalised symptom/goal blob it searches. */
function normaliseTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeTags(target: Record<string, string[]>, key: string, tags: string[]) {
  const existing = target[key] ?? [];
  target[key] = Array.from(new Set([...existing, ...tags]));
}

/**
 * Pure map builder — unit-tested directly with row fixtures.
 *
 * Concept-type routing:
 *   medication_class          → drugClassMap
 *   patient_factor            → factorMap
 *   symptom / health_goal     → symptomMap
 * Other concept types (contraindication, warning, …) are ignored here; they
 * serve the governance workflow rather than product matching.
 *
 * Only approved synonyms contribute. When two concepts share a term (for
 * example "diabetes" as a medication class and a patient factor) the tags
 * merge within each map so a single search term can carry both curations.
 */
export function buildTagMaps(
  concepts: OntologyConceptRow[],
  synonyms: OntologySynonymRow[],
): Partial<TagMaps> {
  const drugClassMap: Record<string, string[]> = {};
  const factorMap: Record<string, string[]> = {};
  const symptomMap: Record<string, string[]> = {};

  const targetFor = (conceptType: string): Record<string, string[]> | null => {
    switch (conceptType) {
      case "medication_class":
        return drugClassMap;
      case "patient_factor":
        return factorMap;
      case "symptom":
      case "health_goal":
        return symptomMap;
      default:
        return null;
    }
  };

  const conceptById = new Map(concepts.map((c) => [c.concept_id, c]));
  for (const syn of synonyms) {
    if (syn.approved === false) continue;
    const concept = conceptById.get(syn.concept_id);
    if (!concept) continue;
    const target = targetFor(concept.concept_type);
    if (!target) continue;
    const key = normaliseTerm(syn.term);
    if (!key) continue;
    mergeTags(target, key, concept.clinical_use_tags ?? []);
  }

  // Only return maps that actually have entries. recommendProducts falls back
  // to its built-in defaults per map, so an ontology that curates only some
  // categories never silently disables default matching for the others.
  const maps: Partial<TagMaps> = {};
  if (Object.keys(drugClassMap).length > 0) maps.drugClassMap = drugClassMap;
  if (Object.keys(factorMap).length > 0) maps.factorMap = factorMap;
  if (Object.keys(symptomMap).length > 0) maps.symptomMap = symptomMap;
  return maps;
}

/**
 * Load ontology-driven tag maps from Supabase. Any failure (table missing,
 * RLS denial, empty seed) returns empty maps so the engine falls back to its
 * built-in defaults — the ontology is an enhancement, never a hard dependency.
 */
export async function loadOntologyTagMaps(
  supabase: SupabaseClient,
): Promise<OntologyMapLoad> {
  try {
    const [conceptRes, synonymRes] = await Promise.all([
      supabase
        .from("ontology_concepts")
        .select("concept_id, concept_type, canonical_label, clinical_use_tags"),
      supabase
        .from("ontology_synonyms")
        .select("concept_id, term, synonym_type, approved"),
    ]);
    if (conceptRes.error) throw new Error(conceptRes.error.message);
    if (synonymRes.error) throw new Error(synonymRes.error.message);

    const concepts = (conceptRes.data ?? []) as OntologyConceptRow[];
    const synonyms = (synonymRes.data ?? []) as OntologySynonymRow[];
    if (concepts.length === 0) {
      return { maps: {}, source: "fallback", conceptCount: 0, synonymCount: 0 };
    }
    return {
      maps: buildTagMaps(concepts, synonyms),
      source: "ontology",
      conceptCount: concepts.length,
      synonymCount: synonyms.length,
    };
  } catch (e) {
    return {
      maps: {},
      source: "fallback",
      error: e instanceof Error ? e.message : String(e),
      conceptCount: 0,
      synonymCount: 0,
    };
  }
}
