# Herbs of Gold — Knowledge Base Extraction Report

**Generated:** 2026-06-09
**Source:** `Herbs of Gold Technical Manual` (PDF, DOCX, XLSX) — owned by Hugh (Blackshaws Road Pharmacy / Burke Road Compounding Pharmacy network).
**Pipeline:** 8 rerunnable Python scripts in `HerbsOfGold_KnowledgeBase/scripts/`.
**Purpose:** Pharmacist-reviewable knowledge base for use in a Z Dispense/APSS clinical decision-support recommendation engine.

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| Products found in manual | 103 |
| Products successfully exported | 103 |
| Products with complete ingredients (with strength) | 81 / 103 (78.6%) |
| Products with extracted dose direction | 101 / 103 (98.1%) |
| Products with extracted cautions | 90 / 103 (87.4%) |
| Products with determined dosage form | 99 / 103 (96.1%) |
| Products with AUST L number | 0 / 103 (0%) — **known gap** |
| High confidence extractions | 78 / 103 (75.7%) |
| Medium confidence extractions | 25 / 103 (24.3%) |
| Low confidence extractions | 0 / 103 (0%) |
| Products requiring pharmacist review (all flagged) | 103 / 103 (100%) |
| Unique ingredients catalogued | 151 |
| Total clinical-use tags applied | 268 |
| Total avoid-if tags applied | 330 |
| Total medicine interaction flags | 148 |
| Total counselling points generated | 684 |
| Total draft safety rules | 17 |
| Total extraction issues logged | 144 |
| RAG chunks produced | 819 |

**Bottom line:** the knowledge base is **structurally complete** and ready for pharmacist review. All 103 products have a stable ID, source page reference, draft tags, draft counselling points, and a default `ReviewStatus = Unreviewed`. The principal data gaps are (1) AUST L numbers — not in the source manual — and (2) ingredient strengths for 22 products whose ingredient list is in prose without a dotted-leader format. These are the priorities for the manual review pass.

---

## 2. Files processed

| File | Path | Size | Type | Role |
|------|------|------|------|------|
| `herbsofgold_technical_manual.pdf` | `/Users/hughn78/herbsofgold_scraped/herbsofgold_technical_manual.pdf` | 8,748 KB | PDF v1.7 | **Source of truth.** Text-extractable; no OCR needed. 206 pages. |
| `herbsofgold_technical_manual.docx` | `/Users/hughn78/herbsofgold_scraped/herbsofgold_technical_manual.docx` | 27,068 KB | Word 2007+ | Readable product monograph text. 10,317 paragraphs, 18 tables, 103 H1 product sections. |
| `WJ herbsofgold_technical_manual.xlsx` | `/Users/hughn78/herbsofgold_scraped/herbsofgold_technical_manual.xlsx` | 22,501 KB | Excel 2007+ | Single sheet `Table 1`, 1390×67 — flattened text export of the manual. Not a structured data source. Used only to extract the TOC product→page mapping. |
| `markdown/herbsofgold_technical_manual.md` | prior work | ~1,100 KB | Markdown | Prior readability pass; used as cross-check. |

**PDF metadata:** creator Acrobat Pro 23.6.20320; created 2023-10-12; modified 2023-10-13.

---

## 3. Extraction methods used

The pipeline runs eight modular scripts (each rerunnable in isolation, none destroys source files):

1. **`01_extract_docx.py`** — `python-docx`. Walks the document tree, classifies paragraphs by `Heading 1/2/3` style, captures product H1 sections, merges page-break repeats, builds a structured JSON of product sections with subsections (Directions, Features & Benefits, Technical Information, Drug Interactions, Cautions, Side Effects, Companion Products). Also writes linear text with `## PRODUCT:` / `### SECTION:` markers for grep-friendly inspection.

2. **`02_extract_excel.py`** — `openpyxl`. Dumps the single sheet to CSV. Records structure summary.
   **`02b_extract_excel_toc.py`** — extracts the 110 product→page entries from the TOC region of `Table 1` (3 columns of 33 products each).

3. **`03_extract_pdf.py`** — `pymupdf`. Extracts 206 pages to JSON. Detects the **3-page PDF offset** (cover + inside-blank + TOC) by finding the first page with `TECHNICAL INFORMATION` + `Acetyl`. Builds a `page_to_product` index covering all 206 pages.

4. **`04_identify_products.py`** — cross-references DOCX H1 product names, XLSX TOC entries, and the PDF page index. Produces a canonical list of 103 products with HOG-0001…HOG-0103 stable IDs. Records 7 TOC-only entries (`Probiotic + SB`, `Lysine 1000 + Olive Leaf`, `Men's Multi +`, `Ultra Zinc +`, `Women's Multi +`, `Zinc Forte + C`, `Notes`) as extras.

5. **`05_parse_products.py`** — per-product extraction:
   - **Ingredients**: tries PDF first (dotted-leader format preserved), falls back to DOCX. Handles three patterns: `Name .........500mg`, `Compound equiv. element ......145.8mg`, `Lactobacillus rhamnosus  5billion CFU`. Stops at pack-size line, blank line, or next major heading.
   - **Directions**: parses `Adults - …` and `Children - …` regex; dedups page-break duplicates via half-similarity check.
   - **Cautions / Interactions**: bullet-split, severity-classified (high/medium/low), caution-type classified (caution / contraindication / warning / pregnancy_breastfeeding / child_use / allergy).
   - **Dosage form / pack size**: searches PDF first page + intro (not all_text, which contains dose lines that look like pack sizes); distinguishes "Take 1 capsule" dose from "60 / 120 capsules" pack.
   - **AUST L**: scanned in all three sources — **not present anywhere**. Flagged as a known gap for every product.

6. **`06_generate_tags.py`** — applies two rule sets (CLINICAL_USE_RULES, AVOID_IF_RULES) with regex matching against normalised ingredient names. Each tag carries a `Reason` and a `RequiresPharmacistReview` flag. Generates draft safety rules from common pharmacist knowledge. Each product gets 4–10 counselling points (safety check, duplication check, dose, separation timing, when to refer).

7. **`07_export_outputs.py`** — builds the 12-sheet Excel workbook, flat CSV, structured JSON, and JSONL RAG chunks. **819 chunks** across 8 sections per product (overview, ingredients, directions, indications, cautions, interactions, side_effects, counselling). Each chunk includes source page reference and metadata for filtering.

8. **`08_validate_outputs.py`** — runs validation checks and writes `validation_report.xlsx` (10 sheets: Summary, Duplicate_Product_Names, Missing_AUSTL, Missing_Doses, Missing_Ingredients, Missing_Cautions, Possible_Errors, Word_Excel_Inconsistencies, Pharmacist_Review_Required, Confidence_Distribution).

---

## 4. Number of product candidates found vs. exported

- **Candidates identified (in DOCX H1 + XLSX TOC):** 103
- **Candidates identified in XLSX TOC only (not as DOCX H1):** 7 — likely alternate names / front-matter
- **Candidates exported to final outputs:** 103
- **Products with complete ingredient data (name + strength + unit):** 81
- **Products with at least one extracted field missing:** 22 (mostly ingredient strength or dosage form)

---

## 5. Number of products missing key fields

| Field | Missing count | Notes |
|-------|---------------|-------|
| AUST L | 103 (all) | AUST L numbers are not in the source manual. Pharmacist must verify each via TGA ARTG search. |
| Ingredients | 22 | 7 products have prose ingredient descriptions (e.g. "It contains: Riboflavin-5-phosphate…"); 15 have multi-line ingredients (extract + dry leaf + standardised) or unusual formats. |
| Adult dose | 2 | GlucoPlex, Hawthorn 4500 have no DIRECTIONS FOR USE block. |
| Cautions | 13 | No CAUTIONS block found in DOCX. These products should not be considered "safe by omission". |
| Dosage form | 4 | Children's Probiotic 15 Billion, Collagen Gold, GlucoPlex, Silica Hair Solution — usually powders / liquids described in prose. |
| Pack size | 0 | All products have a pack size extracted (after fixing the dose-vs-pack regex bug). |

---

## 6. Common extraction issues

- **AUST L not in source** (every product) — the manual is a pharmacist-facing monograph, not a TGA listing. The AUST L number is printed on the actual product label, not in the technical manual. **Pharmacist must source AUST L separately.**
- **Multi-line / "with" / "stand." ingredient entries** (e.g. GlucoPlex: `Gymnema sylvestre extract 100mg / derived from dry leaf minimum 2g / stand. to contain Gymnemic acids 25mg`) — parsed as a single line; the "stand." standardised amount is not separately captured.
- **Prose ingredient descriptions** (Activated B Complex, Bergamot Cholesterol Care) — "It contains: Riboflavin-5-phosphate, the active form of vitamin B2…" — no strength values, so the product is flagged in Missing_Ingredients. The ingredient identity can still be derived from the prose.
- **"Each 1g serve contains" / "Each 10mL contains"** — variants on the "Each X contains" block. Mostly handled, but Children's Probiotic 15 Billion, Silica Hair Solution fall through to the "missing ingredients" pile.
- **Page-break duplicates** — page 5 contains the *tail* of Acetyl L-Carnitine, page 6 the *head* of Activated B Complex. The PDF page index correctly maps each PDF page to the product whose **content** it primarily contains, but the boundaries are still approximate (~3-page offset on the manual page numbers vs the PDF page numbers).
- **Duplicate H1s in DOCX** — the product title is repeated at the top of every page (page-break artifact). Handled by post-process merge in `01_extract_docx.py`.
- **Duplicate dose directions** — the DIRECTIONS FOR USE block is repeated on the next page. Handled by `parse_directions` half-similarity check.

---

## 7. Recommended pharmacist review workflow

1. **Open `output/Herbs_of_Gold_Product_Knowledge_Base.xlsx` in the Products sheet.**
2. **Filter by `ExtractionConfidence = High`** — these 78 products are the lowest-effort review pass.
3. **Open `output/validation_report.xlsx` → `Pharmacist_Review_Required` sheet** — sort by `ReviewPriority = High`. These are the products with the most missing data, prioritised for the first review pass.
4. For each product, open the matching PDF page (use `SourcePage`) and verify:
   - AUST L number (look up via TGA ARTG and add to AUSTL field)
   - Ingredient strengths (correct any multi-line / prose entries manually)
   - Dose directions
   - Cautions
5. Mark `ReviewStatus = Reviewed` (or `Approved for recommendation`) and record your name + date in the `ReviewStatus` / `ReviewedBy` / `ReviewedDate` columns.
6. Log any changes in the `Review_Log` sheet.

---

## 8. Suggested first 20 products to manually review (priority for MVP)

These were selected for being either high-traffic, common pharmacist recommendation targets, or having the most data gaps. They are also concentrated in the suggested first-20 product categories from the task spec.

| # | Product | Why it's on this list |
|---|---------|----------------------|
| 1 | **Magnesium Citrate 900** | Common magnesium recommendation; equiv. compound parsing. |
| 2 | **Magnesium Forte** | Same — magnesium mineral support. |
| 3 | **Magnesium Night Plus** | Sleep + magnesium combo — multiple tags. |
| 4 | **Magnesium Chewable** | Chewable form for kids/elderly. |
| 5 | **Vitamin D3 1000** | Very common recommendation. |
| 6 | **Calcium K2 with D3** | Multi-ingredient, bone health. |
| 7 | **Vitamin C 1000 Plus** | Common immune support. |
| 8 | **Activated B Complex** | Prose ingredients (missing strength). |
| 9 | **Activated Sublingual B12** | B12 — high-traffic. |
| 10 | **Vitamin B12** range (B1, B2, B3, B5, B6) | Each is single-ingredient; review together for B-complex coverage. |
| 11 | **Organic Iron MAX** | Iron — high interaction profile. |
| 12 | **Probiotic 60 Billion** | Probiotic with 10 strains — complex ingredients. |
| 13 | **Children's Probiotic 15 Billion** | Probiotic, child use, multi-strain. |
| 14 | **Fish Oil 1000** | Omega-3, anticoagulant review. |
| 15 | **Triple Strength Omega-3** | High-dose omega-3. |
| 16 | **CoQ10 150mg** | Cardiovascular. |
| 17 | **Ubiquinol 100mg / 150mg** | Cardiovascular, high cost. |
| 18 | **Pregnancy Plus 1-2-3** | Pregnancy — must always be reviewed. |
| 19 | **St John's Wort 3600** | Multiple major interactions — high risk. |
| 20 | **Zinc Forte + C** | Immune + zinc; common cold recommendation. |

If a faster MVP is preferred, the most pragmatic subset is:

- **Magnesium products** (4 products, ~5 min each)
- **Vitamin D / Calcium / K2** (3 products, ~5 min each)
- **Iron / B12** (3 products, ~5 min each)
- **Pregnancy Plus** (1 product, ~10 min — high importance)
- **St John's Wort** (1 product, ~10 min — high risk)
- **Probiotic 60 Billion** (1 product, ~10 min — complex ingredients)

≈13 products, ~90 minutes for a single pharmacist.

---

## 9. Suggested next steps for integrating with a Z Dispense/APSS recommendation engine

1. **Pharmacist review pass** as above. Until ReviewStatus is "Approved" for a product, the engine should treat it as "for pharmacist review only" — never auto-recommend.
2. **AUST L lookup**: add AUST L to the products table. The AUST L is a clean key for joining against the TGA ARTG and can serve as a primary key for an eRx / dispense-system join.
3. **Patient profile mapping**: convert Z Dispense medication codes → ingredient / drug class. Use the `MedicineInteractionFlags` column in `Interactions` sheet to flag medicine-supplement conflicts. Use `ClinicalUseTags` to suggest products where the patient has a documented indication (e.g. patient on metformin + vitamin D deficiency diagnosis → flag `Vitamin D3 1000` as worth considering).
4. **Safety rule engine**: import `Safety_Rules_Draft` into the recommendation engine. The `TriggerIngredient` field is a regex; the `TriggerDrugClass` and `TriggerPatientFactor` are also regex. The engine should run all rules for any candidate product and only return products where every applicable rule's `Action` is `allow_with_counselling` or lower. Anything `pharmacist_review_required` or worse must require an explicit pharmacist sign-off step.
5. **Counselling display**: surface the `Counselling_Points` sheet's `pharmacist_point` text inside the recommendation UI for the pharmacist. Show `patient_friendly_version` only after the pharmacist has approved the recommendation.
6. **RAG retrieval**: the `herbs_of_gold_product_chunks.jsonl` file is ready for vector DB ingestion. Suggested chunk-to-query mapping:
   - Patient has drug X → search for `medicine_interaction_flag == X` to surface interaction risks.
   - Patient has condition Y → search for `clinical_tags` containing Y to surface candidate products.
   - Pharmacist asks "is this safe with warfarin?" → search the Cautions / Interactions sections of all products.
7. **Audit log**: every recommendation should log (a) the patient profile, (b) the candidate product, (c) the tags and rules that fired, (d) the pharmacist who approved it. This is essential for medico-legal defensibility.
8. **Never auto-approve**: the engine must never write `ReviewStatus = Approved` for any product. That decision belongs to a human pharmacist, on a per-patient basis, with full visibility of the source material.

---

## 10. Known limitations and caveats

- **AUST L is a gap, not a bug.** The Herbs of Gold Technical Manual does not list AUST L numbers. They are on the actual product label. Until they're filled in, the recommendation engine cannot reliably distinguish two products with the same name from different brands.
- **The source manual itself is a marketing document**, not a clinical guideline. "Herbs of Gold Acetyl L-Carnitine is a source of carnitine…" is a label claim, not a therapeutic claim. The knowledge base preserves source wording verbatim in the `Source_References` sheet; the tags and counselling points are pharmacist-facing interpretations and must be reviewed.
- **The "Each X contains" block is the only source for ingredient strengths.** When the manual describes ingredients in prose (e.g. "It contains: Riboflavin-5-phosphate, the active form of vitamin B2"), the strength is not stated and the database records the ingredient identity only. Pharmacist must check the actual product label.
- **"Best by" dates and batch-specific recall information** are not in the manual and are not in the knowledge base.
- **Children's dose** is rarely stated in the manual. The default is "Take only as directed by your health professional" — this is preserved as-is.
- **No compounding or extemporaneous preparation data** in the manual. The knowledge base is for finished product dispensing, not for compounding.
- **The DOCX is a Word export of the PDF.** It contains the same content but loses some formatting (dotted leaders, complex tables). The PDF is the better source for ingredient extraction; the DOCX is the better source for section heading structure.
- **The XLSX is not a structured data source** — it is a flattened text export. It is only useful for the TOC product→page mapping. Do not attempt to extract ingredients or dose tables from it.

---

## 11. File manifest — final outputs

| File | Path | Size | Purpose |
|------|------|------|---------|
| Main workbook | `output/Herbs_of_Gold_Product_Knowledge_Base.xlsx` | 238 KB | 12-sheet pharmacist-review workbook |
| Flat CSV | `output/herbs_of_gold_products.csv` | 195 KB | One row per product, 26 columns |
| Structured JSON | `output/herbs_of_gold_products.json` | 785 KB | Nested per-product records, app-import ready |
| RAG chunks | `output/herbs_of_gold_product_chunks.jsonl` | 629 KB | 819 chunks, 8 sections per product |
| Validation report | `output/validation_report.xlsx` | (just written) | 10 sheets of QA checks |
| Validation summary | `output/validation_summary.txt` | (just written) | Plain-text top-40 review priority list |
| Extraction report | `output/extraction_report.md` | (this file) | This document |
| Source manifest | `source/SOURCE_MANIFEST.md` | 1.4 KB | File references and metadata |
| Raw DOCX text | `extracted/docx_raw_text.txt` | 992 KB | All DOCX text with `## PRODUCT:` / `### SECTION:` markers |
| DOCX sections | `intermediate/docx_sections.json` | — | 103 structured product sections |
| DOCX product names | `intermediate/docx_product_names.json` | — | List of 103 product names |
| Excel sheet CSV | `extracted/excel_sheets/Table_1.csv` | — | Flattened XLSX |
| Excel structure | `intermediate/excel_structure_summary.json` | — | XLSX sheet summary |
| Excel TOC | `intermediate/excel_product_pages.json` | — | 110 product→page entries |
| PDF pages | `extracted/pdf_pages.json` | — | 206 page texts |
| PDF page index | `intermediate/pdf_page_index.json` | — | 206 page→product mappings |
| Product candidates | `intermediate/product_candidates.csv` / `.json` | — | 103 canonical candidates with cross-source flags |
| Parsed products | `intermediate/products_parsed.json` | — | Pre-tagging, per-product structured fields |
| Products with tags | `intermediate/products_with_tags.json` | — | Final per-product records with tags + counselling |
| Safety rules draft | `intermediate/safety_rules_draft.json` | — | 17 draft safety rules |
| Extraction issues | `intermediate/extraction_issues_raw.json` | — | 144 issues with severity and suggested action |
| Logs | `logs/*.log` | — | Per-script log files |

---

## 12. How to rerun the pipeline

```bash
# Activate the venv (already exists in /Users/hughn78/herbsofgold_scraped/.venv)
cd /Users/hughn78/herbsofgold_scraped/HerbsOfGold_KnowledgeBase

# Run all 8 scripts in order. Each is rerunnable in isolation.
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/01_extract_docx.py
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/02_extract_excel.py
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/02b_extract_excel_toc.py
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/03_extract_pdf.py
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/04_identify_products.py
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/05_parse_products.py
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/06_generate_tags.py
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/07_export_outputs.py
/Users/hughn78/herbsofgold_scraped/.venv/bin/python scripts/08_validate_outputs.py
```

The scripts are idempotent and do not modify source files. They overwrite intermediate files and the `output/` directory on each run.

---

## 13. Final reminder

This database is for **pharmacist clinical decision support only**. It is not patient-facing advice. Every recommendation that flows from it must be reviewed and signed off by a registered pharmacist. No automatic patient-facing recommendation is appropriate from this knowledge base in its current state.

The default for every product is `ReviewStatus = Unreviewed`. Products only move to `Approved for recommendation` after a deliberate manual pharmacist review.
