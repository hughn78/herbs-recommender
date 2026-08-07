# Ingestion Pipeline

**Code:** `pipeline/` (`corpus.py`, `analyse.py`, `images.py`, `ingest.py`)
**Corpus (read-only):** `docs/herbsofgold_scraped/` — originals are never
modified. Derived artefacts go to `data/` (`reports/` committed,
`derived/` gitignored).

## Stages

1. **Inventory + hash** — every corpus source file sha256'd
   (`data/reports/source_inventory.json`). Scraper artefacts (`.venv`,
   `chrome_profile`, cookies) are excluded.
2. **Analyse** — cross-source comparison and quality audit
   (`corpus_audit.json`, `cross_source.json`, `conflicts.json`).
3. **Image extraction** — embedded images pulled from DOCX/XLSX, content-hash
   deduped, mapped to products by positional evidence (DOCX H1 suffix match,
   XLSX anchor cell), role-classified (packshot / content_graphic /
   boilerplate), primary chosen per product
   (`image_manifest.json`, `image_audit.json`).
4. **Stage** — `ingest.py` builds governed-catalogue row sets from the
   corpus products JSON + image manifest; validates required identity fields.
5. **Dry-run** — `--dry-run` writes `ingestion_dry_run.json` and touches
   nothing.
6. **Apply** — `--apply` upserts via PostgREST with the service role,
   uploads pack shots to the `product-images` storage bucket, records an
   `ingestion_runs` row with source hashes and stats.
7. **Skip-if-unchanged** — if the last complete run has identical source
   hashes, apply exits early unless `--force`.

Idempotency: upserts on natural keys (`hog_code`, `sha256`, `content_key`,
unique constraints). Re-running after a corpus refresh updates in place;
review decisions on claims/warnings/images are preserved.

## Commands

```bash
python3 -m pipeline.analyse          # Phase 2 reports
python3 -m pipeline.images           # Phase 3 image extraction
python3 -m pipeline.ingest --dry-run # staging audit (no writes)
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python3 -m pipeline.ingest --apply
```

The service-role key is **not** in the repo `.env` — supply it via the
environment only, never commit it.

## Current staging results (dry-run, 2026-08-07)

103 products · 153 ingredients · 249 product-ingredient rows ·
103 directions · 123 indications · 90 warnings · 96 interaction flags ·
115 catalogue images · 659 source claims · 144 data-quality issues ·
50 source files hashed.

## One-time manual steps (live project)

1. Apply `supabase/migrations/20260807100000_governed_catalogue.sql` and
   `20260807101000_product_image_storage.sql` via the Supabase SQL editor
   (Lovable Cloud does not auto-apply repo migrations — see
   `supabase/MIGRATIONS_README.md`).
2. Set `SUPABASE_SERVICE_ROLE_KEY` in the environment.
3. Run `python3 -m pipeline.ingest --apply`.
4. Verify: 103 rows in `catalogue_products`, 115 in `product_images`,
   659 in `source_claims`; check `ingestion_runs` shows `complete`.

## Known gaps carried into the review queue

- AUST L absent for all 103 products (not in the source manual; TGA ARTG
  lookup is a pharmacist review task — pack shots do show AUST L on labels,
  a future OCR-assisted review aid).
- 22 products missing structured ingredient strengths; 2 missing dose;
  13 missing cautions; 4 missing dosage form.
- GlucoPlex (HOG-0041) has no product image in the corpus.
- 6 orphan pack shots (likely TOC-only products) and 7 TOC-only catalogue
  candidates await review.
