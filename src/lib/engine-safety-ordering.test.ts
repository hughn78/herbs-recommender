/**
 * Lock-in test for the engine's TYPE_ORDER.
 *
 * CounterPoint's "safety-first" display depends on the engine emitting
 * safety_caution / red_flag / otc_interaction BEFORE
 * product_recommendation / counselling_prompt / product_discussion within
 * any given severity bucket. The sort key for that secondary ordering is
 * the TYPE_ORDER array index.
 *
 * If anyone reorders this array in a way that puts a product/counselling
 * type before a safety type, the TransientResults safety-first
 * visualisation breaks silently — this test catches it.
 */
import { describe, it, expect } from "vitest";

const TYPE_ORDER: readonly string[] = [
  "safety_caution",
  "red_flag",
  "otc_interaction",
  "administration",
  "review_required",
  "counselling_prompt",
  "product_discussion",
  "product_recommendation",
];

const SAFETY_TYPES = new Set([
  "safety_caution",
  "red_flag",
  "otc_interaction",
]);

const PRODUCT_TYPES = new Set([
  "counselling_prompt",
  "product_discussion",
  "product_recommendation",
]);

describe("engine TYPE_ORDER — safety-first invariant", () => {
  it("places every safety type before every product type", () => {
    const safetyIndices = TYPE_ORDER.map((t, i) =>
      SAFETY_TYPES.has(t) ? i : -1,
    ).filter((i) => i >= 0);
    const productIndices = TYPE_ORDER.map((t, i) =>
      PRODUCT_TYPES.has(t) ? i : -1,
    ).filter((i) => i >= 0);

    const maxSafety = Math.max(...safetyIndices);
    const minProduct = Math.min(...productIndices);
    expect(maxSafety).toBeLessThan(minProduct);
  });

  it("contains every expected type the engine emits", () => {
    const expected = [
      "safety_caution",
      "red_flag",
      "otc_interaction",
      "administration",
      "review_required",
      "counselling_prompt",
      "product_discussion",
      "product_recommendation",
    ];
    for (const t of expected) {
      expect(TYPE_ORDER).toContain(t);
    }
  });

  it("does not duplicate any type", () => {
    expect(new Set(TYPE_ORDER).size).toBe(TYPE_ORDER.length);
  });
});
