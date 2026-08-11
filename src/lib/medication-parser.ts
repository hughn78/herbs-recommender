// Upgraded medication recognition engine.
// Uses the canonical medication model (medication_concepts + medication_names)
// with multi-layer matching: exact -> alias -> normalised -> fuzzy.
// Falls back to the legacy dictionary when new tables are not present.
//
// Key improvements over the original parser:
//   1. Australian brand recognition from corpus (thousands of brands, not ~30)
//   2. Combination product support (detects multiple active ingredients)
//   3. Strength/form parsing (XR, SR, CR, MR, EC)
//   4. Misspelling tolerance via normalised + fuzzy matching
//   5. Drug class resolution from corpus-backed class memberships
//   6. Never silently accepts an AI guess — ambiguous matches go to confirmation

export type RecognitionResult = {
  raw: string;
  status: "recognised" | "fuzzy" | "unknown";
  concept_id?: string;
  generic_name?: string;
  brand_name?: string;
  drug_class?: string | null;
  drug_classes?: string[];
  dosage_form?: string;
  strength?: string;
  match_type?: "exact" | "alias" | "normalised" | "fuzzy" | "brand";
  confidence?: number;
  suggestion?: string;
  is_combination?: boolean;
  components?: string[];
};

type MedIndex = {
  exact: Map<string, { concept_id: string; canonical_name: string; drug_classes: string[] }>;
  normalised: Map<string, { concept_id: string; canonical_name: string; drug_classes: string[] }>;
  brands: Map<string, { concept_id: string; canonical_name: string; drug_classes: string[] }>;
  aliases: Map<string, { concept_id: string; canonical_name: string; drug_classes: string[] }>;
};

const FORM_SUFFIXES = /\b(xr|sr|cr|er|mr|ec|odt|pr|la|dr)\b/gi;
const STRENGTH_RE = /\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|mmol|%|million units?|units?)\b/gi;
const FORM_KEYWORDS = /\b(tablet|tab|tabs|capsule|cap|caps|syrup|suspension|injection|inj|cream|ointment|spray|inhaler|patch|solution|drops|liquid|granules)\b/gi;

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\d+\s*(mg|mcg|g|ml|iu|%|million units|units?)/g, " ")
    .replace(FORM_SUFFIXES, " ")
    .replace(FORM_KEYWORDS, " ")
    .replace(/\b(once|twice|daily|bd|tds|qid|nocte|mane|prn|fortnightly|weekly|monthly)\b/g, " ")
    .replace(/[^a-z0-9/+/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export function splitMedicationText(text: string): string[] {
  return text
    .split(/[,;\n\r]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractStrength(raw: string): string | undefined {
  const match = raw.match(STRENGTH_RE);
  return match ? match.map((m) => m.trim()).join(" ") : undefined;
}

function extractForm(raw: string): string | undefined {
  const formMatch = raw.match(FORM_SUFFIXES);
  if (formMatch && formMatch.length > 0) {
    const form = formMatch[0].toUpperCase();
    const formMap: Record<string, string> = {
      XR: "modified release",
      SR: "slow release",
      CR: "controlled release",
      ER: "extended release",
      MR: "modified release",
      EC: "enteric coated",
      LA: "long acting",
      DR: "delayed release",
    };
    return formMap[form] ?? form.toLowerCase();
  }
  const kwMatch = raw.match(FORM_KEYWORDS);
  if (kwMatch) {
    const kw = kwMatch[0].toLowerCase();
    const kwMap: Record<string, string> = {
      tab: "tablet", tabs: "tablet", tablet: "tablet",
      cap: "capsule", caps: "capsule", capsule: "capsule",
      syrup: "syrup", suspension: "suspension",
      inj: "injection", injection: "injection",
      cream: "cream", ointment: "ointment", spray: "spray",
      inhaler: "inhaler", patch: "patch", solution: "solution",
      drops: "drops", liquid: "liquid", granules: "granules",
    };
    return kwMap[kw] ?? kw;
  }
  return undefined;
}

function detectCombination(raw: string, norm: string): string[] | undefined {
  // Check for slash-separated or + separated ingredients in the raw input
  // (normaliser strips these characters, so we must check before normalising)
  const comboRe = /[/+]|\s+and\s+|\s+with\s+/i;
  if (comboRe.test(raw)) {
    const parts = raw.split(comboRe).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts.map((p) => normalise(p));
  }
  return undefined;
}

function recogniseOne(
  raw: string,
  index: MedIndex,
): RecognitionResult {
  const norm = normalise(raw);
  if (!norm) return { raw, status: "unknown" };

  const strength = extractStrength(raw);
  const form = extractForm(raw);
  const compacted = compact(norm);

  // 1. Exact generic name match
  const exactGeneric = index.exact.get(norm);
  if (exactGeneric) {
    return {
      raw, status: "recognised", concept_id: exactGeneric.concept_id,
      generic_name: exactGeneric.canonical_name,
      drug_classes: exactGeneric.drug_classes,
      drug_class: exactGeneric.drug_classes[0] ?? null,
      strength, dosage_form: form, match_type: "exact", confidence: 100,
    };
  }

  // 2. Exact brand name match
  const exactBrand = index.brands.get(norm);
  if (exactBrand) {
    return {
      raw, status: "recognised", concept_id: exactBrand.concept_id,
      generic_name: exactBrand.canonical_name,
      brand_name: raw.replace(/\d+.*$/i, "").trim(),
      drug_classes: exactBrand.drug_classes,
      drug_class: exactBrand.drug_classes[0] ?? null,
      strength, dosage_form: form, match_type: "brand", confidence: 95,
    };
  }

  // 3. Alias match
  const aliasMatch = index.aliases.get(norm);
  if (aliasMatch) {
    return {
      raw, status: "recognised", concept_id: aliasMatch.concept_id,
      generic_name: aliasMatch.canonical_name,
      drug_classes: aliasMatch.drug_classes,
      drug_class: aliasMatch.drug_classes[0] ?? null,
      strength, dosage_form: form, match_type: "alias", confidence: 90,
    };
  }

  // 4. Combination product detection (check BEFORE prefix match since
  //    normaliser converts / to space, making "perindopril/indapamide" look
  //    like "perindopril indapamide" which would prefix-match perindopril)
  const comboParts = detectCombination(raw, norm);
  if (comboParts && comboParts.length > 1) {
    const recognisedParts: string[] = [];
    for (const part of comboParts) {
      const partNorm = normalise(part);
      const partCompacted = compact(partNorm);
      const match = index.normalised.get(partCompacted) ?? index.exact.get(partNorm);
      if (match) recognisedParts.push(match.canonical_name);
    }
    if (recognisedParts.length > 0) {
      return {
        raw, status: "recognised",
        generic_name: recognisedParts.join(" + "),
        components: recognisedParts,
        is_combination: true,
        drug_classes: [],
        drug_class: null,
        strength, dosage_form: form, match_type: "normalised", confidence: 75,
      };
    }
  }

  // 5. Prefix match (e.g. "metformin 1000 xr" starts with "metformin")
  for (const [name, info] of index.exact) {
    if (norm.startsWith(name)) {
      return {
        raw, status: "recognised", concept_id: info.concept_id,
        generic_name: info.canonical_name,
        drug_classes: info.drug_classes,
        drug_class: info.drug_classes[0] ?? null,
        strength, dosage_form: form, match_type: "exact", confidence: 90,
      };
    }
  }
  for (const [name, info] of index.brands) {
    if (norm.startsWith(name)) {
      return {
        raw, status: "recognised", concept_id: info.concept_id,
        generic_name: info.canonical_name,
        brand_name: name,
        drug_classes: info.drug_classes,
        drug_class: info.drug_classes[0] ?? null,
        strength, dosage_form: form, match_type: "brand", confidence: 85,
      };
    }
  }

  // 5. Compacted/normalised match (handles misspellings and punctuation)
  const normMatch = index.normalised.get(compacted);
  if (normMatch) {
    return {
      raw, status: "recognised", concept_id: normMatch.concept_id,
      generic_name: normMatch.canonical_name,
      drug_classes: normMatch.drug_classes,
      drug_class: normMatch.drug_classes[0] ?? null,
      strength, dosage_form: form, match_type: "normalised", confidence: 80,
    };
  }

  // 6. Fuzzy match against the first word
  const first = norm.split(" ")[0];
  if (first && first.length >= 3) {
    let bestName = "";
    let bestDist = Infinity;
    const candidates = [
      ...index.exact.keys(),
      ...index.brands.keys(),
      ...index.aliases.keys(),
    ];
    for (const c of candidates) {
      const d = levenshtein(first, c);
      if (d < bestDist) {
        bestDist = d;
        bestName = c;
      }
    }
    const threshold = Math.max(2, Math.floor(first.length / 5));
    if (bestDist <= threshold && bestName) {
      const info = index.exact.get(bestName) ?? index.brands.get(bestName) ?? index.aliases.get(bestName);
      return {
        raw, status: "fuzzy",
        suggestion: info?.canonical_name ?? bestName,
        confidence: 60 - bestDist * 10,
        strength, dosage_form: form,
      };
    }
  }

  return { raw, status: "unknown" };
}

export function recogniseMedications(
  text: string,
  index: MedIndex,
): RecognitionResult[] {
  return splitMedicationText(text).map((raw) => recogniseOne(raw, index));
}

/** Build the medication index from MedicationConcept[] for use by recogniseMedications. */
export function buildIndexFromConcepts(
  concepts: Array<{
    concept_id: string;
    canonical_name: string;
    name_normalised: string;
    drug_classes: string[];
    brands: string[];
    aliases: string[];
  }>,
): MedIndex {
  const exact = new Map<string, { concept_id: string; canonical_name: string; drug_classes: string[] }>();
  const normalised = new Map<string, { concept_id: string; canonical_name: string; drug_classes: string[] }>();
  const brands = new Map<string, { concept_id: string; canonical_name: string; drug_classes: string[] }>();
  const aliases = new Map<string, { concept_id: string; canonical_name: string; drug_classes: string[] }>();

  function comp(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  for (const c of concepts) {
    const info = { concept_id: c.concept_id, canonical_name: c.canonical_name, drug_classes: c.drug_classes };
    exact.set(c.canonical_name.toLowerCase(), info);
    normalised.set(comp(c.canonical_name), info);

    for (const b of c.brands) {
      brands.set(b.toLowerCase(), info);
      normalised.set(comp(b), info);
    }

    for (const a of c.aliases) {
      aliases.set(a.toLowerCase(), info);
      normalised.set(comp(a), info);
    }
  }

  return { exact, normalised, brands, aliases };
}