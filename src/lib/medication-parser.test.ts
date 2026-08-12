// Tests for the upgraded medication recognition engine.
// These tests use a synthetic medication index built from known
// Australian medicines to verify recognition, brand/generic mapping,
// combination products, misspellings, and form/strength extraction.
import { describe, it, expect } from "vitest";
import {
  buildIndexFromConcepts,
  recogniseMedications,
  splitMedicationText,
  type RecognitionResult,
} from "./medication-parser";

// Synthetic concept set mirroring real corpus data
const CONCEPTS = [
  {
    concept_id: "c-atorvastatin",
    canonical_name: "atorvastatin",
    name_normalised: "atorvastatin",
    drug_classes: ["statin", "cardiovascular"],
    brands: ["Lipitor", "Apo-Atorvastatin", "Atorvachol"],
    aliases: ["atorva"],
  },
  {
    concept_id: "c-metformin",
    canonical_name: "metformin",
    name_normalised: "metformin",
    drug_classes: ["diabetes", "biguanide"],
    brands: ["Diabex", "Glucovance", "Formet"],
    aliases: ["met"],
  },
  {
    concept_id: "c-pantoprazole",
    canonical_name: "pantoprazole",
    name_normalised: "pantoprazole",
    drug_classes: ["ppi", "gastrointestinal"],
    brands: ["Somac", "Pantoprazole Sandoz", "Pantoloc"],
    aliases: ["panto"],
  },
  {
    concept_id: "c-perindopril",
    canonical_name: "perindopril",
    name_normalised: "perindopril",
    drug_classes: ["ace_inhibitor", "cardiovascular"],
    brands: ["Coversyl", "Coversyl Plus"],
    aliases: ["perind"],
  },
  {
    concept_id: "c-indapamide",
    canonical_name: "indapamide",
    name_normalised: "indapamide",
    drug_classes: ["diuretic", "cardiovascular"],
    brands: ["Coversyl Plus"],
    aliases: ["inda"],
  },
  {
    concept_id: "c-apixaban",
    canonical_name: "apixaban",
    name_normalised: "apixaban",
    drug_classes: ["anticoagulant", "doac"],
    brands: ["Eliquis"],
    aliases: [],
  },
  {
    concept_id: "c-levothyroxine",
    canonical_name: "levothyroxine",
    name_normalised: "levothyroxine",
    drug_classes: ["thyroid", "endocrine"],
    brands: ["Eutroxsig", "Oroxine", "Thyroxine"],
    aliases: ["thyroxine", "levothyrox"],
  },
  {
    concept_id: "c-doxycycline",
    canonical_name: "doxycycline",
    name_normalised: "doxycycline",
    drug_classes: ["tetracycline", "antibiotic"],
    brands: ["Doryx", "Doxy", "Vibramycin"],
    aliases: ["doxy"],
  },
  {
    concept_id: "c-aspirin",
    canonical_name: "aspirin",
    name_normalised: "aspirin",
    drug_classes: ["antiplatelet", "nsaid"],
    brands: ["Cartia", "Aspirin", "Disprin"],
    aliases: ["asa", "acetylsalicylic acid"],
  },
  {
    concept_id: "c-warfarin",
    canonical_name: "warfarin",
    name_normalised: "warfarin",
    drug_classes: ["anticoagulant"],
    brands: ["Marevan", "Coumadin"],
    aliases: [],
  },
  {
    concept_id: "c-sertraline",
    canonical_name: "sertraline",
    name_normalised: "sertraline",
    drug_classes: ["ssri", "antidepressant"],
    brands: ["Zoloft"],
    aliases: [],
  },
  {
    concept_id: "c-alendronate",
    canonical_name: "alendronate",
    name_normalised: "alendronate",
    drug_classes: ["bisphosphonate"],
    brands: ["Fosamax", "Alendro"],
    aliases: [],
  },
  {
    concept_id: "c-ciprofloxacin",
    canonical_name: "ciprofloxacin",
    name_normalised: "ciprofloxacin",
    drug_classes: ["quinolone", "antibiotic"],
    brands: ["Ciproxin", "Ciprofloxacin Sandoz"],
    aliases: ["cipro"],
  },
  {
    concept_id: "c-prednisolone",
    canonical_name: "prednisolone",
    name_normalised: "prednisolone",
    drug_classes: ["corticosteroid"],
    brands: ["Panafcortelone", "Prednisolone"],
    aliases: ["pred"],
  },
  {
    concept_id: "c-amitriptyline",
    canonical_name: "amitriptyline",
    name_normalised: "amitriptyline",
    drug_classes: ["tca", "antidepressant"],
    brands: ["Endep", "Amitriptyline"],
    aliases: ["amitrip"],
  },
];

const INDEX = buildIndexFromConcepts(CONCEPTS);

function recognise(text: string): RecognitionResult[] {
  return recogniseMedications(text, INDEX);
}

describe("medication parser — generic name recognition", () => {
  it("recognises atorvastatin by generic name", () => {
    const items = recognise("atorvastatin");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("atorvastatin");
    expect(items[0].drug_classes).toContain("statin");
  });

  it("recognises metformin by generic name", () => {
    const items = recognise("metformin");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("metformin");
    expect(items[0].drug_classes).toContain("diabetes");
  });

  it("recognises pantoprazole by generic name", () => {
    const items = recognise("pantoprazole");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("pantoprazole");
    expect(items[0].drug_classes).toContain("ppi");
  });

  it("recognises apixaban by generic name", () => {
    const items = recognise("apixaban");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("apixaban");
    expect(items[0].drug_classes).toContain("anticoagulant");
  });

  it("recognises levothyroxine by generic name", () => {
    const items = recognise("levothyroxine");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("levothyroxine");
    expect(items[0].drug_classes).toContain("thyroid");
  });

  it("recognises doxycycline by generic name", () => {
    const items = recognise("doxycycline");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("doxycycline");
    expect(items[0].drug_classes).toContain("tetracycline");
  });
});

describe("medication parser — brand name recognition", () => {
  it("recognises Lipitor as atorvastatin", () => {
    const items = recognise("Lipitor");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("atorvastatin");
  });

  it("recognises Somac as pantoprazole", () => {
    const items = recognise("Somac");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("pantoprazole");
  });

  it("recognises Eliquis as apixaban", () => {
    const items = recognise("Eliquis");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("apixaban");
  });

  it("recognises Eutroxsig as levothyroxine", () => {
    const items = recognise("Eutroxsig");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("levothyroxine");
  });

  it("recognises Diabex as metformin", () => {
    const items = recognise("Diabex");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("metformin");
  });

  it("recognises Coversyl as perindopril", () => {
    const items = recognise("Coversyl");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("perindopril");
  });

  it("recognises Marevan as warfarin", () => {
    const items = recognise("Marevan");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("warfarin");
  });

  it("recognises Zoloft as sertraline", () => {
    const items = recognise("Zoloft");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("sertraline");
  });
});

describe("medication parser — strength and form extraction", () => {
  it("extracts strength from 'Lipitor 40mg'", () => {
    const items = recognise("Lipitor 40mg");
    expect(items[0].status).toBe("recognised");
    expect(items[0].strength).toContain("40mg");
  });

  it("extracts modified release form from 'Diabex XR'", () => {
    const items = recognise("Diabex XR 1000mg");
    expect(items[0].status).toBe("recognised");
    expect(items[0].dosage_form).toBe("modified release");
    expect(items[0].strength).toContain("1000mg");
  });

  it("extracts tablet form from 'metformin 500mg tablet'", () => {
    const items = recognise("metformin 500mg tablet");
    expect(items[0].status).toBe("recognised");
    expect(items[0].dosage_form).toBe("tablet");
  });

  it("extracts capsule form", () => {
    const items = recognise("doxycycline 100mg capsule");
    expect(items[0].status).toBe("recognised");
    expect(items[0].dosage_form).toBe("capsule");
  });
});

describe("medication parser — combination products", () => {
  it("recognises perindopril/indapamide as combination", () => {
    const items = recognise("perindopril/indapamide");
    expect(items[0].status).toBe("recognised");
    expect(items[0].is_combination).toBe(true);
    expect(items[0].components).toBeDefined();
    expect(items[0].components).toContain("perindopril");
    expect(items[0].components).toContain("indapamide");
  });

  it("recognises slash-separated combination", () => {
    const items = recognise("atorvastatin/metformin");
    expect(items[0].status).toBe("recognised");
    expect(items[0].is_combination).toBe(true);
  });
});

describe("medication parser — misspelling tolerance", () => {
  it("fuzzy matches 'Coversil' to a known drug", () => {
    const items = recognise("Coversil Plus");
    // Should either fuzzy match or normalised match
    expect(items[0].status).not.toBe("unknown");
  });

  it("fuzzy matches 'pantraprazole' to pantoprazole", () => {
    const items = recognise("pantraprazole");
    expect(items[0].status).toBe("fuzzy");
    expect(items[0].suggestion).toBeDefined();
  });
});

describe("medication parser — multi-medication lists", () => {
  it("parses 8+ medications from a newline-separated list", () => {
    const text = [
      "atorvastatin 40mg",
      "metformin 1000mg BD",
      "pantoprazole 40mg",
      "apixaban 5mg BD",
      "aspirin 100mg",
      "Coversyl Plus 5/1.25",
      "sertraline 100mg",
      "alendronate 70mg weekly",
    ].join("\n");
    const items = recognise(text);
    expect(items).toHaveLength(8);
    const recognised = items.filter((i) => i.status === "recognised");
    expect(recognised.length).toBeGreaterThanOrEqual(6);
  });

  it("parses comma-separated medications", () => {
    const items = recognise("atorvastatin, metformin, pantoprazole");
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.status === "recognised")).toBe(true);
  });
});

describe("medication parser — unknown drugs", () => {
  it("returns unknown for a fabricated drug name", () => {
    const items = recognise("Xylophrenium 5mg");
    expect(items[0].status).toBe("unknown");
  });

  it("returns unknown for tirzepatide (not in synthetic index)", () => {
    const items = recognise("tirzepatide");
    expect(items[0].status).toBe("unknown");
  });
});

describe("medication parser — alias recognition", () => {
  it("recognises 'asa' as aspirin", () => {
    const items = recognise("asa");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("aspirin");
  });

  it("recognises 'thyroxine' as levothyroxine", () => {
    const items = recognise("thyroxine");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("levothyroxine");
  });

  it("recognises 'cipro' as ciprofloxacin", () => {
    const items = recognise("cipro");
    expect(items[0].status).toBe("recognised");
    expect(items[0].generic_name).toBe("ciprofloxacin");
  });
});

describe("medication parser — splitMedicationText", () => {
  it("splits on newlines", () => {
    expect(splitMedicationText("atorvastatin\nmetformin")).toHaveLength(2);
  });

  it("splits on commas", () => {
    expect(splitMedicationText("atorvastatin, metformin")).toHaveLength(2);
  });

  it("splits on semicolons", () => {
    expect(splitMedicationText("atorvastatin; metformin")).toHaveLength(2);
  });

  it("filters empty entries", () => {
    expect(splitMedicationText("atorvastatin\n\n\nmetformin")).toHaveLength(2);
  });
});