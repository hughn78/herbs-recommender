// Medication safety engine — bridges medication knowledge to supplement products.
// Runs BEFORE product ranking. No LLM may override these rules.
//
// Sources:
//   - medication_supplement_safety table (database-driven, corpus-backed)
//   - Curated rules (hardcoded fallback, same as otc-interactions.ts pattern)
//   - Medication assertions (contraindications, precautions, interactions)
//
// Actions: suppress | downgrade | require_review | counsel | admin_timing

import type { PatientCtx } from "./engine-types";
import type { MedicationConcept } from "./medication-knowledge";

export type SafetySignal = {
  rule_id: string;
  action: "suppress" | "downgrade" | "require_review" | "counsel" | "admin_timing";
  severity_tier: "contraindicated" | "major" | "moderate" | "minor";
  medication_concept: string;
  medication_class: string | null;
  supplement_ingredient: string | null;
  product_tags: string[];
  mechanism: string;
  advice: string;
  pharmacist_checks: string[];
  safety_net: string;
  source: string;
  source_assertion_id?: string;
};

// ---- Curated safety rules (fallback when DB table is empty) ----
// These mirror the existing OTC interactions but are structured for the
// medication x supplement bridge. They will eventually be migrated to the
// medication_supplement_safety table with source-backed assertions.

const CURATED_SAFETY_RULES: Array<{
  id: string;
  matchClasses: string[];
  matchConcepts: string[];
  supplementIngredients: string[];
  productTags: string[];
  action: SafetySignal["action"];
  severity: SafetySignal["severity_tier"];
  mechanism: string;
  advice: string;
  checks: string[];
  safetyNet: string;
}> = [
  // ---- Anticoagulants + supplements ----
  {
    id: "anticoag_fish_oil",
    matchClasses: ["anticoagulant", "antiplatelet", "doac"],
    matchConcepts: ["warfarin", "apixaban", "rivaroxaban", "dabigatran", "clopidogrel", "aspirin"],
    supplementIngredients: ["fish oil", "omega-3", "krill oil", "nattokinase", "ginkgo biloba", "garlic", "vitamin e", "turmeric", "curcumin"],
    productTags: ["omega_support", "fish_oil", "blood_support"],
    action: "require_review",
    severity: "moderate",
    mechanism: "Additive anticoagulant/antiplatelet effect may increase bleeding risk",
    advice: "Review bleeding risk before recommending. Monitor for bruising, GI bleeding. Consider dose reduction or avoidance.",
    checks: ["Confirm anticoagulant name and dose", "Ask about recent bleeding or bruising", "Check INR if warfarin"],
    safetyNet: "Stop supplement and seek review if black stools, haematemesis, or unusual bruising.",
  },
  {
    id: "anticoag_vitamin_k",
    matchClasses: ["anticoagulant"],
    matchConcepts: ["warfarin"],
    supplementIngredients: ["vitamin k", "green tea", "spirulina", "chlorella", "alfalfa"],
    productTags: ["vitamin_k", "green_superfood", "spirulina"],
    action: "suppress",
    severity: "major",
    mechanism: "Vitamin K antagonises warfarin effect, reducing anticoagulation. Green tea/spirulina contain vitamin K.",
    advice: "Do NOT recommend vitamin K-containing supplements to warfarin patients. Refer to GP for INR check if already taking.",
    checks: ["Confirm warfarin dose and last INR", "Check all supplements for hidden vitamin K"],
    safetyNet: "If taken, check INR within 1 week. Do not stop warfarin.",
  },
  // ---- Thyroid + minerals ----
  {
    id: "thyroid_mineral_timing",
    matchClasses: ["thyroid"],
    matchConcepts: ["levothyroxine", "thyroxine"],
    supplementIngredients: ["calcium", "iron", "magnesium", "zinc", "selenium", "copper", "manganese"],
    productTags: ["calcium_support", "iron_support", "magnesium_support", "mineral_support", "multimineral"],
    action: "admin_timing",
    severity: "moderate",
    mechanism: "Divalent/trivalent cations chelate levothyroxine in the gut, reducing absorption by up to 30%.",
    advice: "Separate by at least 4 hours. Take levothyroxine first thing morning, fasted. Take minerals at lunch or evening.",
    checks: ["Confirm timing of levothyroxine and supplement doses", "Check if taking PPIs or calcium-containing antacids"],
    safetyNet: "If combining, recommend GP check TSH in 6-8 weeks.",
  },
  // ---- Bisphosphonate + minerals ----
  {
    id: "bisphosphonate_mineral_timing",
    matchClasses: ["bisphosphonate"],
    matchConcepts: ["alendronate", "risedronate", "zoledronic acid", "ibandronate"],
    supplementIngredients: ["calcium", "iron", "magnesium", "zinc", "aluminium"],
    productTags: ["calcium_support", "iron_support", "magnesium_support", "mineral_support"],
    action: "admin_timing",
    severity: "moderate",
    mechanism: "Cations bind bisphosphonate in the gut, reducing absorption by 60-90%.",
    advice: "Bisphosphonate must be taken first thing morning, upright, with plain water, 30 min before food/drink/supplements. Schedule minerals for evening.",
    checks: ["Confirm bisphosphonate dosing routine", "Screen for calcium-containing antacids in morning"],
    safetyNet: "If combining, recommend GP review; DEXA may need repeating.",
  },
  // ---- Tetracyclines + minerals ----
  {
    id: "tetracycline_mineral_timing",
    matchClasses: ["tetracycline"],
    matchConcepts: ["doxycycline", "minocycline", "tetracycline"],
    supplementIngredients: ["calcium", "iron", "magnesium", "zinc", "dairy"],
    productTags: ["calcium_support", "iron_support", "magnesium_support", "mineral_support", "multimineral"],
    action: "admin_timing",
    severity: "moderate",
    mechanism: "Cations form insoluble chelates with tetracyclines, reducing absorption significantly.",
    advice: "Separate by 2-4 hours. Pause the supplement during the antibiotic course if appropriate.",
    checks: ["Confirm tetracycline and timing", "Screen for dairy and antacid use near dose"],
    safetyNet: "Re-consult if infection not improving after 48 hours.",
  },
  // ---- Quinolones + minerals ----
  {
    id: "quinolone_mineral_timing",
    matchClasses: ["quinolone"],
    matchConcepts: ["ciprofloxacin", "norfloxacin", "moxifloxacin", "levofloxacin"],
    supplementIngredients: ["calcium", "iron", "magnesium", "zinc", "aluminium"],
    productTags: ["calcium_support", "iron_support", "magnesium_support", "mineral_support", "antacid"],
    action: "admin_timing",
    severity: "major",
    mechanism: "Cations form insoluble chelates with quinolones, reducing absorption by up to 90%.",
    advice: "Separate by 2 hours before or 6 hours after the quinolone. Pause supplement for antibiotic course if appropriate.",
    checks: ["Confirm quinolone name, dose, and timing", "List all mineral supplements and antacids"],
    safetyNet: "Re-consult if infection is not improving after 48 hours of antibiotics.",
  },
  // ---- SSRIs + serotonergic supplements ----
  {
    id: "ssri_serotonergic",
    matchClasses: ["ssri", "snri", "tca", "maoi"],
    matchConcepts: ["sertraline", "escitalopram", "fluoxetine", "citalopram", "paroxetine", "venlafaxine", "amitriptyline"],
    supplementIngredients: ["st john's wort", "5-htp", "tryptophan", "saffron"],
    productTags: ["mood_support", "st_johns_wort", "5_htp"],
    action: "suppress",
    severity: "contraindicated",
    mechanism: "Additive serotonergic effect risk of serotonin syndrome (agitation, tremor, hyperthermia).",
    advice: "Do NOT recommend St John's Wort, 5-HTP, or tryptophan to patients on SSRIs/SNRIs/MAOIs. Refer to GP for mood management.",
    checks: ["Screen for ALL serotonergic medications", "Ask about agitation, tremor, hyperthermia"],
    safetyNet: "Stop supplement and seek urgent review if agitation, tremor, hyperthermia, or confusion.",
  },
  // ---- Statins + red yeast rice ----
  {
    id: "statin_red_yeast_rice",
    matchClasses: ["statin"],
    matchConcepts: ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "fluvastatin"],
    supplementIngredients: ["red yeast rice", "monacolin k"],
    productTags: ["cholesterol_support", "red_yeast_rice"],
    action: "suppress",
    severity: "major",
    mechanism: "Red yeast rice contains monacolin K, which is lovastatin. Combining with a statin doubles statin dose, increasing myopathy and rhabdomyolysis risk.",
    advice: "Do NOT recommend red yeast rice to patients on statins. Refer to GP for cholesterol management review.",
    checks: ["Confirm statin name and dose", "Ask about muscle pain or weakness"],
    safetyNet: "Stop supplement and seek review if unexplained muscle pain, dark urine, or weakness.",
  },
  // ---- Diuretics + potassium supplements ----
  {
    id: "diuretic_potassium",
    matchClasses: ["diuretic", "ace_inhibitor", "arb"],
    matchConcepts: ["frusemide", "hydrochlorothiazide", "indapamide", "spironolactone"],
    supplementIngredients: ["potassium"],
    productTags: ["potassium_support", "electrolyte"],
    action: "require_review",
    severity: "moderate",
    mechanism: "Potassium-sparing diuretics (spironolactone, amiloride) + potassium supplements risk hyperkalaemia. ACEi/ARBs also raise potassium.",
    advice: "Check renal function and current potassium before recommending potassium supplements to patients on diuretics or ACEi/ARBs.",
    checks: ["Confirm diuretic type (potassium-sparing vs not)", "Check renal function if known", "Ask about weakness, palpitations"],
    safetyNet: "Stop and seek review if weakness, palpitations, or irregular heartbeat.",
  },
  // ---- Diabetes + chromium ----
  {
    id: "diabetes_chromium",
    matchClasses: ["diabetes", "biguanide", "sulfonylurea", "sglt2_inhibitor", "glp1_agonist", "insulin"],
    matchConcepts: ["metformin", "gliclazide", "empagliflozin", "semaglutide", "insulin"],
    supplementIngredients: ["chromium"],
    productTags: ["blood_sugar_support", "chromium"],
    action: "counsel",
    severity: "minor",
    mechanism: "Chromium may enhance insulin sensitivity. Theoretical additive hypoglycaemia risk with sulfonylureas or insulin.",
    advice: "Monitor blood glucose more closely if starting chromium. Inform GP. Lower risk with metformin alone.",
    checks: ["Confirm diabetes medication type", "Ask about self-monitoring of blood glucose"],
    safetyNet: "Stop and seek review if hypoglycaemia (sweating, shaking, confusion).",
  },
  // ---- PPIs + long-term mineral concerns ----
  {
    id: "ppi_longterm_minerals",
    matchClasses: ["ppi"],
    matchConcepts: ["omeprazole", "pantoprazole", "esomeprazole", "rabeprazole", "lansoprazole"],
    supplementIngredients: ["magnesium", "calcium", "iron", "b12", "vitamin b12"],
    productTags: ["magnesium_support", "calcium_support", "iron_support", "b12_support"],
    action: "counsel",
    severity: "minor",
    mechanism: "Long-term PPI use reduces gastric acid, impairing absorption of magnesium, calcium, iron, and B12.",
    advice: "If on long-term PPI (>1 year), consider monitoring magnesium, B12, and iron levels. Supplementation may be appropriate if deficiency confirmed.",
    checks: ["Confirm PPI duration", "Ask about fatigue, muscle cramps, or tingling", "Consider GP referral for levels"],
    safetyNet: "Report persistent fatigue, cramps, or neurological symptoms to GP.",
  },
  // ---- Corticosteroids + calcium/vitamin D ----
  {
    id: "corticosteroid_calcium",
    matchClasses: ["corticosteroid"],
    matchConcepts: ["prednisolone", "dexamethasone", "hydrocortisone", "methylprednisolone"],
    supplementIngredients: ["calcium", "vitamin d"],
    productTags: ["calcium_support", "vitamin_d_support", "bone_health"],
    action: "counsel",
    severity: "minor",
    mechanism: "Long-term corticosteroids reduce bone mineral density. Calcium and vitamin D supplementation is recommended adjunctive therapy.",
    advice: "Calcium and vitamin D supplementation is appropriate for patients on long-term corticosteroids. Monitor bone density.",
    checks: ["Confirm corticosteroid dose and duration", "Ask about dietary calcium intake", "Consider DEXA if long-term"],
    safetyNet: "Report bone pain or fractures to GP.",
  },
  // ---- Pregnancy + retinoids/herbs ----
  {
    id: "pregnancy_vitamin_a",
    matchClasses: [],
    matchConcepts: [],
    supplementIngredients: ["vitamin a", "retinol", "beta-carotene", "cod liver oil"],
    productTags: ["vitamin_a", "cod_liver_oil"],
    action: "suppress",
    severity: "contraindicated",
    mechanism: "High-dose vitamin A is teratogenic in pregnancy. Cod liver oil contains high vitamin A.",
    advice: "Do NOT recommend high-dose vitamin A or cod liver oil in pregnancy. Refer to GP for pregnancy-safe supplementation.",
    checks: ["Confirm pregnancy status", "Check all supplements for vitamin A content"],
    safetyNet: "Stop immediately if pregnant and taking high-dose vitamin A. Seek GP review.",
  },
  // ---- CKD + potassium/magnesium ----
  {
    id: "ckd_potassium_magnesium",
    matchClasses: [],
    matchConcepts: [],
    supplementIngredients: ["potassium", "magnesium"],
    productTags: ["potassium_support", "magnesium_support", "electrolyte"],
    action: "require_review",
    severity: "major",
    mechanism: "Renal impairment reduces potassium and magnesium excretion. Supplementation risks hyperkalaemia and hypermagnesaemia.",
    advice: "Do NOT recommend potassium or magnesium supplements without renal function review. Refer to GP for eGFR and electrolyte check.",
    checks: ["Confirm renal function if known", "Ask about weakness, palpitations", "Check concurrent ACEi/ARB/diuretic use"],
    safetyNet: "Stop and seek urgent review if weakness, palpitations, or irregular heartbeat.",
  },
];

/** Evaluate medication x supplement safety for a patient context.
 *  Returns safety signals that the engine uses to suppress, downgrade,
 *  or add counselling to product recommendations. */
export function evaluateMedicationSafety(
  ctx: PatientCtx,
  concepts: MedicationConcept[],
): SafetySignal[] {
  const signals: SafetySignal[] = [];

  // Build medication class set from confirmed medications
  const medClasses = new Set<string>();
  const medConcepts = new Set<string>();
  for (const med of ctx.confirmed_medications) {
    const dc = (med.drug_class ?? "").toLowerCase();
    if (dc) {
      medClasses.add(dc);
      // Split combination classes
      for (const part of dc.split(/[+/]/)) {
        medClasses.add(part.trim());
      }
    }
    if (med.generic_name) {
      medConcepts.add(med.generic_name.toLowerCase());
    }
  }

  // Also check if any loaded concepts match
  for (const concept of concepts) {
    medConcepts.add(concept.canonical_name.toLowerCase());
    for (const dc of concept.drug_classes) {
      medClasses.add(dc.toLowerCase());
    }
  }

  // Patient factors
  const factors = new Set<string>();
  const hist = (ctx.medical_history + " " + ctx.symptoms).toLowerCase();
  if (ctx.pregnancy_status === "yes" || ctx.pregnancy_status === "unsure") factors.add("pregnancy");
  if (/(renal|ckd|kidney|dialysis|egfr|nephro)/.test(hist)) factors.add("renal_disease");

  // Evaluate curated rules
  for (const rule of CURATED_SAFETY_RULES) {
    const classMatch = rule.matchClasses.some((c) => medClasses.has(c));
    const conceptMatch = rule.matchConcepts.some((c) => medConcepts.has(c));
    const pregnancyMatch = rule.id === "pregnancy_vitamin_a" && factors.has("pregnancy");
    const ckdMatch = rule.id === "ckd_potassium_magnesium" && factors.has("renal_disease");

    if (!classMatch && !conceptMatch && !pregnancyMatch && !ckdMatch) continue;

    signals.push({
      rule_id: rule.id,
      action: rule.action,
      severity_tier: rule.severity,
      medication_concept: rule.matchConcepts.find((c) => medConcepts.has(c)) ?? (rule.matchClasses.find((c) => medClasses.has(c)) ?? ""),
      medication_class: rule.matchClasses.find((c) => medClasses.has(c)) ?? null,
      supplement_ingredient: null,
      product_tags: rule.productTags,
      mechanism: rule.mechanism,
      advice: rule.advice,
      pharmacist_checks: rule.checks,
      safety_net: rule.safetyNet,
      source: "curated",
    });
  }

  return signals;
}

/** Apply safety signals to product recommendations.
 *  Returns the products with suppression/downgrade applied and safety notes added. */
export function applySafetySignals<T extends {
  product_id: string;
  name: string;
  active_ingredients: string[];
  clinical_use_tags: string[];
  avoid_if_tags: string[];
  safety_cautions: string[];
  interaction_notes: string[];
  confidence: "High" | "Medium" | "Low";
  confidence_score: number;
  why_triggered: string;
}>(
  products: T[],
  signals: SafetySignal[],
): T[] {
  return products.map((product) => {
    const productTags = new Set(product.clinical_use_tags);
    const productIngredients = product.active_ingredients.map((i) => i.toLowerCase());
    let modified = { ...product, safety_cautions: [...product.safety_cautions], interaction_notes: [...product.interaction_notes] };

    for (const signal of signals) {
      // Check if this signal applies to this product
      const tagMatch = signal.product_tags.some((t) => productTags.has(t));
      const ingredientMatch = signal.supplement_ingredient
        ? productIngredients.some((i) => i.includes(signal.supplement_ingredient!.toLowerCase()))
        : false;

      if (!tagMatch && !ingredientMatch) continue;

      switch (signal.action) {
        case "suppress":
          // Mark for suppression by setting confidence to Low and adding strong caution
          modified.confidence = "Low";
          modified.confidence_score = Math.min(modified.confidence_score, 10);
          modified.safety_cautions.push(`SUPPRESS: ${signal.advice}`);
          modified.interaction_notes.push(`${signal.mechanism} (Source: ${signal.source})`);
          break;
        case "downgrade":
          if (modified.confidence === "High") modified.confidence = "Medium";
          modified.confidence_score = Math.min(modified.confidence_score, 30);
          modified.safety_cautions.push(`CAUTION: ${signal.advice}`);
          break;
        case "require_review":
          modified.safety_cautions.push(`REVIEW REQUIRED: ${signal.advice}`);
          modified.interaction_notes.push(`${signal.mechanism}`);
          break;
        case "counsel":
          modified.safety_cautions.push(`COUNSELLING: ${signal.advice}`);
          break;
        case "admin_timing":
          modified.interaction_notes.push(`TIMING: ${signal.advice}`);
          break;
      }
    }

    return modified;
  });
}