// Global counterpoint search.
//
// One server function that runs a small set of targeted queries against
// the governed data sources and returns a categorised result set. The
// result is intentionally narrow: each category lists the top matches
// from its own table; nothing here tries to blend them with semantic
// similarity (which would weaken the exact-match primacy that matters
// for clinical safety).
//
// Privacy/access:
//   - All queries run through publicSupabase so they use the
//     publishable-key + RLS-respecting client.
//   - Restricted admin tables are NOT touched here.
//   - Patient cases are searched by case_label only (which is free-text
//     and contains no patient identifiers by convention).
//
// Categories returned:
//   - medicines          (medication_concepts + medication_names)
//   - ingredients        (ingredients canonical names)
//   - products           (catalogue_products)
//   - indications        (product_indications.text)
//   - warnings           (product_warnings.text)
//   - references         (medication_assertions.statement)

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabase } from "./public-supabase-middleware";

function isMissingSchema(message: string): boolean {
  return /schema cache/i.test(message) || /does not exist/i.test(message);
}

export type SearchCategory =
  | "medicines"
  | "ingredients"
  | "products"
  | "indications"
  | "warnings"
  | "references";

export type SearchHit = {
  id: string;
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  /** Optional deep-link to the matching detail page. */
  href?: string | null;
  /** Source provenance label. */
  source?: string | null;
  /** Display hint for matched-term highlighting. The route uses this as a
   *  case-insensitive substring match. */
  matchHint?: string | null;
};

export type SearchResponse = {
  query: string;
  total: number;
  byCategory: Record<SearchCategory, SearchHit[]>;
  /** Top-level warning, e.g. when one or more tables are not migrated. */
  warning?: string;
  /** True when ANY category returned at least one hit. */
  hasResults: boolean;
};

function dedupeHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const k = `${h.id}::${h.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

async function safe<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<{ value: T; missing: boolean }> {
  try {
    const value = await fn();
    return { value, missing: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingSchema(msg)) return { value: fallback, missing: true };
    throw e;
  }
}

export const globalSearchFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .inputValidator((d: { query: string; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<SearchResponse> => {
    const db = context.supabase as unknown as SupabaseClient;
    const q = (data.query ?? "").trim();
    const limit = Math.min(Math.max(data.limit ?? 8, 1), 25);
    if (!q) {
      return {
        query: "",
        total: 0,
        byCategory: {
          medicines: [],
          ingredients: [],
          products: [],
          indications: [],
          warnings: [],
          references: [],
        },
        hasResults: false,
      };
    }

    const like = `%${q}%`;
    const warnings: string[] = [];

    // -----------------------------------------------------------------
    // 1. Medicines — canonical_name + medication_names.name
    // -----------------------------------------------------------------
    const medicines: SearchHit[] = [];
    const medRes = await safe(async () => {
      const [{ data: byName, error: nErr }, { data: byCanonical, error: cErr }] =
        await Promise.all([
          db
            .from("medication_names")
            .select("concept_id, name, name_type, medication_concepts(canonical_name, drug_classes, brands)")
            .ilike("name", like)
            .limit(limit * 4),
          db
            .from("medication_concepts")
            .select("concept_id, canonical_name, drug_classes")
            .ilike("canonical_name", like)
            .limit(limit),
        ]);
      if (nErr) throw new Error(nErr.message);
      if (cErr) throw new Error(cErr.message);

      const hits: SearchHit[] = [];
      const seen = new Set<string>();

      // Exact (case-insensitive) match on canonical_name wins.
      const lc = q.toLowerCase();
      for (const c of byCanonical ?? []) {
        if (c.canonical_name?.toLowerCase() === lc) {
          hits.push({
            id: c.concept_id as string,
            title: c.canonical_name as string,
            subtitle: ((c.drug_classes as string[] | null) ?? []).join(" · "),
            href: `/app/medicines/${c.concept_id}`,
            source: "AMH/eMIMS",
            matchHint: c.canonical_name as string,
          });
          seen.add(c.concept_id as string);
        }
      }

      // Then everything else, exact brand matches outrank fuzzy.
      const sortedNames = (byName ?? []).slice().sort((a, b) => {
        const aExact = (a.name as string).toLowerCase() === lc ? 0 : 1;
        const bExact = (b.name as string).toLowerCase() === lc ? 0 : 1;
        return aExact - bExact;
      });

      for (const n of sortedNames) {
        const cid = n.concept_id as string;
        if (seen.has(cid)) continue;
        if (hits.length >= limit) break;
        const concept = n.medication_concepts as unknown as
          | { canonical_name?: string; drug_classes?: string[] }
          | { canonical_name?: string; drug_classes?: string[] }[]
          | null;
        const c = Array.isArray(concept) ? concept[0] : concept;
        hits.push({
          id: cid,
          title: (c?.canonical_name as string) ?? (n.name as string),
          subtitle: n.name_type === "brand" ? `Brand: ${n.name}` : `Generic: ${n.name}`,
          href: `/app/medicines/${cid}`,
          source: "AMH/eMIMS",
          matchHint: n.name as string,
        });
        seen.add(cid);
      }

      return hits;
    }, [] as SearchHit[]);
    if (medRes.missing) warnings.push("Medication intelligence tables not migrated");
    medicines.push(...dedupeHits(medRes.value));

    // -----------------------------------------------------------------
    // 2. Ingredients — ingredients.canonical_name
    // -----------------------------------------------------------------
    const ingredients: SearchHit[] = [];
    const ingRes = await safe<SearchHit[]>(async () => {
      const { data, error } = await db
        .from("ingredients")
        .select("ingredient_id, canonical_name, synonyms")
        .or(`canonical_name.ilike.${like},synonyms.cs.{${q}}`)
        .limit(limit);
      if (error) throw new Error(error.message);
      const hits: SearchHit[] = (data ?? []).map((r) => ({
        id: r.ingredient_id as string,
        title: r.canonical_name as string,
        subtitle: null,
        href: `/app/products?ingredient=${encodeURIComponent(r.canonical_name as string)}`,
        source: "Herbs of Gold catalogue",
        matchHint: r.canonical_name as string,
      }));
      return hits;
    }, [] as SearchHit[]);
    if (ingRes.missing) warnings.push("Ingredients table not migrated");
    ingredients.push(...ingRes.value);

    // -----------------------------------------------------------------
    // 3. Products — catalogue_products.name / brand / hog_code
    // -----------------------------------------------------------------
    const products: SearchHit[] = [];
    const prodRes = await safe<SearchHit[]>(async () => {
      const { data, error } = await db
        .from("catalogue_products")
        .select("product_id, hog_code, name, brand, review_status")
        .or(`name.ilike.${like},brand.ilike.${like},hog_code.ilike.${like}`)
        .limit(limit);
      if (error) throw new Error(error.message);
      const lc = q.toLowerCase();
      type WithPrio = SearchHit & { _priority: number };
      const withPrio: WithPrio[] = (data ?? []).map((r) => ({
        id: (r.product_id as string) ?? (r.hog_code as string),
        title: r.name as string,
        subtitle: [r.brand, r.hog_code].filter(Boolean).join(" · "),
        detail: r.review_status as string,
        href: `/app/products/${r.hog_code as string}`,
        source: "Herbs of Gold catalogue",
        matchHint: (r.name as string) ?? (r.hog_code as string),
        // Sort priority: exact canonical-name match > exact hog_code > everything else
        _priority:
          (r.name as string)?.toLowerCase() === lc
            ? 0
            : (r.hog_code as string)?.toLowerCase() === lc
              ? 1
              : 2,
      }));
      withPrio.sort((a, b) => a._priority - b._priority);
      return withPrio.map(({ _priority: _, ...hit }) => hit as SearchHit);
    }, [] as SearchHit[]);
    if (prodRes.missing) warnings.push("Catalogue table not migrated");
    products.push(...prodRes.value);

    // -----------------------------------------------------------------
    // 4. Indications — product_indications.text
    // -----------------------------------------------------------------
    const indications: SearchHit[] = [];
    const indRes = await safe<SearchHit[]>(async () => {
      const { data, error } = await db
        .from("product_indications")
        .select("indication_id, text, clinical_use_tag, catalogue_products(hog_code, name)")
        .ilike("text", like)
        .limit(limit);
      if (error) throw new Error(error.message);
      const hits: SearchHit[] = (data ?? []).map((r) => {
        const prod = r.catalogue_products as unknown as
          | { hog_code?: string; name?: string }
          | { hog_code?: string; name?: string }[]
          | null;
        const p = Array.isArray(prod) ? prod[0] : prod;
        return {
          id: r.indication_id as string,
          title: truncate(r.text as string, 140),
          subtitle: p?.name ?? null,
          href: p?.hog_code ? `/app/products/${p.hog_code}` : null,
          source: "Herbs of Gold catalogue",
          matchHint: r.text as string,
        };
      });
      return hits;
    }, [] as SearchHit[]);
    if (indRes.missing) warnings.push("Product indications table not migrated");
    indications.push(...indRes.value);

    // -----------------------------------------------------------------
    // 5. Warnings — product_warnings.text
    // -----------------------------------------------------------------
    const warningsHits: SearchHit[] = [];
    const warnRes = await safe<SearchHit[]>(async () => {
      const { data, error } = await db
        .from("product_warnings")
        .select("warning_id, text, catalogue_products(hog_code, name)")
        .ilike("text", like)
        .limit(limit);
      if (error) throw new Error(error.message);
      const hits: SearchHit[] = (data ?? []).map((r) => {
        const prod = r.catalogue_products as unknown as
          | { hog_code?: string; name?: string }
          | { hog_code?: string; name?: string }[]
          | null;
        const p = Array.isArray(prod) ? prod[0] : prod;
        return {
          id: r.warning_id as string,
          title: truncate(r.text as string, 140),
          subtitle: p?.name ?? null,
          href: p?.hog_code ? `/app/products/${p.hog_code}` : null,
          source: "Herbs of Gold catalogue",
          matchHint: r.text as string,
        };
      });
      return hits;
    }, [] as SearchHit[]);
    if (warnRes.missing) warnings.push("Product warnings table not migrated");
    warningsHits.push(...warnRes.value);

    // -----------------------------------------------------------------
    // 6. References — medication_assertions.statement (search short
    //    provenance-stamped excerpts, not full documents).
    // -----------------------------------------------------------------
    const references: SearchHit[] = [];
    const refRes = await safe<SearchHit[]>(async () => {
      const { data, error } = await db
        .from("medication_assertions")
        .select("assertion_id, statement, source_code, source_section, review_status, medication_concepts(canonical_name)")
        .ilike("statement", like)
        .limit(limit);
      if (error) throw new Error(error.message);
      const hits: SearchHit[] = (data ?? []).map((r) => {
        const concept = r.medication_concepts as unknown as
          | { canonical_name?: string }
          | { canonical_name?: string }[]
          | null;
        const c = Array.isArray(concept) ? concept[0] : concept;
        return {
          id: r.assertion_id as string,
          title: truncate(r.statement as string, 180),
          subtitle: [c?.canonical_name, r.source_section].filter(Boolean).join(" · "),
          href: c?.canonical_name
            ? `/app/medicines?q=${encodeURIComponent(c.canonical_name as string)}`
            : null,
          source: r.source_code as string,
          matchHint: r.statement as string,
        };
      });
      return hits;
    }, [] as SearchHit[]);
    if (refRes.missing) warnings.push("Medication assertions table not migrated");
    references.push(...refRes.value);

    const byCategory: Record<SearchCategory, SearchHit[]> = {
      medicines,
      ingredients,
      products,
      indications,
      warnings: warningsHits,
      references,
    };
    const total = Object.values(byCategory).reduce((n, hits) => n + hits.length, 0);
    const dedupedWarnings = Array.from(new Set(warnings));
    return {
      query: q,
      total,
      byCategory,
      warning: dedupedWarnings.length > 0 ? dedupedWarnings.join("; ") : undefined,
      hasResults: total > 0,
    };
  });
