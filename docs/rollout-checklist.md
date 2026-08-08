# Herbs of Gold rollout checklist

One-time manual steps to take the live project from "code merged" to
"governed catalogue driving recommendations". Everything is idempotent and
safe to re-run. See `supabase/MIGRATIONS_README.md` for the Lovable Cloud
rule behind the hand-apply steps.

## 1. Apply migrations (Supabase SQL editor, in order)

1. `supabase/migrations/20260807100000_governed_catalogue.sql`
2. `supabase/migrations/20260807101000_product_image_storage.sql`
3. `supabase/migrations/20260807110000_privacy_lockdown.sql`
4. `supabase/migrations/20260807120000_governance_workflow.sql`

## 2. Run ingestion

```bash
export SUPABASE_URL=...                # from .env (never committed)
export SUPABASE_SERVICE_ROLE_KEY=...   # service role key, server-side only
python3 -m pipeline.ingest --apply
```

Expected: 103 `catalogue_products` (all `needs_review`), 121 variants,
737 keywords, 115 images uploaded to the `product-images` bucket,
659 claims + 659 citations, 37 ontology concepts + 186 synonyms,
`ingestion_runs` shows `complete`.

## 3. Approve the initial catalogue

In the app: **Catalogue governance** (`/app/governance`) → enter a review
reason → "Approve all 103 products…" → confirm. This writes one audited
`catalogue_review_actions` row per product. Alternatively approve
individually after spot-checking. Claims/warnings/images remain per-entity
so genuinely uncertain content is still eyeballed.

Until this step the engine deliberately falls back to the legacy `products`
table.

## 4. Verify end to end

1. `/app/products` — 103 products with pack shots, status badges; detail
   page shows ingredients/indications/warnings/interactions + evidence.
2. `/app/references` — 5 source documents, expandable product sections.
3. New review (`/app/review`) with the smoke-test case from
   `supabase/MIGRATIONS_README.md` — product recommendations should carry
   `HOG-#### · PDF source page N` citations and pack shots, with distinct
   confidence scores.
4. Unsaved transient review — results render inline; confirm nothing was
   persisted (no new row in `patient_cases`).
5. `/app/governance` — counts drop to zero products pending; review actions
   visible in `catalogue_review_actions`.

## 5. Record

Log the apply in `migrations/APPLIED.md` (timestamp, row counts, queries
run) per the rule in `supabase/MIGRATIONS_README.md`.
