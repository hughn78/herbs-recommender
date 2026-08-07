# Herbs of Gold — Corpus Taxonomy and Categorisation Model

**Date:** 2026-08-07 · **Corpus:** `docs/herbsofgold_scraped/` (originals preserved unchanged)
**Reports:** `data/reports/` (machine-readable companions to this document)

---

## 1. Source formats and their roles

The corpus contains the same underlying publication — the *Herbs of Gold
Technical Manual* (2023-10, 206 pp) — in four non-identical formats, plus a
prior 8-script extraction pipeline's outputs. **No single format contains
everything; each contributes unique material.**

| Format | Path (under `docs/herbsofgold_scraped/`) | Unique contribution | Limitations |
|---|---|---|---|
| PDF | `herbsofgold_technical_manual.pdf` | **Source of truth.** Dotted-leader ingredient tables (`Name …… 500mg`) that preserve strength alignment; authoritative pagination for citations (206 pages, ~3-page offset vs printed page numbers) | Layout artifacts across page breaks; mid-product page splits |
| DOCX | `herbsofgold_technical_manual.docx` | Clean prose monographs: 103 H1 product sections with subsections (Each capsule/tablet contains, Directions, Features & Benefits, Technical Information, Drug Interactions, Cautions, Side Effects, Companion Products). **Embeds 137 unique product pack-shot PNGs** positioned inside product sections | Product H1s repeat at page breaks (merge needed); 22 products have prose ingredient lists without strengths |
| XLSX | `herbsofgold_technical_manual.xlsx` | TOC with **110 product→page entries** (incl. 7 entries absent from the 103-product catalogue); independent cross-check for Word/Excel inconsistencies; also embeds the same pack shots with row anchors | Single flattened sheet (1422×67), sparse; not a structured data source |
| Markdown | `markdown/herbsofgold_technical_manual.md` | Readability cross-check; grep-friendly | No images; no independent facts |
| Inspect HTML | `inspect/01–04*.html` | Provenance evidence: manual lives behind a pharmacist-portal login | No product data |
| KB pipeline outputs | `HerbsOfGold_KnowledgeBase/output/` | Structured JSON/CSV/JSONL/XLSX: 103 products, 819 RAG chunks, validation reports, 144 logged extraction issues, 17 draft safety rules | Derived, not primary; all products default `Unreviewed` |

## 2. Product identity model

- **Canonical ID:** `HOG-0001 … HOG-0103` — stable, assigned by the prior
  pipeline from DOCX H1 + XLSX TOC cross-reference. Never derived from the
  mutable product name. The live DB seed carries the same code inside
  `products.notes`; Phase 4 promotes it to a first-class column.
- **Canonical name:** `product_name` (title-case display form) +
  `product_name_normalised` (lowercase, punctuation-stripped match key).
- **Identity evidence per product:** DOCX H1 heading, XLSX TOC row, PDF page
  index entry, markdown heading presence — cross-tabulated in
  `data/reports/cross_source.json`.
- **Ambiguous identities:** 7 XLSX TOC entries with no DOCX H1 —
  *Probiotic + SB, Lysine 1000 + Olive Leaf, Men's Multi +, Ultra Zinc +,
  Women's Multi +, Zinc Forte + C, Notes*. Treated as **catalogue-adjacent
  candidates**, never silently merged; they queue for pharmacist review.

## 3. Categorisation model

### 3.1 Product identity
`product_id, brand, product_name, product_name_normalised, dosage_form,
pack_size, austl (always empty in source — flagged), source_page,
source_references[]`

### 3.2 Ingredients (structured, never flattened)
Each ingredient row: `ingredient_name, ingredient_form, strength,
strength_unit, equivalent_amount, equivalent_unit, equivalent_name,
source_page, extraction_confidence`.
Example (HOG-0001 Acetyl L-Carnitine): *Acetyl levocarnitine hydrochloride
(acetyl L-carnitine hydrochloride) — 500 mg*.
Known gap class: multi-line standardised extracts
(`Gymnema sylvestre extract 100mg / derived from dry leaf minimum 2g /
stand. to contain Gymnemic acids 25mg`) are currently single-line; Phase 5
splits these into parent + equivalence rows.

### 3.3 Product use information
`directions.adult_dose / child_dose / raw_text`, `indications[]` (typed:
`source_label_claim` etc., with `source_page`), `counselling_points[]`,
`clinical_tags.clinical_use_tags[]` (268 applications across 103 products).

### 3.4 Safety information
`cautions[]` — severity-classified (high/medium/low) and type-classified
(`caution | contraindication | warning | pregnancy_breastfeeding |
child_use | allergy`), each carrying `avoid_if_tag` mappings;
`interactions[]` (148 medicine-interaction flags); 17 draft safety rules.
Wording is preserved verbatim from the source — **no inferred interactions**.

### 3.5 Evidence and provenance
Every structured field group retains `source_page`; product-level
`source_references[]` tie back to manual pages. Pipeline-level provenance
(source file, sha256, extraction date) is in
`data/reports/source_inventory.json`. Review state: every product is
currently `Unreviewed`; the corpus ships its own review queue
(`validation_report.xlsx → Pharmacist_Review_Required`).

### 3.6 Claim typing (kept distinct per mission)
| Claim class | Source in corpus | Authoritative? |
|---|---|---|
| Manufacturer indication | `indications[]`, Features & Benefits | Yes (as manufacturer claim) |
| Ingredient fact | `ingredients[]` | Yes |
| Safety warning | `cautions[]`, `interactions[]` | Yes |
| General educational content | Technical Information prose | Reference only |
| Inferred search synonym | (Phase 6 ontology) | No — needs approval |
| Internal pharmacist rule | `safety_rules_draft.json`, app `safety_rules` | Curated, not manufacturer |

## 4. Image asset model (Phase 3 output)

- **137 unique product pack shots** (>20 KB, content-hash distinct), embedded
  in both DOCX (`word/media/`) and XLSX (`xl/media/`).
- Image→product matching uses **positional identity evidence**: DOCX
  Heading-1 section containment and XLSX anchor-row vs product-name row —
  never folder proximity. Each image gets a match confidence (majority vote
  across occurrences).
- One image per product is marked **primary** (largest matched pack shot);
  extras are retained as alternates.
- ~120–133 small graphics are classified `boilerplate` (logos/icons) and
  excluded from the catalogue.
- Manifest: `data/reports/image_manifest.json`; coverage:
  `data/reports/image_audit.json`.

## 5. Quality audit summary (machine-readable: `data/reports/corpus_audit.json`)

From the corpus's own validation + this pipeline's cross-checks:

- 103 products; 0 duplicate canonical names.
- Missing: ingredients 22 · dose 2 · cautions 13 · dosage form 4 ·
  AUST L 103 (absent from source — TGA ARTG lookup is a manual review task).
- Extraction confidence: 78 High / 25 Medium / 0 Low.
- 144 extraction issues logged, typed (`missing_ingredient`, …), each with
  product, source page, severity and suggested action — these seed the
  Phase 14 governance queue.
- Cross-source conflicts: see `data/reports/conflicts.json`
  (`word_excel_inconsistencies`, `possible_errors`).

## 6. What this taxonomy feeds

- **Phase 4** — governed catalogue schema mirroring §3 (products, variants,
  images, ingredients, indications, directions, warnings, keywords,
  source documents/sections/claims, ingestion runs, conflicts, review
  actions).
- **Phase 5** — idempotent ingestion keyed on `product_id` + source hashes.
- **Phase 6** — ontology seeded from `clinical_use_tags` / `avoid_if_tags` /
  symptom wording, all marked with provenance type.
- **Phase 7** — recommendation engine whose candidates, exclusions and
  citations resolve back to these structured claims and source pages.
