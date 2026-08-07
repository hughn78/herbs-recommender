// Phase 11 — governed-catalogue browser server functions.
//
// Staff-facing catalogue reads. Unlike the engine loader
// (catalogue-products.ts, approved-only), the browser shows every catalogue
// product with its review status so pharmacists can see the full corpus and
// the governance queue. All reads are authenticated-staff only; the tables
// are RLS-readable by any authenticated session.
//
// The generated Database types predate the governed catalogue, so these
// queries run through the untyped SupabaseClient like the other catalogue
// loaders.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProductImageRef } from "./recommend-products";

export type CatalogueProductSummary = {
  hogCode: string;
  name: string;
  brand: string | null;
  category: string | null;
  dosageForm: string | null;
  reviewStatus: string;
  sourcePage: number | null;
  packSizes: string[];
  clinicalUseTags: string[];
  avoidIfTags: string[];
  image: ProductImageRef | null;
};

export type CatalogueIngredient = {
  name: string;
  form: string | null;
  strength: string | null;
  strengthUnit: string | null;
  equivalentAmount: string | null;
  equivalentUnit: string | null;
  equivalentName: string | null;
};

export type CatalogueProductDetail = CatalogueProductSummary & {
  austl: string | null;
  ingredients: CatalogueIngredient[];
  indications: Array<{ text: string; clinicalUseTag: string | null; sourcePage: number | null }>;
  warnings: Array<{ text: string; warningType: string | null; avoidIfTags: string[]; sourcePage: number | null }>;
  interactions: Array<{
    text: string;
    interactingMedicine: string | null;
    severity: string | null;
    action: string | null;
    sourcePage: number | null;
  }>;
  directions: { adultDose: string | null; childDose: string | null; rawText: string | null } | null;
  counsellingFlags: string[];
  claimCount: number;
};

function asArray<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((v) => (v ?? "").trim()).filter((v) => v.length > 0)),
  );
}

const SUMMARY_SELECT = `
  hog_code, name, brand, category, dosage_form, review_status, status, source_page,
  product_variants(pack_size, status),
  product_keywords(keyword, keyword_type, approved),
  product_images(storage_path, alt_text, width, height, is_primary)
`;

const DETAIL_SELECT = `
  hog_code, name, brand, category, dosage_form, review_status, status, source_page, austl,
  product_variants(pack_size, status),
  product_keywords(keyword, keyword_type, approved),
  product_images(storage_path, alt_text, width, height, is_primary),
  product_ingredients(
    ingredient_form, strength, strength_unit,
    equivalent_amount, equivalent_unit, equivalent_name, raw_text,
    ingredients(canonical_name)
  ),
  product_indications(text, clinical_use_tag, source_page),
  product_warnings(text, warning_type, avoid_if_tags, source_page),
  product_interaction_flags(interaction_text, interacting_medicine_or_class, severity, action, source_page),
  product_directions(adult_dose, child_dose, raw_text)
`;

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapImage(row: any): ProductImageRef | null {
  const images = asArray(row.product_images).filter((i: any) => !!i?.storage_path);
  if (!images.length) return null;
  const pick = images.find((i: any) => i.is_primary) ?? images[0];
  return {
    storage_path: pick.storage_path,
    alt_text: pick.alt_text ?? null,
    width: pick.width ?? null,
    height: pick.height ?? null,
  };
}

function keywordsOfType(row: any, type: string): string[] {
  return cleanStrings(
    asArray(row.product_keywords)
      .filter((k: any) => k?.keyword_type === type && k?.approved !== false)
      .map((k: any) => k?.keyword),
  );
}

function mapSummary(row: any): CatalogueProductSummary {
  return {
    hogCode: row.hog_code,
    name: row.name,
    brand: row.brand ?? null,
    category: row.category ?? null,
    dosageForm: row.dosage_form ?? null,
    reviewStatus: row.review_status ?? "needs_review",
    sourcePage: row.source_page ?? null,
    packSizes: cleanStrings(
      asArray(row.product_variants)
        .filter((v: any) => !v?.status || v.status === "current")
        .map((v: any) => v?.pack_size),
    ),
    clinicalUseTags: keywordsOfType(row, "clinical_use_tag"),
    avoidIfTags: keywordsOfType(row, "avoid_if_tag"),
    image: mapImage(row),
  };
}

function mapDetail(row: any, claimCount: number): CatalogueProductDetail {
  const directions = asArray(row.product_directions)[0];
  return {
    ...mapSummary(row),
    austl: row.austl ?? null,
    ingredients: asArray(row.product_ingredients).map((i: any) => {
      const joined = asArray(i?.ingredients)[0]?.canonical_name;
      return {
        name: (joined ?? i?.raw_text ?? "").trim() || "Unnamed ingredient",
        form: i?.ingredient_form ?? null,
        strength: i?.strength ?? null,
        strengthUnit: i?.strength_unit ?? null,
        equivalentAmount: i?.equivalent_amount ?? null,
        equivalentUnit: i?.equivalent_unit ?? null,
        equivalentName: i?.equivalent_name ?? null,
      };
    }),
    indications: asArray(row.product_indications).map((i: any) => ({
      text: i?.text ?? "",
      clinicalUseTag: i?.clinical_use_tag ?? null,
      sourcePage: i?.source_page ?? null,
    })),
    warnings: asArray(row.product_warnings).map((w: any) => ({
      text: w?.text ?? "",
      warningType: w?.warning_type ?? null,
      avoidIfTags: Array.isArray(w?.avoid_if_tags) ? w.avoid_if_tags : [],
      sourcePage: w?.source_page ?? null,
    })),
    interactions: asArray(row.product_interaction_flags).map((x: any) => ({
      text: x?.interaction_text ?? "",
      interactingMedicine: x?.interacting_medicine_or_class ?? null,
      severity: x?.severity ?? null,
      action: x?.action ?? null,
      sourcePage: x?.source_page ?? null,
    })),
    directions: directions
      ? {
          adultDose: directions.adult_dose ?? null,
          childDose: directions.child_dose ?? null,
          rawText: directions.raw_text ?? null,
        }
      : null,
    counsellingFlags: keywordsOfType(row, "counselling_flag"),
    claimCount,
  };
}

export type CatalogueListResult =
  | { available: true; products: CatalogueProductSummary[] }
  | { available: false; reason: string };

/**
 * All current catalogue products for the staff browser, any review status.
 * `available: false` means the governed catalogue is not reachable yet
 * (migration not applied) — the page then falls back to the legacy list.
 */
export const listCatalogueProductsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CatalogueListResult> => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data, error } = await db
      .from("catalogue_products")
      .select(SUMMARY_SELECT)
      .eq("status", "current")
      .order("hog_code", { ascending: true });
    if (error) return { available: false, reason: error.message };
    return {
      available: true,
      products: ((data ?? []) as any[]).map(mapSummary),
    };
  });

/** Full structured detail for one product, including evidence-claim count. */
export const getCatalogueProductFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hogCode: string }) => d)
  .handler(async ({ data, context }): Promise<CatalogueProductDetail | null> => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: row, error } = await db
      .from("catalogue_products")
      .select(DETAIL_SELECT)
      .eq("hog_code", data.hogCode)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const { count } = await db
      .from("source_claims")
      .select("claim_id", { count: "exact", head: true })
      .eq("hog_code", data.hogCode);

    return mapDetail(row, count ?? 0);
  });
