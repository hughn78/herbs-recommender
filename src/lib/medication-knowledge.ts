// Medication knowledge loader — queries the new medication intelligence tables.
// Falls back to the existing medication_dictionary table when the new
// tables have not been migrated yet.
import type { SupabaseClient } from "@supabase/supabase-js";

export type MedicationConcept = {
  concept_id: string;
  canonical_name: string;
  name_normalised: string;
  atc_code: string | null;
  drug_classes: string[];
  brands: string[];
  aliases: string[];
  pregnancy_category: string | null;
  assertions: MedicationAssertion[];
};

export type MedicationAssertion = {
  assertion_id: string;
  assertion_type: string;
  assertion_value: string | null;
  statement: string;
  source_code: string;
  source_section: string | null;
  confidence: string;
  review_status: string;
};

export type MedicationRecognitionResult = {
  recognised: boolean;
  concept: MedicationConcept | null;
  matched_name: string;
  match_type: "exact" | "alias" | "normalised" | "fuzzy" | "none";
  confidence: number;
  suggestions: string[];
};

/** Load all medication concepts with names and classes from the new tables.
 *  Falls back to medication_dictionary when new tables are not present. */
export async function loadMedicationKnowledge(
  supabase: SupabaseClient,
): Promise<{
  concepts: MedicationConcept[];
  source: "medication_intelligence" | "legacy_dictionary" | "none";
  error?: string;
}> {
  try {
    // Try new tables first
    const [conceptsRes, namesRes, classMemRes, classRes, assertionsRes] = await Promise.all([
      supabase.from("medication_concepts").select("*"),
      supabase.from("medication_names").select("*"),
      supabase.from("medication_class_memberships").select("concept_id, class_id"),
      supabase.from("medication_classes").select("class_id, class_code, class_label"),
      supabase.from("medication_assertions").select("*").eq("review_status", "approved"),
    ]);

    if (conceptsRes.error) throw new Error(conceptsRes.error.message);
    if (namesRes.error) throw new Error(namesRes.error.message);

    const concepts = (conceptsRes.data ?? []) as Array<Record<string, unknown>>;
    if (concepts.length === 0) {
      // Fall back to legacy dictionary
      return loadLegacyDictionary(supabase);
    }

    const names = (namesRes.data ?? []) as Array<Record<string, unknown>>;
    const memberships = (classMemRes.data ?? []) as Array<Record<string, unknown>>;
    const classes = (classRes.data ?? []) as Array<Record<string, unknown>>;
    const assertions = (assertionsRes.data ?? []) as Array<Record<string, unknown>>;

    // Build class lookup
    const classById = new Map(classes.map((c) => [c.class_id as string, c.class_code as string]));

    // Build name groups by concept_id
    const namesByConcept = new Map<string, { brands: string[]; aliases: string[]; generics: string[] }>();
    for (const n of names) {
      const cid = n.concept_id as string;
      if (!namesByConcept.has(cid)) namesByConcept.set(cid, { brands: [], aliases: [], generics: [] });
      const entry = namesByConcept.get(cid)!;
      const name = n.name as string;
      switch (n.name_type as string) {
        case "brand": entry.brands.push(name); break;
        case "alias":
        case "abbreviation":
        case "spelling_variant": entry.aliases.push(name); break;
        case "generic": entry.generics.push(name); break;
      }
    }

    // Build class memberships by concept_id
    const classesByConcept = new Map<string, string[]>();
    for (const m of memberships) {
      const cid = m.concept_id as string;
      if (!classesByConcept.has(cid)) classesByConcept.set(cid, []);
      const clsCode = classById.get(m.class_id as string);
      if (clsCode) classesByConcept.get(cid)!.push(clsCode);
    }

    // Build assertions by concept_id
    const assertionsByConcept = new Map<string, MedicationAssertion[]>();
    for (const a of assertions) {
      const cid = a.concept_id as string;
      if (!assertionsByConcept.has(cid)) assertionsByConcept.set(cid, []);
      assertionsByConcept.get(cid)!.push({
        assertion_id: a.assertion_id as string,
        assertion_type: a.assertion_type as string,
        assertion_value: (a.assertion_value as string | null) ?? null,
        statement: a.statement as string,
        source_code: a.source_code as string,
        source_section: (a.source_section as string | null) ?? null,
        confidence: a.confidence as string,
        review_status: a.review_status as string,
      });
    }

    // Assemble concepts
    const result: MedicationConcept[] = concepts.map((c) => {
      const cid = c.concept_id as string;
      const nameInfo = namesByConcept.get(cid) ?? { brands: [], aliases: [], generics: [] };
      return {
        concept_id: cid,
        canonical_name: c.canonical_name as string,
        name_normalised: c.name_normalised as string,
        atc_code: (c.atc_code as string | null) ?? null,
        drug_classes: classesByConcept.get(cid) ?? [],
        brands: nameInfo.brands,
        aliases: nameInfo.aliases,
        pregnancy_category: null,
        assertions: assertionsByConcept.get(cid) ?? [],
      };
    });

    // Extract pregnancy category from assertions
    for (const concept of result) {
      const pregAssertion = concept.assertions.find((a) => a.assertion_type === "pregnancy_category");
      if (pregAssertion) {
        concept.pregnancy_category = pregAssertion.assertion_value;
      }
    }

    return { concepts: result, source: "medication_intelligence" };
  } catch (e) {
    // Fall back to legacy dictionary
    const legacy = await loadLegacyDictionary(supabase);
    return { ...legacy, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Load from the existing medication_dictionary table and convert to
 *  MedicationConcept format for backward compatibility. */
async function loadLegacyDictionary(
  supabase: SupabaseClient,
): Promise<{ concepts: MedicationConcept[]; source: "legacy_dictionary" | "none" }> {
  try {
    const { data, error } = await supabase
      .from("medication_dictionary")
      .select("generic_name, brand_names, drug_class, aliases, atc_hint");

    if (error) return { concepts: [], source: "none" };

    const concepts: MedicationConcept[] = (data ?? []).map((d: Record<string, unknown>) => ({
      concept_id: `legacy_${(d.generic_name as string).toLowerCase()}`,
      canonical_name: d.generic_name as string,
      name_normalised: (d.generic_name as string).toLowerCase().replace(/[^a-z0-9]/g, ""),
      atc_code: (d.atc_hint as string | null) ?? null,
      drug_classes: d.drug_class ? [d.drug_class as string] : [],
      brands: (d.brand_names as string[]) ?? [],
      aliases: (d.aliases as string[]) ?? [],
      pregnancy_category: null,
      assertions: [],
    }));

    return { concepts, source: "legacy_dictionary" };
  } catch {
    return { concepts: [], source: "none" };
  }
}

/** Build a lookup index from medication concepts for fast parser access.
 *  Creates normalised name -> concept maps for exact, alias, and fuzzy matching. */
export function buildMedicationIndex(concepts: MedicationConcept[]): {
  exact: Map<string, MedicationConcept>;
  normalised: Map<string, MedicationConcept>;
  brands: Map<string, MedicationConcept>;
  aliases: Map<string, MedicationConcept>;
} {
  const exact = new Map<string, MedicationConcept>();
  const normalised = new Map<string, MedicationConcept>();
  const brands = new Map<string, MedicationConcept>();
  const aliases = new Map<string, MedicationConcept>();

  function norm(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  for (const c of concepts) {
    exact.set(c.canonical_name.toLowerCase(), c);
    normalised.set(norm(c.canonical_name), c);

    for (const b of c.brands) {
      brands.set(b.toLowerCase(), c);
      normalised.set(norm(b), c);
    }

    for (const a of c.aliases) {
      aliases.set(a.toLowerCase(), c);
      normalised.set(norm(a), c);
    }
  }

  return { exact, normalised, brands, aliases };
}