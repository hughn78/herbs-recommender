# Medication Ingestion Design

**Date:** 2026-08-12
**Status:** Implemented (scripts/ingest_medication_kb.py)

---

## 1. Pipeline Overview

```
Raw corpora (local, never committed)
    |
    ├── eMIMS abbrev_pi/ (16,740 .md files, 2.0GB)
    │   └── Per-file: header (**Generic name:**, **MIMS Class:**, etc) + ## sections
    |
    └── AMH scraped/ (1,608 .md files, 294MB)
        └── Per-file: YAML frontmatter (drug, chapter, url) + ##/### sections
    |
    v
Python ingestion pipeline (scripts/ingest_medication_kb.py)
    |
    ├── Parse eMIMS: extract generic_name, brand, MIMS class, pregnancy category
    ├── Parse AMH: extract drug_name, chapter, sections + subsections
    ├── Build canonical concepts (deduplicate by normalised name)
    ├── Extract atomic assertions per section
    ├── Map MIMS class / AMH chapter to drug class codes
    ├── Detect combination products (slash/+ separated)
    ├── Detect source conflicts (same concept + type, different sources)
    └── Content-hash every assertion for idempotent dedup
    |
    v
Output (data/medication_kb/)
    ├── medication_kb.json — full structured data
    ├── medication_kb_upsert.sql — SQL for Supabase SQL editor
    └── ingestion_summary.json — summary stats
```

---

## 2. Ingestion Results

| Metric | Count |
|--------|-------|
| Total unique medication concepts | 2,654 |
| Total name mappings (brands + generics + aliases) | 10,690 |
| Total clinical assertions | 57,918 |
| Total drug class mappings | 22 |
| Source conflicts detected | 0 (same-source dedup; cross-source comparison needs review) |
| Concepts from eMIMS only | 1,222 |
| Concepts from AMH only | 862 |
| Concepts from both sources | 572 |
| eMIMS files parsed successfully | 8,035 / 16,732 |
| eMIMS files failed | 8,697 (non-standard format or missing generic name) |
| AMH files parsed | 1,608 / 1,608 (100%) |

### Why 8,697 eMIMS files failed

eMIMS files include non-drug entries (cannabis strains like "1753-animal-tsunami.md", medical devices, test strips). Many files lack a `**Generic name:**` header, indicating they are brand-only entries without a clear generic name, or non-medicinal products. The parser correctly skips these. A second pass with brand-name-to-generic inference could recover some.

---

## 3. Idempotent Ingestion

Every assertion has a `content_hash` = sha256(concept_id + assertion_type + statement[:512]). The `medication_assertions` table has a UNIQUE constraint on `content_hash`. Re-ingesting the same file produces zero new rows because:

1. Concept already exists (UNIQUE on name_normalised)
2. Names already exist (UNIQUE on concept_id + name + name_type)
3. Assertions already exist (UNIQUE on content_hash)

A modified file will:
1. Concept may update (if canonical_name changed)
2. New names appear (if new brand variants added)
3. New assertions appear (content_hash differs for changed text)
4. Old assertions remain (stale detection via ingestion_run_id)

---

## 4. Incremental Update Strategy

```
Run 1 (initial):
  - 2,654 concepts, 57,918 assertions ingested

Run 2 (same files):
  - 0 new concepts, 0 new assertions (all hashes match)
  - Ingestion run reports: new_concepts=0, updated_concepts=0, new_assertions=0

Run 3 (AMH updated, atorvastatin monograph changed):
  - atorvastatin concept still exists (name_normalised match)
  - New assertions for changed sections (content_hash differs)
  - Old assertions still present but linked to old ingestion_run_id
  - Report: changed_assertions=N, new_assertions=M
  - Stale assertions can be flagged by comparing ingestion_run_id
```

---

## 5. Data Quality Pipeline

The ingestion script does not silently discard bad rows. Issues are tracked:

- **Missing generic name**: eMIMS file has no `**Generic name:**` header -> skipped, counted
- **Empty sections**: Section heading present but no content -> assertion not created, counted
- **Parse failure**: Exception during file parsing -> counted, file logged
- **Duplicate brands**: Multiple eMIMS files for same generic (brand variants) -> names deduped, single concept

Future enhancements:
- Malformed dose strings detection
- Ambiguous brand detection (same brand name for different generics)
- Missing active ingredients in combination products
- Encoding issues (non-UTF-8 characters)
- Section heading inconsistency

---

## 6. Lovable Cloud Execution

The ingestion output is in `data/medication_kb/`. To load into the Lovable-managed Supabase:

1. **Apply migration:** Run `supabase/migrations/20260812150000_medication_intelligence.sql` in the Supabase SQL editor
2. **Insert data:** Use the Lovable AI chat to execute the upsert SQL, or use a Supabase client script to insert the JSON data

The SQL file (`medication_kb_upsert.sql`) contains all concepts, names, classes, and class memberships as INSERT ... ON CONFLICT DO NOTHING statements. The assertions (57,918 rows) are too many for inline SQL and should be inserted via a batch script using the Supabase client.