// Medication search server functions for the References page.
// Hybrid search: exact lookup -> alias -> FTS on assertions.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabase } from "./public-supabase-middleware";

function isMissingSchema(message: string): boolean {
  return /schema cache/i.test(message) || /does not exist/i.test(message);
}

export type MedSearchResult = {
  concept_id: string;
  canonical_name: string;
  drug_classes: string[];
  brands: string[];
  assertion_count: number;
  pregnancy_category: string | null;
  source_codes: string[];
  assertions: Array<{
    assertion_type: string;
    statement: string;
    source_code: string;
    source_section: string | null;
    confidence: string;
  }>;
};

export type MedSearchResponse = {
  results: MedSearchResult[];
  total: number;
  search_method: "exact" | "fts" | "empty";
  error?: string;
};

export const searchMedicationsFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .inputValidator((d: { query: string }) => d)
  .handler(async ({ data, context }): Promise<MedSearchResponse> => {
    const db = context.supabase as unknown as SupabaseClient;
    const query = data.query.trim();
    if (!query) return { results: [], total: 0, search_method: "empty" };

    try {
      // 1. Exact name lookup first
      const { data: nameMatches, error: nameErr } = await db
        .from("medication_names")
        .select("concept_id, name, name_type")
        .ilike("name", query)
        .limit(20);

      if (nameErr) {
        if (isMissingSchema(nameErr.message)) {
          return { results: [], total: 0, search_method: "empty", error: "Medication tables not yet migrated" };
        }
        throw new Error(nameErr.message);
      }

      const conceptIds = Array.from(new Set((nameMatches ?? []).map((n: Record<string, unknown>) => n.concept_id as string)));

      // 2. If no exact matches, try FTS on assertions
      if (conceptIds.length === 0) {
        const { data: ftsMatches, error: ftsErr } = await db
          .from("medication_assertions")
          .select("concept_id")
          .textSearch("statement", query, { type: "websearch", config: "english" })
          .limit(10);

        if (ftsErr && !isMissingSchema(ftsErr.message)) throw new Error(ftsErr.message);

        const ftsConceptIds = Array.from(new Set((ftsMatches ?? []).map((f: Record<string, unknown>) => f.concept_id as string)));
        if (ftsConceptIds.length === 0) {
          return { results: [], total: 0, search_method: "fts" };
        }
        conceptIds.push(...ftsConceptIds);
      }

      if (conceptIds.length === 0) {
        return { results: [], total: 0, search_method: "empty" };
      }

      // 3. Load full concept data for matched concepts
      const [conceptsRes, namesRes, classMemRes, classesRes, assertionsRes] = await Promise.all([
        db.from("medication_concepts")
          .select("*")
          .in("concept_id", conceptIds),
        db.from("medication_names")
          .select("concept_id, name, name_type")
          .in("concept_id", conceptIds),
        db.from("medication_class_memberships")
          .select("concept_id, class_id")
          .in("concept_id", conceptIds),
        db.from("medication_classes")
          .select("class_id, class_code, class_label"),
        db.from("medication_assertions")
          .select("assertion_id, concept_id, assertion_type, statement, source_code, source_section, confidence, review_status")
          .in("concept_id", conceptIds)
          .eq("review_status", "approved")
          .order("assertion_type", { ascending: true })
          .limit(200),
      ]);

      if (conceptsRes.error) throw new Error(conceptsRes.error.message);

      const concepts = (conceptsRes.data ?? []) as Array<Record<string, unknown>>;
      const names = (namesRes.data ?? []) as Array<Record<string, unknown>>;
      const memberships = (classMemRes.data ?? []) as Array<Record<string, unknown>>;
      const classes = (classesRes.data ?? []) as Array<Record<string, unknown>>;
      const assertions = (assertionsRes.data ?? []) as Array<Record<string, unknown>>;

      // Build lookups
      const classById = new Map(classes.map((c) => [c.class_id as string, c.class_code as string]));
      const classesByConcept = new Map<string, string[]>();
      for (const m of memberships) {
        const cid = m.concept_id as string;
        if (!classesByConcept.has(cid)) classesByConcept.set(cid, []);
        const code = classById.get(m.class_id as string);
        if (code) classesByConcept.get(cid)!.push(code);
      }

      const namesByConcept = new Map<string, { brands: string[]; generics: string[]; aliases: string[] }>();
      for (const n of names) {
        const cid = n.concept_id as string;
        if (!namesByConcept.has(cid)) namesByConcept.set(cid, { brands: [], generics: [], aliases: [] });
        const entry = namesByConcept.get(cid)!;
        const name = n.name as string;
        switch (n.name_type as string) {
          case "brand": entry.brands.push(name); break;
          case "generic": entry.generics.push(name); break;
          case "alias":
          case "abbreviation":
          case "spelling_variant": entry.aliases.push(name); break;
        }
      }

      const assertionsByConcept = new Map<string, MedSearchResult["assertions"]>();
      for (const a of assertions) {
        const cid = a.concept_id as string;
        if (!assertionsByConcept.has(cid)) assertionsByConcept.set(cid, []);
        assertionsByConcept.get(cid)!.push({
          assertion_type: a.assertion_type as string,
          statement: a.statement as string,
          source_code: a.source_code as string,
          source_section: (a.source_section as string | null) ?? null,
          confidence: a.confidence as string,
        });
      }

      const results: MedSearchResult[] = concepts.map((c) => {
        const cid = c.concept_id as string;
        const nameInfo = namesByConcept.get(cid) ?? { brands: [], generics: [], aliases: [] };
        const conceptAssertions = assertionsByConcept.get(cid) ?? [];
        const pregAssertion = conceptAssertions.find((a) => a.assertion_type === "pregnancy_category");
        const sourceCodes = Array.from(new Set(conceptAssertions.map((a) => a.source_code)));
        return {
          concept_id: cid,
          canonical_name: c.canonical_name as string,
          drug_classes: classesByConcept.get(cid) ?? [],
          brands: nameInfo.brands,
          assertion_count: conceptAssertions.length,
          pregnancy_category: pregAssertion?.statement ?? null,
          source_codes: sourceCodes,
          assertions: conceptAssertions,
        };
      });

      return {
        results,
        total: results.length,
        search_method: conceptIds.length > 0 ? "exact" : "fts",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isMissingSchema(msg)) {
        return { results: [], total: 0, search_method: "empty", error: "Medication tables not yet migrated" };
      }
      throw e;
    }
  });

/** Load a single medication concept by ID with full detail. */
export const getMedicationDetailFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .inputValidator((d: { conceptId: string }) => d)
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;

    try {
      const [conceptRes, namesRes, classMemRes, classesRes, assertionsRes, formsRes, safetyRes] = await Promise.all([
        db.from("medication_concepts").select("*").eq("concept_id", data.conceptId).maybeSingle(),
        db.from("medication_names").select("*").eq("concept_id", data.conceptId),
        db.from("medication_class_memberships").select("concept_id, class_id").eq("concept_id", data.conceptId),
        db.from("medication_classes").select("class_id, class_code, class_label, class_category"),
        db.from("medication_assertions").select("*").eq("concept_id", data.conceptId).order("assertion_type"),
        db.from("medication_forms").select("*").eq("concept_id", data.conceptId),
        db.from("medication_supplement_safety").select("*").or(`concept_id.eq.${data.conceptId}`).eq("review_status", "approved"),
      ]);

      if (conceptRes.error) {
        if (isMissingSchema(conceptRes.error.message)) return null;
        throw new Error(conceptRes.error.message);
      }
      if (!conceptRes.data) return null;

      return {
        concept: conceptRes.data,
        names: namesRes.data ?? [],
        class_memberships: classMemRes.data ?? [],
        classes: classesRes.data ?? [],
        assertions: assertionsRes.data ?? [],
        forms: formsRes.data ?? [],
        safety_rules: safetyRes.data ?? [],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isMissingSchema(msg)) return null;
      throw e;
    }
  });