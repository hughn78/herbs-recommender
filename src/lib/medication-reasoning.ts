// Medication-driven patient factor detection + symptom reasoning.
// Uses medication knowledge to infer patient factors that the engine
// should consider. Does NOT diagnose — uses "suggests" language.

import type { PatientCtx } from "./engine-types";
import type { MedicationConcept } from "./medication-knowledge";

export type MedicationFactorSignal = {
  factor: string;
  detected_from: "medication_class" | "medication_concept" | "medication_pattern";
  source_medications: string[];
  label: string;  // human-readable "suggests this may be relevant — confirm with patient"
  confidence: "high" | "medium" | "low";
};

// Map drug classes to patient factors
const CLASS_TO_FACTOR: Array<{
  classes: string[];
  factor: string;
  label: string;
  confidence: "high" | "medium" | "low";
}> = [
  { classes: ["anticoagulant", "doac", "antiplatelet"], factor: "bleeding_risk",
    label: "Anticoagulant/antiplatelet therapy — bleeding risk", confidence: "high" },
  { classes: ["statin"], factor: "on_statin",
    label: "Statin therapy — consider statin-related muscle symptoms", confidence: "high" },
  { classes: ["metformin", "biguanide", "sulfonylurea", "sglt2_inhibitor", "glp1_agonist", "insulin", "diabetes"], factor: "diabetes_medication",
    label: "Diabetes medication pattern suggests this may be relevant — confirm with patient", confidence: "medium" },
  { classes: ["thyroid"], factor: "thyroid_therapy",
    label: "Thyroid replacement therapy — mineral timing relevant", confidence: "high" },
  { classes: ["tetracycline", "quinolone", "bisphosphonate"], factor: "mineral_timing_risk",
    label: "Medication requires mineral separation timing", confidence: "high" },
  { classes: ["nsaid"], factor: "on_nsaid",
    label: "NSAID therapy — GI bleeding and renal risk", confidence: "high" },
  { classes: ["ace_inhibitor", "arb", "diuretic"], factor: "on_renin_angiotensin_or_diuretic",
    label: "RAAS/diuretic therapy — electrolyte and renal monitoring", confidence: "high" },
  { classes: ["ssri", "snri", "tca", "maoi"], factor: "serotonergic_burden",
    label: "Antidepressant therapy — serotonergic supplement risk", confidence: "high" },
  { classes: ["corticosteroid"], factor: "on_corticosteroid",
    label: "Corticosteroid therapy — bone health and calcium/vitamin D relevant", confidence: "high" },
  { classes: ["ppi"], factor: "on_ppi",
    label: "Long-term PPI may affect mineral/B12 absorption", confidence: "medium" },
  { classes: ["immunosuppressant"], factor: "immunosuppressed",
    label: "Immunosuppressant therapy — immune support caution", confidence: "high" },
  { classes: ["opioid", "benzodiazepine"], factor: "sedative_burden",
    label: "Sedative therapy — additive sedation risk with supplements", confidence: "medium" },
  { classes: ["anticoagulant", "antiplatelet"], factor: "bleeding_risk",
    label: "Bleeding risk from anticoagulant/antiplatelet", confidence: "high" },
];

// Specific concepts that imply factors
const CONCEPT_TO_FACTOR: Array<{
  concepts: string[];
  factor: string;
  label: string;
  confidence: "high" | "medium" | "low";
}> = [
  { concepts: ["metformin"], factor: "diabetes_medication",
    label: "Metformin suggests diabetes management — confirm with patient", confidence: "medium" },
  { concepts: ["insulin"], factor: "diabetes_medication",
    label: "Insulin therapy confirmed — diabetes management", confidence: "high" },
  { concepts: ["warfarin", "apixaban", "rivaroxaban", "dabigatran"], factor: "bleeding_risk",
    label: "Oral anticoagulant — significant bleeding risk with some supplements", confidence: "high" },
  { concepts: ["levothyroxine", "thyroxine"], factor: "thyroid_therapy",
    label: "Thyroid replacement — mineral timing critical", confidence: "high" },
  { concepts: ["prednisolone", "dexamethasone"], factor: "on_corticosteroid",
    label: "Corticosteroid — bone health supplementation may be appropriate", confidence: "high" },
  { concepts: ["alendronate", "risedronate", "zoledronic acid"], factor: "mineral_timing_risk",
    label: "Bisphosphonate — mineral separation required", confidence: "high" },
  { concepts: ["doxycycline", "minocycline"], factor: "mineral_timing_risk",
    label: "Tetracycline — mineral separation required", confidence: "high" },
  { concepts: ["ciprofloxacin", "norfloxacin"], factor: "mineral_timing_risk",
    label: "Quinolone — mineral separation required", confidence: "high" },
];

// Symptom + medication reasoning patterns
// When a patient reports a symptom AND is on a medication that can cause it,
// the engine should surface "consider medicine-related cause before supplement"
export type SymptomMedicationAlert = {
  symptom_keywords: string[];
  medication_classes: string[];
  medication_concepts: string[];
  alert_title: string;
  alert_text: string;
  pharmacist_action: string;
  source: string;
};

const SYMPTOM_MEDICATION_ALERTS: SymptomMedicationAlert[] = [
  {
    symptom_keywords: ["cramp", "muscle ach", "leg cramp", "muscle pain", "myalgia", "weakness"],
    medication_classes: ["statin"],
    medication_concepts: ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "fluvastatin"],
    alert_title: "Statin-associated muscle symptoms",
    alert_text: "Patient reports muscle symptoms AND is on a statin. Statin-associated muscle symptoms (SAMS) are common (1-10%) and should be considered before attributing to magnesium deficiency.",
    pharmacist_action: "Check CK if available. Consider whether statin dose timing, drug interactions (CYP3A4), or vitamin D deficiency are contributing. Refer to GP if symptoms persistent or severe.",
    source: "AMH — Statins adverse effects",
  },
  {
    symptom_keywords: ["fatigue", "tired", "low energy", "lethargy"],
    medication_classes: ["beta_blocker"],
    medication_concepts: ["metoprolol", "atenolol", "bisoprolol", "carvedilol"],
    alert_title: "Beta-blocker related fatigue",
    alert_text: "Patient reports fatigue AND is on a beta-blocker. Beta-blockers can cause fatigue and reduced exercise tolerance. Consider this before attributing to supplement deficiency.",
    pharmacist_action: "Ask about exercise tolerance, cold hands/feet, sleep. Consider GP review if problematic. Do not stop beta-blocker abruptly.",
    source: "AMH — Beta blockers adverse effects",
  },
  {
    symptom_keywords: ["fatigue", "tired", "low energy", "lethargy"],
    medication_classes: ["ppi"],
    medication_concepts: ["omeprazole", "pantoprazole", "esomeprazole"],
    alert_title: "PPI and B12/magnesium deficiency",
    alert_text: "Long-term PPI use can reduce magnesium and B12 absorption, causing fatigue. Consider checking levels before recommending supplements.",
    pharmacist_action: "Ask about PPI duration (>1 year higher risk). Consider GP referral for magnesium and B12 levels.",
    source: "AMH — PPIs precautions",
  },
  {
    symptom_keywords: ["reflux", "heartburn", "indigestion"],
    medication_classes: ["nsaid"],
    medication_concepts: ["ibuprofen", "naproxen", "diclofenac", "celecoxib"],
    alert_title: "NSAID-induced reflux",
    alert_text: "Patient reports reflux AND is on an NSAID. NSAIDs can cause gastric irritation. Consider whether the NSAID is contributing rather than treating with supplements.",
    pharmacist_action: "Review NSAID necessity and duration. Consider PPI co-prescription if NSAID continues. Refer to GP if persistent.",
    source: "AMH — NSAIDs adverse effects",
  },
  {
    symptom_keywords: ["constipation"],
    medication_classes: ["opioid", "calcium_channel_blocker", "anticholinergic"],
    medication_concepts: ["codeine", "morphine", "oxycodone", "amlodipine", "verapamil", "diltiazem"],
    alert_title: "Medication-related constipation",
    alert_text: "Patient reports constipation AND is on a medication that can cause it. Consider medication as a cause before recommending fibre supplements.",
    pharmacist_action: "Review medication list for constipating agents. Consider dose reduction or alternative if appropriate. Refer to GP.",
    source: "AMH — adverse effects",
  },
  {
    symptom_keywords: ["dizziness", "lightheaded", "faint"],
    medication_classes: ["antihypertensive", "ace_inhibitor", "arb", "diuretic", "beta_blocker", "alpha_blocker"],
    medication_concepts: [],
    alert_title: "Antihypertensive-related dizziness",
    alert_text: "Patient reports dizziness AND is on antihypertensive medication(s). Consider postural hypotension from medication before attributing to other causes.",
    pharmacist_action: "Ask about orthostatic symptoms (standing up quickly). Check if on multiple antihypertensives. Consider GP review for BP monitoring.",
    source: "AMH — antihypertensives adverse effects",
  },
];

/** Detect patient factors from medication patterns. */
export function detectMedicationFactors(
  ctx: PatientCtx,
  concepts: MedicationConcept[],
): MedicationFactorSignal[] {
  const signals: MedicationFactorSignal[] = [];
  const medClasses = new Set<string>();
  const medConcepts = new Set<string>();

  for (const med of ctx.confirmed_medications) {
    const dc = (med.drug_class ?? "").toLowerCase();
    if (dc) {
      medClasses.add(dc);
      for (const part of dc.split(/[+/]/)) medClasses.add(part.trim());
    }
    if (med.generic_name) medConcepts.add(med.generic_name.toLowerCase());
  }

  for (const concept of concepts) {
    medConcepts.add(concept.canonical_name.toLowerCase());
    for (const dc of concept.drug_classes) medClasses.add(dc.toLowerCase());
  }

  // Class-based factors
  for (const mapping of CLASS_TO_FACTOR) {
    const matched = mapping.classes.filter((c) => medClasses.has(c));
    if (matched.length > 0) {
      signals.push({
        factor: mapping.factor,
        detected_from: "medication_class",
        source_medications: ctx.confirmed_medications
          .filter((m) => matched.some((c) => (m.drug_class ?? "").toLowerCase().includes(c)))
          .map((m) => m.generic_name),
        label: mapping.label,
        confidence: mapping.confidence,
      });
    }
  }

  // Concept-based factors
  for (const mapping of CONCEPT_TO_FACTOR) {
    const matched = mapping.concepts.filter((c) => medConcepts.has(c));
    if (matched.length > 0) {
      // Avoid duplicate factors already detected via class
      if (signals.some((s) => s.factor === mapping.factor)) continue;
      signals.push({
        factor: mapping.factor,
        detected_from: "medication_concept",
        source_medications: matched,
        label: mapping.label,
        confidence: mapping.confidence,
      });
    }
  }

  // Polypharmacy
  if (ctx.confirmed_medications.length >= 5) {
    signals.push({
      factor: "polypharmacy",
      detected_from: "medication_pattern",
      source_medications: ctx.confirmed_medications.map((m) => m.generic_name),
      label: `${ctx.confirmed_medications.length} medications — polypharmacy risk`,
      confidence: "high",
    });
  }

  // Multiple antihypertensives
  const antihypClasses = ["ace_inhibitor", "arb", "diuretic", "beta_blocker", "calcium_channel_blocker", "alpha_blocker"];
  const antihypCount = ctx.confirmed_medications.filter((m) => {
    const dc = (m.drug_class ?? "").toLowerCase();
    return antihypClasses.some((c) => dc.includes(c));
  }).length;
  if (antihypCount >= 2) {
    signals.push({
      factor: "multiple_antihypertensives",
      detected_from: "medication_pattern",
      source_medications: ctx.confirmed_medications
        .filter((m) => antihypClasses.some((c) => (m.drug_class ?? "").toLowerCase().includes(c)))
        .map((m) => m.generic_name),
      label: `${antihypCount} antihypertensive medications — consider additive effects`,
      confidence: "high",
    });
  }

  return Array.from(new Map(signals.map((s) => [s.factor, s])).values());
}

/** Detect symptom + medication reasoning alerts. */
export function detectSymptomMedicationAlerts(
  ctx: PatientCtx,
  concepts: MedicationConcept[],
): SymptomMedicationAlert[] {
  const alerts: SymptomMedicationAlert[] = [];
  const symptomBlob = (ctx.symptoms + " " + ctx.counselling_goal).toLowerCase();

  const medClasses = new Set<string>();
  const medConcepts = new Set<string>();

  for (const med of ctx.confirmed_medications) {
    const dc = (med.drug_class ?? "").toLowerCase();
    if (dc) {
      medClasses.add(dc);
      for (const part of dc.split(/[+/]/)) medClasses.add(part.trim());
    }
    if (med.generic_name) medConcepts.add(med.generic_name.toLowerCase());
  }

  for (const concept of concepts) {
    medConcepts.add(concept.canonical_name.toLowerCase());
    for (const dc of concept.drug_classes) medClasses.add(dc.toLowerCase());
  }

  for (const alert of SYMPTOM_MEDICATION_ALERTS) {
    const symptomMatch = alert.symptom_keywords.some((k) => symptomBlob.includes(k));
    if (!symptomMatch) continue;

    const classMatch = alert.medication_classes.some((c) => medClasses.has(c));
    const conceptMatch = alert.medication_concepts.some((c) => medConcepts.has(c));

    if (classMatch || conceptMatch) {
      alerts.push(alert);
    }
  }

  return alerts;
}