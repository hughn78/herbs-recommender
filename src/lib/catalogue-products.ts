// Phase 7 — governed-catalogue product loader.
//
// The clinical engine prefers the normalised Herbs of Gold catalogue
// (catalogue_products + relational children). It falls back to the legacy
// flat `products` table when the catalogue migration has not been applied or
// no products have passed clinical review yet. This preserves current
// behaviour during rollout while making approved catalogue data authoritative.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductImageRef, ProductRow, ProductSourceRef } from "./recommend-products";

const LEGACY_PRODUCT_SELECT =
  "product_id, name, brand, category, active_ingredients, indications, cautions, pack_sizes, schedule, reviewed, source_url, notes, clinical_use_tags, avoid_if_tags, medicine_interaction_flags, counselling_flags";

const CATALOGUE_PRODUCT_SELECT = `
  hog_code,
  name,
  brand,
  category,
  dosage_form,
  source_page,
  review_status,
  product_variants(pack_size, status),
  product_keywords(keyword, keyword_type, approved),
  product_ingredients(
    ingredient_form,
    strength,
    strength_unit,
    equivalent_amount,
    equivalent_unit,
    equivalent_name,
    raw_text,
    source_page,
    ingredients(canonical_name)
  ),
  product_indications(text, clinical_use_tag, source_page, review_status),
  product_warnings(text, avoid_if_tags, source_page, review_status),
  product_interaction_flags(interaction_text, flags, source_page),
  product_images(storage_path, alt_text, width, height, is_primary)
`;

type KeywordRow = {
  keyword: string | null;
  keyword_type: string | null;
  approved: boolean | null;
};

type VariantRow = { pack_size: string | null; status: string | null };

type IngredientJoinRow = {
  ingredient_form: string | null;
  strength: string | null;
  strength_unit: string | null;
  equivalent_amount: string | null;
  equivalent_unit: string | null;
  equivalent_name: string | null;
  raw_text: string | null;
  source_page: number | null;
  ingredients: { canonical_name: string | null } | { canonical_name: string | null }[] | null;
};

type IndicationRow = {
  text: string | null;
  clinical_use_tag: string | null;
  source_page: number | null;
  review_status: string | null;
};

type WarningRow = {
  text: string | null;
  avoid_if_tags: string[] | null;
  source_page: number | null;
  review_status: string | null;
};

type InteractionRow = {
  interaction_text: string | null;
  flags: string[] | null;
  source_page: number | null;
};

type ImageJoinRow = {
  storage_path: string | null;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  is_primary: boolean | null;
};

type CatalogueProductRow = {
  hog_code: string;
  name: string;
  brand: string | null;
  category: string | null;
  dosage_form: string | null;
  source_page: number | null;
  review_status: string;
  product_variants: VariantRow[] | VariantRow | null;
  product_keywords: KeywordRow[] | KeywordRow | null;
  product_ingredients: IngredientJoinRow[] | IngredientJoinRow | null;
  product_indications: IndicationRow[] | IndicationRow | null;
  product_warnings: WarningRow[] | WarningRow | null;
  product_interaction_flags: InteractionRow[] | InteractionRow | null;
  product_images: ImageJoinRow[] | ImageJoinRow | null;
};

export type EngineProductLoad = {
  products: ProductRow[];
  source: "catalogue" | "legacy" | "none";
  catalogueError?: string;
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

function ingredientDisplay(row: IngredientJoinRow): string | null {
  const joined = asArray(row.ingredients)[0]?.canonical_name?.trim();
  const base = joined || row.raw_text?.trim();
  if (!base) return null;
  const strength = [row.strength, row.strength_unit].filter(Boolean).join(" ").trim();
  // The engine uses active_ingredients for duplicate/suppression matching.
  // Keep the canonical name first; strength is display/provenance only.
  return strength ? `${base} ${strength}` : base;
}

function catalogueCitation(row: CatalogueProductRow): ProductSourceRef {
  return {
    source: "Herbs of Gold Technical Manual",
    tier_label: "Manufacturer product monograph",
    note: row.source_page
      ? `${row.hog_code} · PDF source page ${row.source_page}`
      : `${row.hog_code} · corpus product monograph`,
  };
}

function mapCatalogueProduct(row: CatalogueProductRow): ProductRow {
  const keywords = asArray(row.product_keywords).filter((k) => k.approved !== false);
  const keywordsOfType = (type: string) =>
    cleanStrings(
      keywords.filter((k) => k.keyword_type === type).map((k) => k.keyword),
    );

  const indications = cleanStrings(
    asArray(row.product_indications).map((i) => i.text),
  );
  const warnings = asArray(row.product_warnings);
  const interactions = asArray(row.product_interaction_flags);

  const clinicalUseTags = cleanStrings([
    ...keywordsOfType("clinical_use_tag"),
    ...asArray(row.product_indications).map((i) => i.clinical_use_tag),
  ]);
  const avoidIfTags = cleanStrings([
    ...keywordsOfType("avoid_if_tag"),
    ...warnings.flatMap((w) => w.avoid_if_tags ?? []),
  ]);
  const interactionFlags = cleanStrings([
    ...keywordsOfType("medicine_interaction_flag"),
    ...interactions.flatMap((x) => x.flags ?? []),
  ]);

  return {
    product_id: row.hog_code,
    name: row.name,
    brand: row.brand,
    category: row.category,
    active_ingredients: cleanStrings(
      asArray(row.product_ingredients).map(ingredientDisplay),
    ),
    indications,
    cautions: cleanStrings(warnings.map((w) => w.text)),
    pack_sizes: cleanStrings(
      asArray(row.product_variants)
        .filter((v) => !v.status || v.status === "current")
        .map((v) => v.pack_size),
    ),
    schedule: null,
    reviewed: true, // loader only returns review_status = approved products
    source_url: null,
    notes: row.dosage_form ? `Dosage form: ${row.dosage_form}` : null,
    clinical_use_tags: clinicalUseTags,
    avoid_if_tags: avoidIfTags,
    medicine_interaction_flags: interactionFlags,
    counselling_flags: keywordsOfType("counselling_flag"),
    source_references: [catalogueCitation(row)],
    image: primaryImage(row),
  };
}

/** Phase 8: pick the approved primary pack shot (fall back to the first
 *  image with a storage object). Images without an uploaded object are
 *  skipped so cards never render a broken image. */
function primaryImage(row: CatalogueProductRow): ProductImageRef | null {
  const images = asArray(row.product_images).filter((i) => !!i.storage_path);
  if (!images.length) return null;
  const pick = images.find((i) => i.is_primary) ?? images[0];
  return {
    storage_path: pick.storage_path as string,
    alt_text: pick.alt_text,
    width: pick.width,
    height: pick.height,
  };
}

function mapLegacyProduct(p: Record<string, unknown>): ProductRow {
  const strings = (key: string) =>
    Array.isArray(p[key]) ? (p[key] as string[]) : [];
  return {
    product_id: String(p.product_id),
    name: String(p.name),
    brand: (p.brand as string | null) ?? null,
    category: (p.category as string | null) ?? null,
    active_ingredients: strings("active_ingredients"),
    indications: strings("indications"),
    cautions: strings("cautions"),
    pack_sizes: strings("pack_sizes"),
    schedule: (p.schedule as string | null) ?? null,
    reviewed: !!p.reviewed,
    source_url: (p.source_url as string | null) ?? null,
    notes: (p.notes as string | null) ?? null,
    clinical_use_tags: strings("clinical_use_tags"),
    avoid_if_tags: strings("avoid_if_tags"),
    medicine_interaction_flags: strings("medicine_interaction_flags"),
    counselling_flags: strings("counselling_flags"),
  };
}

async function loadLegacyProducts(supabase: SupabaseClient): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select(LEGACY_PRODUCT_SELECT)
    .eq("reviewed", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => mapLegacyProduct(p as Record<string, unknown>));
}

/**
 * Load products for the deterministic engine.
 *
 * Governance rule: only `catalogue_products.review_status = 'approved'`
 * rows are eligible. If none exist (for example immediately after first
 * ingestion, before Phase 14 review), the legacy reviewed catalogue is used.
 */
export async function loadEngineProducts(
  supabase: SupabaseClient,
): Promise<EngineProductLoad> {
  let catalogueError: string | undefined;
  try {
    const { data, error } = await supabase
      .from("catalogue_products")
      .select(CATALOGUE_PRODUCT_SELECT)
      .eq("status", "current")
      .eq("review_status", "approved")
      .order("hog_code", { ascending: true });

    if (error) {
      catalogueError = error.message;
    } else if (data && data.length > 0) {
      return {
        products: (data as unknown as CatalogueProductRow[]).map(mapCatalogueProduct),
        source: "catalogue",
      };
    }
  } catch (e) {
    catalogueError = e instanceof Error ? e.message : String(e);
  }

  const legacy = await loadLegacyProducts(supabase);
  return {
    products: legacy,
    source: legacy.length ? "legacy" : "none",
    ...(catalogueError ? { catalogueError } : {}),
  };
}
