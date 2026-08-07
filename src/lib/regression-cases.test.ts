/**
 * Phase 15 — expanded regression cases D–H.
 *
 * These lock in the fixes delivered by the governed-catalogue mission:
 *
 *   CASE D — product-ranking flattening bug: per-product confidence and
 *            confidence_score must survive the engine conversion; two
 *            products with different match strengths must not collapse to
 *            identical scores.
 *   CASE E — per-product citations: catalogue source references
 *            (HOG-#### · PDF source page N) must reach the recommendation.
 *   CASE F — clinical/search ontology: consumer wording that only exists
 *            in the ontology ("tired all the time") must match products
 *            end-to-end against the real corpus catalogue.
 *   CASE G — product images: an approved pack shot on the catalogue row
 *            must be carried through to the recommendation.
 *   CASE H — engine integration: runEngine passes ontology maps through
 *            and emits product recs with citations, images and distinct
 *            confidence scores.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { recommendProducts, type ProductRow } from "./recommend-products";
import { buildTagMaps } from "./ontology";
import { runEngine } from "./engine";
import type { PatientCtx } from "./engine-types";

// Corpus lives in the repo workspace at docs/herbsofgold_scraped (gitignored —
// original scraped source material, do not modify). Override with
// HOG_CATALOGUE_PATH when running against a different copy.
const HOG_PATH =
  process.env.HOG_CATALOGUE_PATH ??
  path.join(
    __dirname,
    "../../docs/herbsofgold_scraped/HerbsOfGold_KnowledgeBase/output/herbs_of_gold_products.json",
  );

function loadCatalogue(): ProductRow[] {
  const raw = fs.readFileSync(HOG_PATH, "utf-8");
  const arr = JSON.parse(raw) as Array<{
    product_id: string;
    product_name: string;
    clinical_tags?: { clinical_use_tags?: string[]; avoid_if_tags?: string[] };
  }>;
  return arr.map((p) => ({
    product_id: p.product_id,
    name: p.product_name,
    brand: "Herbs of Gold",
    category: null,
    active_ingredients: [],
    indications: [],
    cautions: [],
    pack_sizes: [],
    schedule: null,
    reviewed: true,
    source_url: null,
    notes: null,
    clinical_use_tags: p.clinical_tags?.clinical_use_tags ?? [],
    avoid_if_tags: p.clinical_tags?.avoid_if_tags ?? [],
    medicine_interaction_flags: [],
    counselling_flags: [],
  }));
}

function baseCtx(overrides: Partial<PatientCtx>): PatientCtx {
  return {
    age: 40,
    sex: "female",
    pregnancy_status: "not_applicable",
    breastfeeding_status: "not_applicable",
    allergies: "NKDA",
    medical_history: "",
    symptoms: "",
    counselling_goal: "",
    existing_supplements: "",
    pathology_notes: "",
    confirmed_medications: [],
    ...overrides,
  };
}

function makeProduct(overrides: Partial<ProductRow>): ProductRow {
  return {
    product_id: "HOG-TEST-001",
    name: "Test Product",
    brand: "Herbs of Gold",
    category: null,
    active_ingredients: [],
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

describe("CASE D — ranking flattening stays fixed", () => {
  it("products with different match strengths keep distinct confidence scores", () => {
    const weak = makeProduct({
      product_id: "HOG-WEAK",
      name: "Weak Match",
      clinical_use_tags: ["magnesium_support"],
    });
    const strong = makeProduct({
      product_id: "HOG-STRONG",
      name: "Strong Match",
      clinical_use_tags: ["magnesium_support", "b12_support", "energy_support", "iron_support"],
    });
    // "fatigue" drives b12/iron/energy via the default symptom map; both
    // products match magnesium only via the cramp keyword — absent here —
    // so the strong product must outscore the weak one.
    const recs = recommendProducts(
      baseCtx({ symptoms: "fatigue and muscle cramp" }),
      [weak, strong],
      [],
    );
    const weakRec = recs.find((r) => r.product_id === "HOG-WEAK");
    const strongRec = recs.find((r) => r.product_id === "HOG-STRONG");
    expect(strongRec).toBeDefined();
    expect(weakRec).toBeDefined();
    expect(strongRec!.confidence_score).toBeGreaterThan(weakRec!.confidence_score);
    expect(strongRec!.score).toBeGreaterThan(weakRec!.score);
  });

  it("engine conversion preserves per-product confidence (no flat 50 collapse)", () => {
    const products = [
      makeProduct({
        product_id: "HOG-STRONG",
        name: "Strong Match",
        clinical_use_tags: ["magnesium_support", "b12_support", "energy_support", "iron_support"],
      }),
      makeProduct({
        product_id: "HOG-WEAK",
        name: "Weak Match",
        clinical_use_tags: ["magnesium_support"],
      }),
    ];
    const recs = runEngine(baseCtx({ symptoms: "fatigue and muscle cramp" }), [], products);
    const productRecs = recs.filter((r) => r.recommendation_type === "product_recommendation");
    expect(productRecs.length).toBe(2);
    const scores = productRecs.map((r) => r.confidence_score);
    expect(new Set(scores).size).toBe(2);
    // Rank must be a dense sequence after sorting.
    expect(recs.map((r) => r.rank)).toEqual(recs.map((_, i) => i));
  });
});

describe("CASE E — per-product citations", () => {
  it("catalogue source references reach the recommendation", () => {
    const product = makeProduct({
      product_id: "HOG-0001",
      name: "Magnesium Forte",
      clinical_use_tags: ["magnesium_support", "muscle_cramps"],
      source_references: [
        {
          source: "Herbs of Gold Technical Manual",
          tier_label: "Manufacturer product monograph",
          note: "HOG-0001 · PDF source page 42",
        },
      ],
    });
    const recs = recommendProducts(baseCtx({ symptoms: "night cramps" }), [product], []);
    expect(recs).toHaveLength(1);
    expect(recs[0].source_references[0].note).toContain("PDF source page 42");
    expect(recs[0].source_references[0].tier_label).toBe("Manufacturer product monograph");
  });
});

describe("CASE F — ontology consumer wording matches the real catalogue", () => {
  const catalogue = loadCatalogue();

  it("'tired all the time' (ontology-only wording) surfaces energy/B12 products", () => {
    const maps = buildTagMaps(
      [
        {
          concept_id: "c1",
          concept_type: "symptom",
          canonical_label: "fatigue",
          clinical_use_tags: ["b12_support", "iron_support", "energy_support"],
        },
      ],
      [
        { concept_id: "c1", term: "tired all the time", synonym_type: "consumer_wording", approved: true },
      ],
    );
    const recs = recommendProducts(
      baseCtx({ symptoms: "I'm tired all the time lately" }),
      catalogue,
      [],
      maps,
    );
    expect(recs.length).toBeGreaterThan(0);
    expect(
      recs.some((r) => r.matched_product_tags.includes("energy_support")),
    ).toBe(true);
  });
});

describe("CASE G — product images thread through", () => {
  it("a catalogue pack shot reaches the recommendation", () => {
    const product = makeProduct({
      product_id: "HOG-0002",
      name: "Magnesium Forte",
      clinical_use_tags: ["magnesium_support", "muscle_cramps"],
      image: {
        storage_path: "product-images/abc123.png",
        alt_text: "Magnesium Forte pack shot",
        width: 800,
        height: 800,
      },
    });
    const recs = recommendProducts(baseCtx({ symptoms: "leg cramps" }), [product], []);
    expect(recs).toHaveLength(1);
    expect(recs[0].image?.storage_path).toBe("product-images/abc123.png");
    expect(recs[0].image?.alt_text).toBe("Magnesium Forte pack shot");
  });
});

describe("CASE H — engine integration with ontology maps", () => {
  it("runEngine emits product recs carrying citations, images and distinct scores", () => {
    const products = [
      makeProduct({
        product_id: "HOG-0001",
        name: "Magnesium Forte",
        clinical_use_tags: ["magnesium_support", "muscle_cramps"],
        source_references: [
          {
            source: "Herbs of Gold Technical Manual",
            tier_label: "Manufacturer product monograph",
            note: "HOG-0001 · PDF source page 42",
          },
        ],
        image: {
          storage_path: "product-images/abc123.png",
          alt_text: "Magnesium Forte pack shot",
          width: 800,
          height: 800,
        },
      }),
      makeProduct({
        product_id: "HOG-0009",
        name: "Magnesium + B12 Combo",
        clinical_use_tags: ["magnesium_support", "muscle_cramps", "b12_support", "energy_support", "iron_support"],
      }),
    ];
    const maps = buildTagMaps(
      [
        {
          concept_id: "c1",
          concept_type: "symptom",
          canonical_label: "muscle cramps",
          clinical_use_tags: ["magnesium_support", "muscle_cramps"],
        },
        {
          concept_id: "c2",
          concept_type: "symptom",
          canonical_label: "fatigue",
          clinical_use_tags: ["b12_support", "iron_support", "energy_support"],
        },
      ],
      [
        { concept_id: "c1", term: "night cramps", synonym_type: "consumer_wording", approved: true },
        { concept_id: "c2", term: "tired all the time", synonym_type: "consumer_wording", approved: true },
      ],
    );
    const recs = runEngine(
      baseCtx({ symptoms: "night cramps and tired all the time" }),
      [],
      products,
      maps,
    );
    const productRecs = recs.filter((r) => r.recommendation_type === "product_recommendation");
    expect(productRecs.length).toBe(2);

    const forte = productRecs.find((r) => r.product_id === "HOG-0001");
    expect(forte?.image?.storage_path).toBe("product-images/abc123.png");
    expect(forte?.source_references[0].note).toContain("PDF source page 42");

    // The combo matches more tags and must rank above the single-tag product.
    const combo = productRecs.find((r) => r.product_id === "HOG-0009");
    expect(combo!.confidence_score).toBeGreaterThan(forte!.confidence_score);
    expect(combo!.rank).toBeLessThan(forte!.rank);
  });
});
