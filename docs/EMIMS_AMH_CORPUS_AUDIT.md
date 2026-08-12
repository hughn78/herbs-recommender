# Forensic Audit: eMIMS & AMH Australian Medication Corpora

**Audit Date:** 2026-08-12  
**Auditor:** Hermes Agent (automated forensic analysis)  
**Purpose:** Evaluate two local medication reference corpora for extraction into a pharmacy recommendation engine  

---

## 1. Exact Corpus Statistics

### 1.1 eMIMS Abbreviated Product Information

| Metric | Value |
|---|---|
| **Root path** | `/Volumes/1TB-SSD/Hermes-Agent/Independent-Repos/emims_scraped/abbrev_pi` |
| **Total files on disk** | 16,740 |
| **Real .md files** | **8,370** |
| **macOS resource fork files (._*)** | 8,370 (1:1 with real files) |
| **Non-.md files** | 0 |
| **Directory structure** | Flat — all files in single directory, no subdirectories |
| **Total disk size (du -sh)** | 2.0 GB (includes resource forks; actual .md content ~22.4 MB) |
| **Actual .md content size** | 22,413,679 bytes (22.4 MB) |
| **File size — min** | 519 bytes |
| **File size — max** | 18,424 bytes |
| **File size — mean** | 2,678 bytes |
| **File size — median** | 2,136 bytes |
| **Empty files (0 bytes)** | 0 |
| **Naming convention** | Slugified brand/product names: lowercase, hyphens, no spaces (e.g. `apo-atorvastatin.md`) |

**Parent directory also contains:**
- `drug_index.json` — 13,905 entries (all type `brand`), each with `id`, `name`, `type`, `offMarket`, `term`
  - On market: 8,364; Off market: 5,541
- `raw/`, `merged/`, `drug_interactions/`, `scripts/`, `logs/` directories (scrape artifacts)

**Scrape date:** All files scraped 2026-06-10 (8,366 unique timestamps, range 20:00–23:35 on that date)

### 1.2 AMH (Australian Medicines Handbook) Scrape

| Metric | Value |
|---|---|
| **Root path** | `/Volumes/1TB-SSD/Hermes-Agent/Independent-Repos/amh_scraped` |
| **Total files (excl. browser_profile)** | 1,621 |
| **Real .md files** | **1,608** |
| **macOS resource fork files (._*)** | 325 |
| **Metadata/log files** | 8 .txt, 2 .json, 1 .html, 1 .DS_Store |
| **Total disk size (du -sh)** | 294 MB (includes browser_profile cache; actual .md content ~5.0 MB) |
| **Actual .md content size** | 5,258,472 bytes (5.0 MB) |
| **File size — min** | 265 bytes |
| **File size — max** | 17,080 bytes |
| **File size — mean** | 3,270 bytes |
| **File size — median** | 2,888 bytes |
| **Empty files (0 bytes)** | 0 |
| **Directory structure** | Hierarchical — 35 top-level directories (therapeutic chapters + drug-specific dirs) |
| **Naming convention** | Slugified drug/section names within chapter directories |

**Metadata files:**
- `_drug_index.json` — 52 entries; alphabetical index links (A–Z) to AMH Online drug monograph pages. Not a drug list — just navigation links.
- `_chapter_index.json` — structured JSON with `chapters` (19 entries with name + URL) and `drugs` (195 entries with chapter, drug name, URL, file path). Some URLs contain tab-character corruption (`\t\t\t\t\t\t\t\t\t\t`).
- `_scrape_log.txt`, `_scrape_log_v2.txt`, `_scrape_log_v3.txt`, `_scrape_log_v4.txt` — progressive scrape logs
- `_chapter_scrape_log.txt` (12.7 KB), `_chapter_scrape_v2_log.txt` (255 KB) — detailed chapter scrape logs
- `_browser_log.txt`, `_diag_output.txt` — debugging artifacts
- `_home.html` — saved AMH Online homepage HTML
- `browser_profile/` — full Chromium profile (cache, cookies, etc.) — should be excluded from corpus

**Scrape dates:** 2 unique dates — 875 files scraped 2026-06-01, 733 files scraped 2026-05-31

### 1.3 AMH Directory Structure

**35 top-level directories** (mix of therapeutic chapters and drug-specific sub-trees):

| Chapter directory | .md file count | Notes |
|---|---|---|
| anti-infectives | 214 | Largest chapter |
| anticancer-drugs | 200 | |
| cardiovascular-drugs | 158 | |
| dermatological-drugs | 118 | |
| endocrine-drugs | 106 | |
| gastrointestinal-drugs | 97 | |
| eye-drugs | 82 | |
| neurological-drugs | 80 | |
| blood-and-electrolytes | 76 | |
| immunomodulators-and-anti-inflammatories | 66 | |
| ear-nose-and-throat-drugs | 55 | |
| anaesthetics | 45 | |
| genitourinary-drugs | 37 | |
| antidotes-and-antivenoms | 32 | |
| analgesics | 28 | |
| allergy-and-anaphylaxis | 19 | |
| sedating-antihistamines | 15 | Drug-specific sub-tree |
| adrenaline-epinephrine-anaphylaxis | 14 | Drug-specific sub-tree |
| promethazine | 13 | Drug-specific sub-tree |
| less-sedating-antihistamines | 13 | Drug-specific sub-tree |
| cyclizine | 13 | Drug-specific sub-tree |
| doxylamine | 12 | Drug-specific sub-tree |
| diphenhydramine | 12 | Drug-specific sub-tree |
| dexchlorpheniramine | 11 | Drug-specific sub-tree |
| cyproheptadine | 11 | Drug-specific sub-tree |
| loratadine | 10 | Drug-specific sub-tree |
| fexofenadine | 10 | Drug-specific sub-tree |
| desloratadine | 10 | Drug-specific sub-tree |
| cetirizine | 10 | Drug-specific sub-tree |
| bilastine | 10 | Drug-specific sub-tree |
| allergy | 7 | |
| management-of-anaphylaxis | 7 | |
| antihistamines | 8 | |
| comparison-of-antihistamines | 8 | |
| sympathomimetics-anaphylaxis | 1 | |

**Key observation:** The antihistamine family has been scraped with a nested structure — drug-specific directories (e.g. `cetirizine/`, `bilastine/`) contain sub-section files (`adverse-effects.md`, `counselling.md`, `administration-advice.md`, `practice-points.md`, etc.) as separate files, while the same drugs also appear in `allergy-and-anaphylaxis/` as combined monographs. This creates significant duplication.

### 1.4 Unique Medicine Count

**eMIMS:**
- **1,794 unique generic names** extracted from `**Generic name:**` header field
- Many generic names are not single molecules but supplement ingredients (e.g. "cannabidiol" with 1,084 brand variants, "ascorbic acid" with 245, "amino acids" with 114)
- Top drug brand variants: cannabidiol (1,084), tetrahydrocannabinol (564), ascorbic acid (245), nicotine (101), paracetamol (58), ibuprofen (47)
- The drug_index.json has 13,905 brand entries (8,364 on-market, 5,541 off-market), but only 8,370 .md files were scraped (all on-market products)

**AMH:**
- **1,422 unique drug/condition names** from frontmatter `drug:` field (from 1,495 monograph + class/condition files)
- 113 sub-section files (adverse-effects.md, counselling.md, etc.) are fragments, not drug monographs
- File categorization: ~1,491 drug monographs, 66 class/comparison files, 19 condition files, 32 other
- 134 combination products identified (containing "with" or "and" in drug name)

### 1.5 Combination Products

**eMIMS:** ~1,209 files match combination product filename patterns (hyphenated multi-ingredient names with numeric dosing patterns like `apo-perindopril-indapamide-4-1-25.md`). The `**Generic name:**` field for combinations typically lists only the primary ingredient (e.g. "Indapamide hemihydrate" for a perindopril+indapamide product), which makes automated detection harder from the generic name alone.

**AMH:** 134 combination products identified from drug names containing " with " or " and " (e.g. "Perindopril with indapamide", "Amlodipine with atorvastatin", "Amoxicillin with clavulanic acid"). These are consistently named in the pattern `{Drug A} with {Drug B}`.

### 1.6 Therapeutic Categories / Drug Classes

**eMIMS:** 271 unique MIMS Class values, including multi-class assignments (e.g. "Antihypertensive agents; Antiangina agents"). Top classes:
- Other central nervous system agents; Unapproved therapeutic goods (1,736)
- Supplemental and enteral nutrition (274)
- Other antineoplastic agents (199)
- Surgical antiseptics and applications (181)
- Antihypertensive agents (177)

**AMH:** 16 primary therapeutic chapters (from frontmatter `chapter:` field), plus 19 sub-chapter entries in `_chapter_index.json`. The 35 top-level directories include both therapeutic chapters and drug-specific sub-trees (antihistamine family).

### 1.7 Duplicates and Malformed Files

**eMIMS:**
- 0 exact duplicate files (same size + same first 200 chars)
- 0 empty files
- 8 files missing `## Available Products` section — all are sodium chloride infusion products (~520 bytes each, truncated/stub files)
- 8,362 of 8,370 files have all 8 expected `##` sections (99.9% completeness)
- 8,370 resource fork (`._*`) files are macOS artifacts — should be excluded

**AMH:**
- 0 empty .md files
- 41 duplicate filenames across different directories (same filename, different content) — these are mostly legitimate: sub-section files (`adverse-effects.md`, `counselling.md`) appearing in multiple drug-specific directories, and drug monographs appearing in both the antihistamine sub-tree and the `allergy-and-anaphylaxis` chapter
- Duplicate content with different frontmatter (same drug scraped from different navigation paths)
- 74 files contain navigation noise ("Blackshaws Road Night Chemist", "Go ?", "Therapeutics", "Chapters", "Calculators", "Drugs") — website navigation elements not stripped during scraping
- 325 resource fork files — should be excluded
- `browser_profile/` directory (Chromium profile data) should be excluded — not part of the corpus

---

## 2. Field Inventory

### 2.1 eMIMS File Structure

Every eMIMS file follows a consistent format:

```
# {Brand Product Name}
**Generic name:** {generic name}
**Sponsor / manufacturer:** {company}
**MIMS Class:** {1-2 semicolon-separated classes}
**Use in Pregnancy:** {A|B1|B2|B3|C|D|X}  
  {Pregnancy category description}
**ARTG:** {Registered Medicine|Listed Medicine|Registered Medical Device}
**Sports:** {sports status}
**Indications:** {semicolon-separated indication keywords}

**eMIMSplus drug ID:** `{UUID}
**Scraped:** {ISO timestamp}

---

## Abbreviated Product Information

## Use
{free text — 1-3 sentences}

## Contraindications
{free text — semicolon-separated conditions}

## Precautions
{free text — semicolon-separated conditions}

## Adverse Effects
{free text — semicolon-separated effects}

## Interactions
{free text — "See Contra;" then interaction descriptions}

## Additional Information
{free text or _(no data)_}

## Available Products

### {Product Name} ({Schedule})
**Composition:** {ingredients; excipients; physical description}
**Dose:** {dosing instructions}
**Food:** {food interaction note}
**Sedating:** {Yes|No}

| Pack | ARTG |
|---|---|
| {pack description} | {ARTG number} |
```

### 2.2 eMIMS Header Field Statistics

| Field | Present in (of 8,370) | Notes |
|---|---|---|
| Generic name | 8,370 (100%) | 1,794 unique values |
| Sponsor / manufacturer | 8,370 (100%) | Top: Arrotex (519), Sandoz (233), Alphapharm (216) |
| MIMS Class | 8,370 (100%) | 271 unique, multi-class separated by `;` |
| Use in Pregnancy | 8,370 (100%) | A:502, B1:471, B2:457, B3:902, C:954, D:1,158, X:103 |
| ARTG | 8,370 (100%) | Registered Medicine:4,589, Listed Medicine:768, Registered Medical Device:169 |
| Sports | 8,370 (100%) | Multiple distinct status strings |
| Indications | 5,822 (70%) | Semicolon-separated keywords (absent in 2,548 files) |
| eMIMSplus drug ID | 8,370 (100%) | UUID format |
| Scraped | 8,370 (100%) | ISO timestamp |

### 2.3 eMIMS Section Presence & Quality

| Section | Present | Empty/Placeholder | Notes |
|---|---|---|---|
| ## Use | 8,370 (100%) | 60 (0.7%) | Core clinical use description |
| ## Contraindications | 8,370 (100%) | 1,078 (12.9%) | Often empty for OTC/supplement products |
| ## Precautions | 8,370 (100%) | 564 (6.7%) | |
| ## Adverse Effects | 8,370 (100%) | 913 (10.9%) | |
| ## Interactions | 8,370 (100%) | 884 (10.6%) | Often "See Contra;" only |
| ## Additional Information | 8,370 (100%) | 1,795 (21.4%) | 7,949 have `_(no data)_` placeholder |
| ## Available Products | 8,362 (99.9%) | N/A | 8 files missing (NaCl infusion stubs) |

*(Empty/placeholder counts from 2,000-file sample, scaled to percentages)*

### 2.4 eMIMS Available Products Sub-section

Within the `## Available Products` section, each product has:
- `### {Product Name} ({Schedule})` — S4 (4,429 mentions), S8 (1,733), S2 (362), S3 (242), S5 (2), S6 (8)
- `**Composition:**` — active ingredients, excipients, physical description
- `**Dose:**` — dosing instructions with specific mg ranges
- `**Food:**` — "No PPPA Defined", "May be taken with or without food.", "Should be taken with food."
- `**Sedating:**` — "Yes" or "No"
- Pack/ARTG table — pack sizes with ARTG registration numbers (e.g. `AUSTR286636`)

~10% of files (first 2,000 sample: 201 files) have multiple product entries under Available Products.

### 2.5 AMH File Structure

Every AMH file has YAML frontmatter:

```yaml
---
source: AMH Online
chapter: {therapeutic-chapter-slug}
drug: {Drug Name}
url: {AMH Online URL}
scraped_at: {ISO timestamp with microseconds}
---
```

Body structure uses **plain text section headers** (not Markdown `##` headings). Section names appear as standalone lines surrounded by blank lines:

```
# {Drug Name}

{Drug Name}

{Drug class}

See also {condition/class}

For additional information see {Class name}

For drug interactions see {Drug/Class}

HIDE CLASS                    ← scraper artifact, present in 552 files

Mode of action
{free text or "Mode of action from {Class}"}

Indications
{bullet-like entries}

Precautions
{free text}

Hepatic
{free text}

Renal
{free text}

Surgery
{free text}

Elderly
{free text}

Children
{free text}

Women
{free text}

Pregnancy
{free text}

Breastfeeding
{free text — often "Safe to use."}

Adverse effects
Common (>1%)
{items}
Infrequent (0.1–1%)
{items}
Rare (<0.1%)
{items}

Dosage – {Drug Name}
{indication}
Adult
{dosing text}
Child >{age}
{dosing text}

Counselling
{patient advice text}

Practice points
{clinical tips — may include "Practice points from {Class}"}

Products
Search for {Drug} on the PBS
{PBS listing table: form, strength, pack, brands, PBS code}
{Drug} combinations
{list of combination products}
```

### 2.6 AMH Section Presence Statistics

| Section | Files containing section | Notes |
|---|---|---|
| Mode of action | 935 (58%) | Often references class: "Mode of action from {Class}" |
| Indications | 1,016 (63%) | |
| Precautions | 943 (59%) | |
| Adverse effects | 924 (57%) | |
| Dosage | 869 (54%) | Heading format: "Dosage – {Drug}" or "Dosage" |
| Counselling | 661 (41%) | Patient-facing advice |
| Practice points | 869 (54%) | Clinical tips; 870 as standalone, many "from {Class}" |
| Products | 841 (52%) | PBS listings + combination products |
| Pregnancy | 935 (58%) | |
| Breastfeeding | 783 (49%) | Often "Safe to use." |
| Elderly | 234 (15%) | |
| Children | 212 (13%) | |
| Women | 129 (8%) | Pre-pregnancy advice |
| Renal | 398 (25%) | Renal impairment dosing |
| Hepatic | 406 (25%) | Hepatic impairment advice |
| Surgery | 152 (9%) | Perioperative advice |
| Administration advice | 226 (14%) | |
| Common (>1%) | 783 (49%) | Adverse effect frequency |
| Infrequent (0.1–1%) | 529 (33%) | Adverse effect frequency |
| Rare (<0.1%) | 602 (37%) | Adverse effect frequency |
| Accepted | 83 (5%) | Off-label accepted indications |
| Comparative information | 96 (6%) | Class comparison tables |
| Drug choice | 39 (2%) | |

### 2.7 AMH Class-Level References

AMH monographs frequently reference class-level information:
- `For additional information see {Class}` — 636 files (40%)
- `For drug interactions see {Drug/Class}` — 644 files (40%)
- `HIDE CLASS` marker (scraper artifact) — 552 files (34%)
- `{Section} from {Class}` pattern — used for Mode of action, Precautions, Adverse effects, Practice points, Indications

Top class references: Corticosteroids (127), Cephalosporins (93), Antimetabolites (67), Anticholinergics (64), Azoles (64), Penicillins (57), Sartans (47), Antihistamines (37), Triptans (36), Bisphosphonates (35), Statins (35).

### 2.8 Detailed Sample File Analysis

#### eMIMS: apo-atorvastatin.md (representative)

| Field | Value |
|---|---|
| Generic name | Atorvastatin |
| MIMS Class | Hypolipidaemic agents |
| Pregnancy | D |
| ARTG | Registered Medicine |
| Sports | Permitted in sport |
| Use | HMG-CoA reductase inhibitor; hypercholesterolaemia |
| Contraindications | Active hepatic disease; pregnancy; lactation; fusidic acid; etc. |
| Precautions | Monitor LFTs; CK; myopathy risk; renal impairment; etc. |
| Adverse Effects | GI upset; nasopharyngitis; rhabdomyolysis; SCAR; etc. |
| Interactions | CYP3A4 inhibitors; fibrates; ciclosporin; colchicine; etc. |
| Additional Information | _(no data)_ |
| Available Products | 1 product (APO-Atorvastatin Tablets S4), 4 pack sizes (10/20/40/80mg ×30) |
| Composition | Atorvastatin (Ca trihydrate); lactose monohydrate; Gluten Free |
| Dose | 10-80 mg once daily with specific max doses for interactions |
| Food | May be taken with or without food |
| Sedating | No |

#### eMIMS: apo-perindopril-indapamide-4-1-25.md (combination product)

| Field | Value |
|---|---|
| Generic name | **Indapamide hemihydrate** (only one ingredient listed despite being a combination) |
| MIMS Class | Antihypertensive agents |
| Pregnancy | D |
| Sports | Banned in sport |
| Use | ACE inhibitor + diuretic. Hypertension |
| Available Products | 1 product (APO-Perindopril/Indapamide 4/1.25 Tablets S4) |

**Key finding:** eMIMS combination products list only one generic name in the header, making it difficult to identify all active ingredients from the header alone. The full composition is in the Available Products section.

#### eMIMS: apo-levothyroxine.md (drug with renal/pregnancy considerations)

| Field | Value |
|---|---|
| Pregnancy | A (safe) |
| Precautions | Not interchangeable between brands; monitor TSH; not for obesity |
| Additional Information | (Distrib. Arrotex) — one of few files with actual data here |

#### AMH: endocrine-drugs/metformin.md (representative)

| Section | Content |
|---|---|
| Frontmatter | chapter: endocrine-drugs, drug: Metformin |
| Mode of action | Reduces hepatic glucose production; increases peripheral utilisation |
| Indications | Type 2 diabetes; PCOS (accepted, under specialist) |
| Elderly | Use cautiously; check renal function |
| Pregnancy | Usually replaced with insulin; appears safe but caution |
| Breastfeeding | Safe to use |
| Adverse effects | Common: nausea, vomiting, diarrhoea, B12 malabsorption; Rare: lactic acidosis, hepatitis |
| Dosage | Adult: 500mg 1-3 times daily, max 3g; Child >10y: 500-850mg daily; PCOS protocol |
| Counselling | Patient advice on GI effects, alcohol, B12 symptoms |
| Practice points | Slow onset; check renal function; titrate slowly; PCOS/IVF data |
| Products | PBS listings: tab 500mg/850mg/1g, conventional + controlled release; 7 combination products listed |

#### AMH: cardiovascular-drugs/atorvastatin.md (class-referencing example)

| Section | Content |
|---|---|
| Mode of action | "Mode of action from Statins" — references class monograph |
| Indications | Hypercholesterolaemia; + "Indications from Statins" |
| Precautions | Drug-specific + "Precautions from Statins" (intercurrent illness, myopathy, fusidate, myasthenia gravis) |
| Renal | Impairment increases myopathy risk; start low dose |
| Hepatic | Use cautiously; monitor aminotransferases |
| Surgery | Continue during perioperative period |
| Elderly | Risk of myopathy higher; start low dose |
| Children | May start from age 8 for familial hypercholesterolaemia |
| Women | Avoid in women planning conception |
| Pregnancy | Generally avoid; specialists may advise for very high risk |
| Breastfeeding | Avoid |
| Adverse effects | "Adverse effects from Statins" with Common/Rare breakdown; muscle symptoms; aminotransferases; diabetes risk |
| Dosage | 10-80mg once daily; specific max doses for interactions |
| Counselling | Grapefruit juice warning; dark urine/muscle pain warning |
| Practice points | Don't stop statin in ACS; first choice for hypercholesterolaemia; monitoring advice |

#### AMH: analgesics/oxycodone.md (controlled drug with substantial warnings)

- Size: 10,392 bytes (among the largest AMH files)
- Contains all major sections including detailed dosage by formulation (immediate release, controlled release, oral liquid, suppository, injection)
- Products section includes 17 PBS line items with specific restrictions (authority codes)

---

## 3. Cross-Corpus Comparison

### 3.1 Structural Differences

| Dimension | eMIMS | AMH |
|---|---|---|
| **File organisation** | Flat directory, one file per brand/product | Hierarchical by therapeutic chapter, one file per generic drug |
| **File count** | 8,370 (brand-level) | 1,608 (generic + sub-sections) |
| **Unique drugs** | ~1,794 generic names | ~1,422 drug/condition names |
| **Format** | Markdown with `**bold**` field labels | YAML frontmatter + plain text body |
| **Section headings** | Markdown `##` headings (100% consistent) | Plain text lines (no markdown heading markers) |
| **Metadata** | Inline `**Field:**` values in header | YAML frontmatter (structured) |
| **Dosing info** | Within Available Products `**Dose:**` field | Separate "Dosage – {Drug}" section with indication-specific subheadings |
| **Products** | Pack-level: specific ARTG numbers, pack sizes | PBS-level: form, strength, pack size, brand names, PBS codes |
| **Adverse effects** | Single free-text paragraph | Structured by frequency: Common (>1%), Infrequent (0.1–1%), Rare (<0.1%) |
| **Pregnancy** | Category letter (A/B1/B2/B3/C/D/X) | Narrative text with clinical context |
| **Breastfeeding** | Not a separate section | Dedicated section, often "Safe to use." |
| **Drug class** | MIMS Class field (271 values) | Inferred from chapter directory + class references |
| **Combination products** | Separate brand files, generic name lists primary ingredient only | Named "{A} with {B}", single file per combination |
| **Interactions** | Free text in Interactions section | "For drug interactions see {Drug/Class}" reference |
| **Counselling** | Not present as section | Present in 661 files (41%) |
| **Practice points** | Not present | Present in 869 files (54%) — clinical tips |

### 3.2 Fields Unique to Each Corpus

**eMIMS-only fields:**
- MIMS Class (structured drug class)
- Pregnancy category letter (A/B1/B2/B3/C/D/X)
- ARTG status (Registered/Listed Medicine/Device)
- Sports status
- eMIMSplus drug ID (UUID)
- Sponsor/manufacturer
- Indications keywords (semicolon-separated)
- Available Products with Composition, Dose, Food, Sedating
- ARTG registration numbers per pack
- Schedule (S2/S3/S4/S5/S6/S8)

**AMH-only fields:**
- YAML frontmatter (source, chapter, drug, url, scraped_at)
- Mode of action
- Dosage section with indication-specific regimens
- Adverse effects by frequency (Common/Infrequent/Rare)
- Counselling (patient-facing advice)
- Practice points (clinical pearls)
- Products with PBS listings
- Elderly section
- Children section
- Women section
- Surgery section
- Renal impairment dosing section
- Hepatic impairment section
- Breastfeeding section
- Accepted (off-label indications)
- Comparative information
- Drug choice
- Administration advice
- Class-level references ("from {Class}")

### 3.3 Drug Naming Differences

| Concept | eMIMS name | AMH name |
|---|---|---|
| Atorvastatin | Atorvastatin (generic name) | Atorvastatin (frontmatter drug) |
| Metformin | Metformin hydrochloride | Metformin |
| Perindopril + Indapamide | Indapamide hemihydrate (generic lists only one) | Perindopril with indapamide |
| Levothyroxine | Levothyroxine sodium | Levothyroxine |
| Oxycodone | Oxycodone hydrochloride | Oxycodone |
| Paracetamol | Paracetamol | Paracetamol (in analgesics chapter, not neurological) |
| Adrenaline | Adrenaline (epinephrine) | Adrenaline (epinephrine) |

eMIMS uses salt forms in generic names ("hydrochloride", "sodium", "hemihydrate"); AMH uses bare generic names.

### 3.4 Cross-Corpus Coverage

- 924 of 1,432 AMH drug names (64.5%) have a match in eMIMS generic names (exact or partial)
- 508 AMH drug names have no eMIMS match — these include:
  - Drug classes (e.g. "ACE inhibitors", "Statins", "Azoles")
  - Conditions (e.g. "Acne", "Acute pain", "Allergic rhinitis")
  - Non-Unicode characters in names (e.g. "5ht3\xa0antagonists" — non-breaking space corruption)
  - Some individual drugs not present in eMIMS (e.g. alendronate — likely present but under a different name)

### 3.5 Clinical Content Comparison (Atorvastatin)

| Aspect | eMIMS | AMH |
|---|---|---|
| Pregnancy | Category D | "In general, avoid use; specialists may advise for very high risk" — more nuanced |
| Renal | "rhabdomyolysis risk eg renal impairment history" | "Impairment increases risk of myopathy and rhabdomyolysis; start at low dose and monitor renal function and CK regularly" |
| Interactions | Comprehensive list including CYP3A4 inhibitors, inducers, fibrates, ciclosporin, colchicine | References "Statins" class-level interactions; specific max doses for ciclosporin (10mg), clarithromycin (20mg) |
| Dosing | 10-80mg once daily | 10-80mg once daily (agrees) + child >8y dosing |
| Adverse effects | List including SCAR, lupus-like syndrome | Frequency-stratified: myalgia (>1%), rhabdomyolysis (<0.1%); diabetes risk discussed |

---

## 4. Extraction Feasibility

### 4.1 Relably Parseable Fields (Structured/Consistent)

**eMIMS — high confidence:**
| Field | Extractability | Method |
|---|---|---|
| Generic name | ✅ 100% | Regex: `**Generic name:**\s*(.+)` |
| MIMS Class | ✅ 100% | Regex: `**MIMS Class:**\s*(.+)` — split on `;` for multi-class |
| Pregnancy category | ✅ 100% | Regex: `**Use in Pregnancy:**\s*([A-Z]\d?)` — discrete values A/B1/B2/B3/C/D/X |
| ARTG status | ✅ 100% | Regex — 3 discrete values |
| Sports status | ✅ 100% | Regex — multiple distinct strings |
| eMIMSplus drug ID | ✅ 100% | Regex — UUID format |
| Scrape date | ✅ 100% | Regex — ISO timestamp |
| Sponsor/manufacturer | ✅ 100% | Regex |
| Schedule (S2-S8) | ✅ 100% | Regex on `### {Product} ({S\d})` |
| Available Products | ✅ 99.9% | Parse `### ` headings + `**Field:**` patterns |
| Composition | ✅ ~100% | Regex within Available Products |
| Pack/ARTG table | ✅ ~100% | Markdown table parsing |
| Food | ✅ ~100% | Discrete set of values |
| Sedating | ✅ ~100% | Binary: Yes/No |

**AMH — high confidence:**
| Field | Extractability | Method |
|---|---|---|
| Chapter (drug class proxy) | ✅ 100% | YAML frontmatter `chapter:` field |
| Drug name | ✅ 100% | YAML frontmatter `drug:` field |
| URL | ✅ 100% | YAML frontmatter `url:` field |
| Scrape date | ✅ 100% | YAML frontmatter `scraped_at:` field |
| Breastfeeding status | ✅ ~49% | "Safe to use." pattern detection |
| Adverse effect frequency | ✅ ~49% | "Common (>1%)", "Infrequent (0.1–1%)", "Rare (<0.1%)" section markers |

### 4.2 Semi-Structured Fields (Parseable with moderate effort)

**eMIMS:**
| Field | Extractability | Challenge |
|---|---|---|
| Use section | ⚠️ Free text | Semicolon-separated abbreviations; NLP needed for structured extraction |
| Contraindications | ⚠️ Free text | Semicolon-separated conditions; some medical abbreviations |
| Precautions | ⚠️ Free text | Semicolon-separated; contains sub-tags (`<sub>`, `<sup>`) in 88/500 files |
| Adverse Effects | ⚠️ Free text | Semicolon-separated; no frequency stratification |
| Interactions | ⚠️ Free text | "See Contra;" prefix; semicolon-separated |
| Indications keywords | ⚠️ 70% coverage | Semicolon-separated keywords, but absent in 30% of files |
| Dose | ⚠️ Semi-structured | Free text with numeric values; parseable but complex |
| Combination ingredients | ⚠️ Hard | Generic name field lists only one ingredient; must parse Composition field |

**AMH:**
| Field | Extractability | Challenge |
|---|---|---|
| Mode of action | ⚠️ Free text | May be "from {Class}" reference |
| Indications | ⚠️ Free text | Mix of condition names and clinical context |
| Precautions | ⚠️ Free text | Mix of drug-specific and "from {Class}" content |
| Dosage | ⚠️ Semi-structured | Indication → population → regimen pattern, but format varies |
| Pregnancy | ⚠️ Free text | Clinical narrative — no category letter; NLP needed |
| Renal/Hepatic | ⚠️ Free text | Clinical advice text |
| Products (PBS) | ⚠️ Semi-structured | Tabular: form, strength, pack, brands, PBS code — parseable but complex format |
| Class references | ⚠️ Parseable | "from {Class}" pattern identifies class-level information |

### 4.3 Unstructured Fields (Require NLP/LLM)

**eMIMS:**
- Use section — clinical indication description
- Contraindications — condition list with medical abbreviations
- Precautions — complex clinical reasoning
- Adverse Effects — effect list with rare/common qualifiers embedded in text
- Interactions — complex interaction descriptions with drug names, monitoring advice

**AMH:**
- Practice points — clinical pearls (free text paragraphs)
- Counselling — patient-facing advice (free text)
- Comparative information — comparison tables (complex formatting)
- Elderly/Children/Women — clinical context paragraphs

### 4.4 Section Heading Consistency

**eMIMS:** 99.9% consistency — 8,362 of 8,370 files have exactly 8 `##` sections (Use, Contraindications, Precautions, Adverse Effects, Interactions, Additional Information, Available Products, Abbreviated Product Information). The 8 exceptions are sodium chloride infusion stubs. **This is exceptional consistency for a scraped corpus.**

**AMH:** ~60% section coverage — sections are plain text headers (not markdown), and coverage varies significantly:
- Only 6 sections appear in >50% of files (Mode of action, Indications, Precautions, Adverse effects, Pregnancy, Practice points)
- Dosage appears in 54% (869/1,608)
- Products appears in 52% (841/1,608)
- Many important sections (Renal, Hepatic, Elderly, Children) appear in <25% of files
- The "Dosage" heading format varies: "Dosage", "Dosage – {Drug Name}", "Dosage – {Drug Name}" with en-dash

### 4.5 Strength/Form/Route Extraction

**eMIMS:** Strength and form can be partially parsed from:
- Available Products `### {Product Name} ({Schedule})` heading — contains form (Tablets, Solution for infusion, etc.)
- `**Composition:**` field — contains strength (e.g. "10 mg")
- Pack table — pack descriptions include strength (e.g. "Pack 10 mg [30]")
- Dose field — contains dosing ranges

**AMH:** Strength/form/route can be parsed from:
- Products section: "tab, 5 mg, 30, {brands}, PBS" format — form, strength, pack size
- Dosage section: "Conventional tablet, initially 500 mg" — form and dose
- Dosage section explicitly mentions route (oral, IV, etc.)

### 4.6 Drug Class Determination

**eMIMS:** The `MIMS Class` field provides drug class directly. 271 unique class values, some multi-class (semicolon-separated). Examples: "Hypolipidaemic agents", "Antihypertensive agents", "Antidepressants". This is reliable and structured.

**AMH:** Chapter membership (from frontmatter `chapter:` field or directory path) provides a coarse therapeutic class (16 chapters). The class-level references ("from Statins", "from Penicillins") provide finer-grained drug class. The `_chapter_index.json` provides the hierarchical chapter tree with 19 named chapters.

### 4.7 Pregnancy Category Extraction

**eMIMS:** Directly extractable — discrete category field with values A, B1, B2, B3, C, D, X. Present in 100% of files. Distribution:
- A: 502 (6.0%), B1: 471 (5.6%), B2: 457 (5.5%), B3: 902 (10.8%)
- C: 954 (11.4%), D: 1,158 (13.8%), X: 103 (1.2%)

**AMH:** No category letter — pregnancy information is narrative text in a "Pregnancy" section (935 files, 58%). Must use NLP/LLM to extract clinical pregnancy advice. Some files include "See also Pregnancy in {condition}" cross-references.

---

## 5. Quality Issues

### 5.1 macOS Resource Fork Pollution

Both corpora are on an external SSD and contain macOS resource fork files (`._*`):
- eMIMS: 8,370 `._*` files (1:1 ratio with real files)
- AMH: 325 `._*` files plus `.DS_Store` files

**Impact:** These inflate file counts and must be excluded during processing. They are 4,096 bytes each (macOS metadata).

### 5.2 AMH Browser Profile Pollution

The `amh_scraped/browser_profile/` directory contains a full Chromium browser profile (cache, cookies, LevelDB databases, shader caches). This should be excluded from the corpus — it's scrape infrastructure, not data.

### 5.3 AMH Navigation Noise

74 AMH .md files contain website navigation elements not stripped during scraping:
- "Blackshaws Road Night Chemist"
- "Go ?"
- "Therapeutics"
- "Chapters"
- "Calculators"
- "Drugs"

These appear as false section headers in content analysis and should be filtered during processing.

### 5.4 AMH URL Corruption

The `_chapter_index.json` contains drug entries with corrupted URLs containing multiple tab characters:
```
"url": "https://amhonline.amh.net.au\t\t\t\t\t\t\t\t\t\t/chapters/..."
```
This affects the `drugs` array in `_chapter_index.json` but not the frontmatter URLs in individual .md files (which are clean).

### 5.5 AMH Non-Breaking Space Corruption

Some AMH drug names in frontmatter contain non-breaking space characters (`\xa0`) instead of regular spaces:
- "5ht3\xa0antagonists" (should be "5HT3 antagonists")
- "amphotericin\xa0b" (should be "Amphotericin B")
- "glucagon-like peptide‑1" (non-breaking hyphen U+2011)

This will cause issues with string matching and deduplication.

### 5.6 AMH Structural Duplication

The antihistamine family has been scraped with two approaches:
1. Drug-specific subdirectories (`bilastine/`, `cetirizine/`, etc.) containing sub-section files (`adverse-effects.md`, `counselling.md`, `administration-advice.md`, etc.)
2. The same drugs as combined monographs in `allergy-and-anaphylaxis/` (e.g. `allergy-and-anaphylaxis/bilastine.md`)

The duplicate files have different frontmatter (different `chapter:` values) and sometimes different content (the subdirectory versions are fragments, the combined versions are complete monographs). This creates 41 duplicate filename pairs.

### 5.7 eMIMS Empty/Placeholder Sections

High rates of empty or placeholder sections in eMIMS:
- **Additional Information:** 7,949 of 8,370 files (94.9%) contain `_(no data)_`
- **Contraindications:** ~12.9% empty (common for OTC/supplement products)
- **Adverse Effects:** ~10.9% empty
- **Interactions:** ~10.6% empty (often "See Contra;" only)

### 5.8 eMIMS Combination Product Generic Name Issue

For combination products (e.g. perindopril + indapamide), the `**Generic name:**` header field typically lists only ONE of the active ingredients (usually the one that sorts first alphabetically or by clinical prominence). The full ingredient list is only in the `**Composition:**` field within Available Products. This means:
- Cannot reliably identify combination products from the generic name field alone
- Must parse the Composition field or use filename patterns for combination detection
- ~1,209 files match combination filename heuristics

### 5.9 eMIMS Stub Files

8 sodium chloride infusion product files are truncated stubs (~520 bytes each) missing the Available Products section entirely. These are the only files with 7 instead of 8 sections.

### 5.10 eMIMS HTML Sub/Sup Tags

88 of 500 sampled files (17.6%) contain HTML `<sub>` and `<sup>` tags (e.g. `B<sub>12</sub>`, `CK<sub>max</sub>`). These need to be handled during text processing — either stripped or converted to Unicode subscripts/superscripts.

### 5.11 AMH Section Heading Ambiguity

AMH uses plain text lines as section headers (not Markdown `##` headings). This creates ambiguity:
- "Safe to use." (271 occurrences) appears as a standalone line — is it a section header or content?
- "Accepted" (83 occurrences) — section header or content?
- Drug names, conditions, and class names also appear as standalone lines, making section detection unreliable without context

### 5.12 Encoding

No encoding issues detected in actual .md file content for either corpus. No BOM, no replacement characters (`\ufeff` / `\uFFFD`) found in sampled files. The non-breaking space issue in AMH (§5.5) is a content issue, not an encoding issue.

---

## 6. Summary & Recommendations

### 6.1 Corpus Suitability

| Use Case | eMIMS | AMH |
|---|---|---|
| Drug identification & class | ✅ Excellent (MIMS Class, Generic name) | ✅ Good (chapter membership) |
| Pregnancy safety | ✅ Excellent (category letter) | ⚠️ Narrative (needs NLP) |
| Dosing recommendations | ✅ Good (Dose field) | ✅ Excellent (structured Dosage section) |
| Renal/hepatic guidance | ⚠️ Embedded in Precautions | ✅ Dedicated sections |
| Drug interactions | ✅ Present (free text) | ⚠️ References class-level pages |
| Product/pack info | ✅ Excellent (ARTG, pack sizes) | ✅ Good (PBS listings) |
| Patient counselling | ❌ Not present | ✅ Present (41% of files) |
| Clinical pearls | ❌ Not present | ✅ Present (54% Practice points) |
| Combination products | ⚠️ Generic name incomplete | ✅ Named consistently |
| Adverse effect frequency | ❌ No frequency data | ✅ Structured (Common/Infrequent/Rare) |
| Schedule/poison control | ✅ S2-S8 per product | ❌ Not present |

### 6.2 Recommended Extraction Strategy

1. **Use eMIMS as the primary drug database** — 8,370 product-level records with consistent structure, pregnancy categories, MIMS classes, ARTG numbers, and scheduling
2. **Use AMH as the clinical enrichment layer** — dosage regimens, renal/hepatic adjustments, adverse effect frequencies, counselling advice, and practice points
3. **Join on normalised generic name** — strip salt forms ("hydrochloride", "sodium", "hemihydrate") from eMIMS generic names to match AMH drug names; handle combination products via AMH's "with" naming convention
4. **Filter aggressively** — exclude resource forks (`._*`), browser_profile, .DS_Store, navigation noise
5. **Parse eMIMS first** (higher structure consistency) then enrich with AMH data where available
6. **Handle AMH class references** — resolve "from {Class}" references by extracting and merging class-level monographs (e.g. "Statins" monograph contains shared information for all statins)
7. **Deduplicate AMH** — prefer monographs from therapeutic chapter directories (e.g. `allergy-and-anaphylaxis/bilastine.md`) over subdirectory fragments (e.g. `bilastine/adverse-effects.md`)

### 6.3 Data Quality Grades

| Dimension | eMIMS | AMH |
|---|---|---|
| Structure consistency | A (99.9%) | C (variable section coverage) |
| Field completeness | B (70-95% per field) | B (40-63% per section) |
| Parseability | A (regex-friendly) | B (plain text headers, ambiguity) |
| Encoding quality | A (clean UTF-8) | B (non-breaking space corruption) |
| Duplicate risk | A (0 exact dups) | C (41 duplicate filenames, navigation noise) |
| Clinical depth | B (abbreviated PI) | A (full clinical monographs) |
| Metadata quality | A (structured headers) | A (YAML frontmatter) |