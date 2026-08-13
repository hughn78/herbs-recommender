// Catalogue coverage report.
//
// Reads the governed catalogue tables and reports how complete the
// data is. Designed to give pharmacists and staff an honest view of
// what's well-evidenced, what needs governance review, and what is
// missing entirely.
//
// Clinical invariants preserved:
//   - An unreviewed product defaults to "needs review" status and is
//     never reported as safely recommendable.
//   - Missing warning fields are flagged as "unconfirmed" — they are
//     NEVER interpreted as "no warning". The consumer of this report
//     is responsible for distinguishing the two states.
//   - Missing ingredient fields are reported but do not flip the
//     product's recommendability in either direction on their own.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabase } from "./public-supabase-middleware";

function isMissingSchema(message: string): boolean {
  return /schema cache/i.test(message) || /does not exist/i.test(message);
}

export type CoverageFieldStat = {
  total: number;
  populated: number;
  missing: number;
  /** Empty/null/whitespace treated as missing. */
  missingHogCodes: string[];
};

export type CoverageReport = {
  /** True when the catalogue tables are present. */
  available: boolean;
  reason?: string;
  /** Total catalogue products visible. */
  totalProducts: number;
  byReviewStatus: Record<string, number>;
  byConfidence: Record<string, number>;
  fields: {
    ingredients: CoverageFieldStat;
    warnings: CoverageFieldStat;
    dosage: CoverageFieldStat;
    packShots: CoverageFieldStat;
    citations: CoverageFieldStat;
  };
  generatedAt: string;
};

function statFor(
  rows: Array<Record<string, unknown>>,
  isPopulated: (r: Record<string, unknown>) => boolean,
  hogCodeOf: (r: Record<string, unknown>) => string | null,
): CoverageFieldStat {
  const total = rows.length;
  const missing: string[] = [];
  for (const r of rows) {
    if (!isPopulated(r)) {
      const hog = hogCodeOf(r);
      if (hog) missing.push(hog);
    }
  }
  return {
    total,
    populated: total - missing.length,
    missing: missing.length,
    missingHogCodes: missing.slice(0, 50),
  };
}

export const catalogueCoverageFn = createServerFn({ method: "GET" })
  .middleware([publicSupabase])
  .handler(async ({ context }): Promise<CoverageReport> => {
    const db = context.supabase as unknown as SupabaseClient;

    const baseReport: CoverageReport = {
      available: false,
      reason: "Catalogue tables not migrated",
      totalProducts: 0,
      byReviewStatus: {},
      byConfidence: {},
      fields: {
        ingredients: { total: 0, populated: 0, missing: 0, missingHogCodes: [] },
        warnings: { total: 0, populated: 0, missing: 0, missingHogCodes: [] },
        dosage: { total: 0, populated: 0, missing: 0, missingHogCodes: [] },
        packShots: { total: 0, populated: 0, missing: 0, missingHogCodes: [] },
        citations: { total: 0, populated: 0, missing: 0, missingHogCodes: [] },
      },
      generatedAt: new Date().toISOString(),
    };

    let products: Array<Record<string, unknown>> = [];
    try {
      const { data, error } = await db
        .from("catalogue_products")
        .select("product_id, hog_code, name, brand, review_status, source_url, source_page, dosage_form, product_images(storage_path, is_primary), product_ingredients(ingredient_form, raw_text), product_warnings(text), product_variants(pack_size, status), product_indications(text), product_interaction_flags(interaction_text)")
        .limit(2000);
      if (error) throw new Error(error.message);
      products = (data ?? []) as Array<Record<string, unknown>>;
    } catch (e) {
      return { ...baseReport, reason: e instanceof Error ? e.message : String(e) };
    }

    if (products.length === 0) {
      return { ...baseReport, reason: "Catalogue is empty" };
    }

    const hogCodeOf = (r: Record<string, unknown>) =>
      (r.hog_code as string | null) ?? (r.product_id as string | null);

    // 1. Review status histogram
    const byReviewStatus: Record<string, number> = {};
    for (const p of products) {
      const s = (p.review_status as string | null) ?? "unreviewed";
      byReviewStatus[s] = (byReviewStatus[s] ?? 0) + 1;
    }

    // 2. Source-confidence proxy: presence of source_url or source_page
    const byConfidence: Record<string, number> = {};
    for (const p of products) {
      const hasUrl = !!p.source_url;
      const hasPage = typeof p.source_page === "number" && p.source_page > 0;
      const bucket = hasUrl && hasPage ? "high" : hasUrl || hasPage ? "medium" : "low";
      byConfidence[bucket] = (byConfidence[bucket] ?? 0) + 1;
    }

    // 3. Field stats
    const ingredients = statFor(
      products,
      (r) => {
        const arr = r.product_ingredients;
        return Array.isArray(arr) && (arr as unknown[]).length > 0;
      },
      hogCodeOf,
    );
    const warnings = statFor(
      products,
      (r) => {
        const arr = r.product_warnings;
        return Array.isArray(arr) && (arr as unknown[]).length > 0;
      },
      hogCodeOf,
    );
    const dosage = statFor(
      products,
      (r) => {
        const form = r.dosage_form;
        const ind = r.product_indications;
        return (
          (typeof form === "string" && form.trim().length > 0) ||
          (Array.isArray(ind) && (ind as unknown[]).length > 0)
        );
      },
      hogCodeOf,
    );
    const packShots = statFor(
      products,
      (r) => {
        const imgs = r.product_images;
        if (!Array.isArray(imgs) || (imgs as unknown[]).length === 0) return false;
        const primary = (imgs as Array<{ is_primary?: boolean | null; storage_path?: string | null }>).find(
          (i) => i.is_primary,
        );
        const pick = primary ?? (imgs as Array<{ storage_path?: string | null }>)[0];
        return !!pick?.storage_path;
      },
      hogCodeOf,
    );
    const citations = statFor(
      products,
      (r) => {
        const url = r.source_url;
        const page = r.source_page;
        return (typeof url === "string" && url.trim().length > 0) ||
          (typeof page === "number" && page > 0);
      },
      hogCodeOf,
    );

    return {
      available: true,
      totalProducts: products.length,
      byReviewStatus,
      byConfidence,
      fields: { ingredients, warnings, dosage, packShots, citations },
      generatedAt: new Date().toISOString(),
    };
  });

// Helper used by the dashboard route to decide whether a missing-warning
// finding is severe enough to drop the product below the precision floor.
export function missingWarningsImplyUnconfirmed(report: CoverageReport, hogCode: string): boolean {
  return report.fields.warnings.missingHogCodes.includes(hogCode);
}

// Re-export for tests.
export { isMissingSchema };
