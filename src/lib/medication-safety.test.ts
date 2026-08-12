// Tests for medication safety engine, patient factor detection, and symptom reasoning.
import { describe, it, expect } from "vitest";
import { evaluateMedicationSafety, applySafetySignals } from "./medication-safety";
import { detectMedicationFactors, detectSymptomMedicationAlerts } from "./medication-reasoning";
import type { PatientCtx } from "./engine-types";
import type { MedicationConcept } from "./medication-knowledge";

function baseCtx(overrides: Partial<PatientCtx>): PatientCtx {
  return {
    age: 55,
    sex: "male",
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

const emptyConcepts: MedicationConcept[] = [];

describe("medication safety — anticoagulant + fish oil", () => {
  it("flags fish oil for anticoagulant patient", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "warfarin", drug_class: "anticoagulant" },
      ],
    });
    const signals = evaluateMedicationSafety(ctx, emptyConcepts);
    const fishOilSignal = signals.find((s) => s.rule_id === "anticoag_fish_oil");
    expect(fishOilSignal).toBeDefined();
    expect(fishOilSignal!.action).toBe("require_review");
    expect(fishOilSignal!.severity_tier).toBe("moderate");
  });

  it("flags apixaban via DOAC class", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "apixaban", drug_class: "doac" },
      ],
    });
    const signals = evaluateMedicationSafety(ctx, emptyConcepts);
    expect(signals.some((s) => s.rule_id === "anticoag_fish_oil")).toBe(true);
  });

  it("suppresses vitamin K for warfarin patient", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "warfarin", drug_class: "anticoagulant" },
      ],
    });
    const signals = evaluateMedicationSafety(ctx, emptyConcepts);
    const vitK = signals.find((s) => s.rule_id === "anticoag_vitamin_k");
    expect(vitK).toBeDefined();
    expect(vitK!.action).toBe("suppress");
    expect(vitK!.severity_tier).toBe("major");
  });
});

describe("medication safety — thyroid + minerals", () => {
  it("flags mineral timing for levothyroxine", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "levothyroxine", drug_class: "thyroid" },
      ],
    });
    const signals = evaluateMedicationSafety(ctx, emptyConcepts);
    const timing = signals.find((s) => s.rule_id === "thyroid_mineral_timing");
    expect(timing).toBeDefined();
    expect(timing!.action).toBe("admin_timing");
  });
});

describe("medication safety — tetracycline + minerals", () => {
  it("flags mineral timing for doxycycline", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "doxycycline", drug_class: "tetracycline" },
      ],
    });
    const signals = evaluateMedicationSafety(ctx, emptyConcepts);
    const timing = signals.find((s) => s.rule_id === "tetracycline_mineral_timing");
    expect(timing).toBeDefined();
    expect(timing!.action).toBe("admin_timing");
  });
});

describe("medication safety — SSRI + St John's Wort", () => {
  it("suppresses serotonergic supplements for SSRI patient", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "sertraline", drug_class: "ssri" },
      ],
    });
    const signals = evaluateMedicationSafety(ctx, emptyConcepts);
    const sjw = signals.find((s) => s.rule_id === "ssri_serotonergic");
    expect(sjw).toBeDefined();
    expect(sjw!.action).toBe("suppress");
    expect(sjw!.severity_tier).toBe("contraindicated");
  });
});

describe("medication safety — pregnancy", () => {
  it("suppresses vitamin A in pregnancy", () => {
    const ctx = baseCtx({
      pregnancy_status: "yes",
      confirmed_medications: [],
    });
    const signals = evaluateMedicationSafety(ctx, emptyConcepts);
    const vitA = signals.find((s) => s.rule_id === "pregnancy_vitamin_a");
    expect(vitA).toBeDefined();
    expect(vitA!.action).toBe("suppress");
  });
});

describe("medication safety — CKD", () => {
  it("flags potassium/magnesium for CKD patient", () => {
    const ctx = baseCtx({
      medical_history: "CKD stage 3, eGFR 42",
      confirmed_medications: [],
    });
    const signals = evaluateMedicationSafety(ctx, emptyConcepts);
    const ckd = signals.find((s) => s.rule_id === "ckd_potassium_magnesium");
    expect(ckd).toBeDefined();
    expect(ckd!.action).toBe("require_review");
    expect(ckd!.severity_tier).toBe("major");
  });
});

describe("medication safety — applySafetySignals", () => {
  it("suppresses product matching safety signal tags", () => {
    const signals = [{
      rule_id: "test",
      action: "suppress" as const,
      severity_tier: "major" as const,
      medication_concept: "warfarin",
      medication_class: "anticoagulant",
      supplement_ingredient: null,
      product_tags: ["fish_oil"],
      mechanism: "bleeding risk",
      advice: "Do not recommend",
      pharmacist_checks: [],
      safety_net: "seek review",
      source: "curated",
    }];
    const products = [
      {
        product_id: "1", name: "Fish Oil",
        active_ingredients: ["fish oil"],
        clinical_use_tags: ["fish_oil", "omega_support"],
        avoid_if_tags: [],
        safety_cautions: [],
        interaction_notes: [],
        confidence: "High" as const,
        confidence_score: 80,
        why_triggered: "matched",
      },
      {
        product_id: "2", name: "Vitamin C",
        active_ingredients: ["vitamin c"],
        clinical_use_tags: ["immune_support"],
        avoid_if_tags: [],
        safety_cautions: [],
        interaction_notes: [],
        confidence: "High" as const,
        confidence_score: 80,
        why_triggered: "matched",
      },
    ];
    const result = applySafetySignals(products, signals);
    expect(result[0].confidence).toBe("Low");
    expect(result[0].safety_cautions.length).toBeGreaterThan(0);
    expect(result[1].confidence).toBe("High"); // unaffected
  });
});

describe("medication patient factor detection", () => {
  it("detects bleeding risk from anticoagulant class", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "apixaban", drug_class: "anticoagulant" },
      ],
    });
    const factors = detectMedicationFactors(ctx, emptyConcepts);
    expect(factors.some((f) => f.factor === "bleeding_risk")).toBe(true);
  });

  it("detects diabetes from metformin concept", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "metformin", drug_class: "diabetes" },
      ],
    });
    const factors = detectMedicationFactors(ctx, emptyConcepts);
    expect(factors.some((f) => f.factor === "diabetes_medication")).toBe(true);
  });

  it("detects polypharmacy with 5+ medications", () => {
    const ctx = baseCtx({
      confirmed_medications: Array.from({ length: 6 }, (_, i) => ({
        generic_name: `drug${i}`,
        drug_class: "test",
      })),
    });
    const factors = detectMedicationFactors(ctx, emptyConcepts);
    expect(factors.some((f) => f.factor === "polypharmacy")).toBe(true);
  });

  it("detects multiple antihypertensives", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "perindopril", drug_class: "ace_inhibitor" },
        { generic_name: "amlodipine", drug_class: "calcium_channel_blocker" },
      ],
    });
    const factors = detectMedicationFactors(ctx, emptyConcepts);
    expect(factors.some((f) => f.factor === "multiple_antihypertensives")).toBe(true);
  });

  it("detects thyroid therapy from levothyroxine", () => {
    const ctx = baseCtx({
      confirmed_medications: [
        { generic_name: "levothyroxine", drug_class: "thyroid" },
      ],
    });
    const factors = detectMedicationFactors(ctx, emptyConcepts);
    expect(factors.some((f) => f.factor === "thyroid_therapy")).toBe(true);
  });
});

describe("symptom + medication reasoning", () => {
  it("flags statin + muscle cramps", () => {
    const ctx = baseCtx({
      symptoms: "muscle cramps and leg pain",
      confirmed_medications: [
        { generic_name: "atorvastatin", drug_class: "statin" },
      ],
    });
    const alerts = detectSymptomMedicationAlerts(ctx, emptyConcepts);
    const statinAlert = alerts.find((a) => a.alert_title.includes("Statin"));
    expect(statinAlert).toBeDefined();
    expect(statinAlert!.alert_text).toContain("statin");
  });

  it("flags PPI + fatigue", () => {
    const ctx = baseCtx({
      symptoms: "fatigue and tiredness",
      confirmed_medications: [
        { generic_name: "pantoprazole", drug_class: "ppi" },
      ],
    });
    const alerts = detectSymptomMedicationAlerts(ctx, emptyConcepts);
    const ppiAlert = alerts.find((a) => a.alert_title.includes("PPI"));
    expect(ppiAlert).toBeDefined();
  });

  it("does not flag statin alert when patient has no statin", () => {
    const ctx = baseCtx({
      symptoms: "muscle cramps",
      confirmed_medications: [
        { generic_name: "metformin", drug_class: "diabetes" },
      ],
    });
    const alerts = detectSymptomMedicationAlerts(ctx, emptyConcepts);
    expect(alerts.find((a) => a.alert_title.includes("Statin"))).toBeUndefined();
  });

  it("flags antihypertensive + dizziness", () => {
    const ctx = baseCtx({
      symptoms: "dizziness when standing up",
      confirmed_medications: [
        { generic_name: "perindopril", drug_class: "ace_inhibitor" },
        { generic_name: "indapamide", drug_class: "diuretic" },
      ],
    });
    const alerts = detectSymptomMedicationAlerts(ctx, emptyConcepts);
    const antihypAlert = alerts.find((a) => a.alert_title.includes("Antihypertensive"));
    expect(antihypAlert).toBeDefined();
  });
});