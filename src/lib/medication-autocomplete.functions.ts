// Lightweight medication autocomplete server function.
//
// Designed for type-ahead UI in the review workflow:
//   - Returns top N matches (exact > alias > fuzzy).
//   - Each result carries brand + generic + drug class for disambiguation.
//   - Service-role is NOT used; queries go through the publishable
//     key + RLS-respecting client. The medications tables are publicly
//     readable.
//
// The function is independent of the heavy recogniseMedicationsFn path
// (which is a bulk parser). This is for incremental UI suggestions.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabase } from "./public-supabase-middleware";

function isMissingSchema(message: string): boolean {
  return /schema cache/i.test(message) || /does not exist/i.test(message);
}

export type AutocompleteSuggestion = {
  conceptId: string;
  genericName: string;
  brandName: string | null;
  drugClasses: string[];
  /** How strong the match was: exact | brand | alias | fuzzy */
  matchType: "exact" | "brand" | "alias" | "fuzzy";
  confidence: number;
};

export const medicationAutocompleteFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .inputValidator((d: { query: string; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<AutocompleteSuggestion[]> => {
    const db = context.supabase as unknown as SupabaseClient;
    const raw = (data.query ?? "").trim();
    const limit = Math.min(Math.max(data.limit ?? 6, 1), 20);
    if (raw.length < 2) return [];

    const like = `%${raw}%`;
    const lc = raw.toLowerCase();

    try {
      // 1. medication_names by ilike (uses trigram index)
      const { data: nameRows, error } = await db
        .from("medication_names")
        .select(
          "concept_id, name, name_type, medication_concepts(canonical_name, drug_classes)",
        )
        .ilike("name", like)
        .limit(limit * 4);
      if (error) {
        if (isMissingSchema(error.message)) return [];
        throw new Error(error.message);
      }

      const byConcept = new Map<
        string,
        {
          genericName: string;
          drugClasses: string[];
          brands: Set<string>;
          aliases: Set<string>;
          matchType: AutocompleteSuggestion["matchType"];
          confidence: number;
        }
      >();

      for (const row of nameRows ?? []) {
        const cid = row.concept_id as string;
        if (!cid) continue;
        const concept = row.medication_concepts as unknown as
          | { canonical_name?: string; drug_classes?: string[] }
          | { canonical_name?: string; drug_classes?: string[] }[]
          | null;
        const c = Array.isArray(concept) ? concept[0] : concept;
        const generic = (c?.canonical_name as string) ?? "";
        const classes = (c?.drug_classes as string[] | null) ?? [];
        if (!generic) continue;

        const entry =
          byConcept.get(cid) ??
          {
            genericName: generic,
            drugClasses: classes,
            brands: new Set<string>(),
            aliases: new Set<string>(),
            matchType: "fuzzy" as const,
            confidence: 0,
          };

        const name = (row.name as string) ?? "";
        const nameType = (row.name_type as string) ?? "alias";
        const nameLc = name.toLowerCase();
        if (nameLc === lc) {
          entry.matchType = "exact";
          entry.confidence = Math.max(entry.confidence, 100);
        } else if (nameType === "brand" && entry.matchType !== "exact") {
          entry.matchType = entry.matchType === "fuzzy" ? "brand" : entry.matchType;
          entry.confidence = Math.max(entry.confidence, 80);
        } else if (entry.matchType !== "exact" && entry.matchType !== "brand") {
          entry.matchType = "alias";
          entry.confidence = Math.max(entry.confidence, 60);
        } else {
          entry.confidence = Math.max(entry.confidence, 40);
        }

        if (nameType === "brand") entry.brands.add(name);
        else if (nameType === "alias" || nameType === "spelling_variant" || nameType === "abbreviation") entry.aliases.add(name);

        byConcept.set(cid, entry);
      }

      const results: AutocompleteSuggestion[] = [];
      for (const [cid, entry] of byConcept) {
        results.push({
          conceptId: cid,
          genericName: entry.genericName,
          brandName: entry.brands.size > 0 ? Array.from(entry.brands)[0] : null,
          drugClasses: entry.drugClasses,
          matchType: entry.matchType,
          confidence: entry.confidence,
        });
      }

      results.sort((a, b) => b.confidence - a.confidence);
      return results.slice(0, limit);
    } catch (e) {
      if (e instanceof Error && isMissingSchema(e.message)) return [];
      throw e;
    }
  });
