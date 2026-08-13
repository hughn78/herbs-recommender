// Tests for the Therapeutic Guidelines context gating.
//
// These tests verify the conservative relevance gate: TG context fires
// ONLY when (a) symptoms/goal/history contains an allow-listed clinical
// concept AND (b) the tg_chunks query returns matching active rows.
// Empty / unknown input must never produce a TG rec.

import { describe, expect, it } from "vitest";
import { attachTgContext } from "./retrieval";
import type { GeneratedRec } from "./engine";

function makeRec(overrides: Partial<GeneratedRec> = {}): GeneratedRec {
  return {
    recommendation_type: "counselling_prompt",
    title: "Magnesium could be worth a conversation",
    confidence: "Medium",
    confidence_score: 55,
    severity_tier: "minor",
    score: 500,
    rank: 0,
    why_triggered: "Symptom or goal mentioned: \"cramp\"",
    rationale: {
      confidence: 55,
      evidenceLevel: "moderate",
      severity: "minor",
      mechanism: "clinical",
      ruleFired: "engine:symptom_map:magnesium",
      ruleSource: "curated",
      matchedFactors: [{ factor: "symptom", value: "cramp", matched: true }],
      alternatives: [],
      safetyNet: "Return if cramps worsen.",
      advice: "If proceeding, trial magnesium glycinate.",
    },
    pharmacist_checks: [],
    talking_points: [],
    safety_cautions: [],
    interaction_notes: [],
    matched_medicines: [],
    matched_patient_factors: [],
    source_references: [],
    ...overrides,
  };
}

type QueryCall = {
  topicArea?: string;
  keyword: string;
  rows: Array<{ source_url: string; title: string; excerpt: string }>;
};

function fakeSupabase(calls: { tg: QueryCall[] }) {
  let pendingKeyword = "";
  return {
    from(table: string) {
      if (table !== "tg_chunks") {
        throw new Error(`unexpected table: ${table}`);
      }
      const builder: any = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        or(expr: string) {
          // Extract the keyword (last ilike.%kw%) — we only need it to
          // pick which canned response to return.
          const m = expr.match(/ilike\.%([^%]+)%/);
          pendingKeyword = m?.[1] ?? "";
          return builder;
        },
        limit() {
          const rows = calls.tg.shift()?.rows ?? [];
          return Promise.resolve({ data: rows, error: null });
        },
        then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
          return this.limit().then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

type SourceRef = { source: string; tier_label: string; note: string; url?: string };

function refs(rec: GeneratedRec): SourceRef[] {
  return rec.source_references as SourceRef[];
}

describe("attachTgContext — relevance gating", () => {
  it("returns recs unchanged when symptoms contain no allow-listed concept", async () => {
    const supabase = fakeSupabase({ tg: [] });
    const recs = [makeRec()];
    const out = await attachTgContext(
      supabase as never,
      { symptoms: "sore toe from gardening", counselling_goal: "something for nails", medical_history: "" },
      recs,
    );
    expect(out).toBe(recs);
    expect(out).toHaveLength(1);
    expect(out[0].recommendation_type).toBe("counselling_prompt");
    expect(out[0].source_references).toHaveLength(0);
  });

  it("attaches TG provenance to an existing counselling_prompt when concept + row match", async () => {
    const supabase = fakeSupabase({
      tg: [
        {
          keyword: "reflux",
          rows: [
            {
              source_url: "https://tgldcdp.tg.org.au/gastrointestinal/gord",
              title: "GORD",
              excerpt: "Lifestyle measures first; PPIs for symptom control.",
            },
          ],
        },
      ],
    });
    const recs = [makeRec({ title: "Reflux counselling opportunity" })];
    const out = await attachTgContext(
      supabase as never,
      { symptoms: "occasional reflux after meals", counselling_goal: "", medical_history: "" },
      recs,
    );
    expect(out).toHaveLength(1);
    expect(refs(out[0]).length).toBeGreaterThan(0);
    expect(refs(out[0])[0]?.url).toMatch(/^https:\/\/tgldcdp\.tg\.org\.au\//);
    expect(refs(out[0])[0]?.tier_label).toBe("Therapeutic Guidelines");
  });

  it("does NOT fabricate TG context when the query returns rows but with non-TG URLs", async () => {
    const supabase = fakeSupabase({
      tg: [
        {
          keyword: "asthma",
          rows: [
            {
              source_url: "https://example.com/something-else",
              title: "Asthma overview",
              excerpt: "Fake excerpt.",
            },
          ],
        },
      ],
    });
    const recs = [makeRec()];
    const out = await attachTgContext(
      supabase as never,
      { symptoms: "asthma, SOB at night", counselling_goal: "", medical_history: "" },
      recs,
    );
    expect(out).toHaveLength(1);
    expect(out[0].source_references).toHaveLength(0);
  });

  it("creates a TG rec when no counselling_prompt host exists", async () => {
    const supabase = fakeSupabase({
      tg: [
        {
          keyword: "diabetes",
          rows: [
            {
              source_url: "https://tgldcdp.tg.org.au/diabetes/type2",
              title: "Type 2 diabetes",
              excerpt: "Lifestyle first; metformin first-line.",
            },
          ],
        },
      ],
    });
    const recs: GeneratedRec[] = [
      makeRec({ recommendation_type: "product_recommendation", title: "Magnesium (generic)" }),
    ];
    const out = await attachTgContext(
      supabase as never,
      { symptoms: "diabetes", counselling_goal: "", medical_history: "" },
      recs,
    );
    expect(out).toHaveLength(2);
    const tgRec = out.find((r) => r.recommendation_type === "counselling_prompt");
    expect(tgRec).toBeDefined();
    expect(tgRec?.title).toMatch(/Therapeutic Guidelines/);
    expect(refs(tgRec!)[0]?.url).toMatch(/tgldcdp\.tg\.org\.au/);
  });

  it("does not duplicate TG rec when a counselling_prompt already exists", async () => {
    const supabase = fakeSupabase({
      tg: [
        {
          keyword: "uti",
          rows: [
            {
              source_url: "https://tgldcdp.tg.org.au/antibiotic/uti",
              title: "UTI",
              excerpt: "Nitrofurantoin first-line for uncomplicated cystitis.",
            },
          ],
        },
      ],
    });
    const recs = [
      makeRec({ title: "Refer to GP if symptoms persist" }),
    ];
    const out = await attachTgContext(
      supabase as never,
      { symptoms: "burning when I pee, maybe UTI", counselling_goal: "", medical_history: "" },
      recs,
    );
    // Still one rec — TG provenance was attached, no duplicate.
    expect(out).toHaveLength(1);
    expect(refs(out[0]).length).toBeGreaterThan(0);
  });
});
