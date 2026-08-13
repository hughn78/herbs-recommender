# Therapeutic Guidelines (TG) integration — architecture note

**Status:** Ingestion scaffold implemented; runtime retrieval in place; awaiting schema migration and Lovable publish gate to take effect on the live instance.
**Author:** Hermes · 2026-08-13

## Source

- JSONL chunks: `/Volumes/1tb-ssd/Hermes-Agent/projects/Pharma_KB_Unified/chunks/tg_chunks.jsonl`
- Page index: `/Volumes/1tb-ssd/Hermes-Agent/projects/Pharma_KB_Unified/intermediate/tg_index.json`
- Source URLs: `https://tgldcdp.tg.org.au/...`
- Edition metadata: not present in the JSONL itself; we tag all rows with a synthetic `edition` value at ingest time.

## Schema fields (per chunk)

| Field | Type | Purpose |
| --- | --- | --- |
| `chunk_id` | string | Stable id from JSONL (`TG-<page>-<section>-NNN`). |
| `source` | string | `TG` |
| `source_name` | string | `Therapeutic Guidelines (Antibiotic)` etc. |
| `page_id` / `page_short_id` | string | Page-level identifier |
| `title` | string | Page title (e.g. "Bartonella infections") |
| `section_heading` | string | Section heading (e.g. "Bartonella henselae infections in patients without immune compromise") |
| `section_level`, `section_index`, `chunk_index` | int | Hierarchy metadata |
| `char_count` | int | Declared chunk size |
| `text` | string | Full chunk body (NOT published in the UI; only the derived `excerpt` is) |
| `topic_area`, `topic_area_label`, `topic_code` | string | Therapeutic area classification |

## Editorial decisions

1. **We do not publish full text.** Copyright risk and lack of
   standing licence to redistribute TG chapter content mean we store
   only a derived short excerpt (≤ 320 chars) and a deep link back to
   the TG source.
2. **The excerpt is the first clinically-relevant paragraph** of the
   chunk, with leading ToC noise stripped.
3. **Display tier ordering** puts TG above AMH/eMIMS/MIMS for clinical
   questions where the corpus covers the topic. Manufacturer and
   catalogue sources stay subordinate.
4. **Idempotency.** A row's identity is `(chunk_id, edition)`. Each
   ingest computes a content hash over `(edition, chunk_id, section,
   text)` so re-runs don't churn rows unless the underlying content
   actually changed.
5. **Edition history.** We do not delete rows that are absent from a
   new run. We mark them `active = false`. This keeps the audit trail
   complete while ensuring the UI only sees the current edition.
6. **Access.** TG retrieval is read-only and runs through the same
   publishable-key + RLS-respecting client as every other public
   surface. The service role is only used by the offline ingest script.

## Database schema

```sql
create table if not exists tg_chunks (
  chunk_id              text primary key,
  edition               text not null,
  source                text not null,
  source_name           text not null,
  page_id               text not null,
  page_short_id         text not null,
  page_type             text,
  page_type_label       text,
  title                 text not null,
  source_url            text not null,
  section_heading       text,
  section_level         int default 0,
  section_index         int default 0,
  chunk_index           int default 1,
  excerpt               text not null,
  excerpt_length        int not null,
  content_hash          text not null,
  topic_area            text,
  topic_area_label      text,
  topic_code            text,
  active                boolean not null default true,
  inserted_at           timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists tg_chunks_active_idx on tg_chunks(active);
create index if not exists tg_chunks_topic_idx on tg_chunks(topic_area);
create index if not exists tg_chunks_title_trgm on tg_chunks using gin (title gin_trgm_ops);
create index if not exists tg_chunks_excerpt_trgm on tg_chunks using gin (excerpt gin_trgm_ops);
create index if not exists tg_chunks_section_trgm on tg_chunks using gin (section_heading gin_trgm_ops);
```

Row-Level Security (publishable-key reads):

```sql
alter table tg_chunks enable row level security;

drop policy if exists tg_chunks_public_read on tg_chunks;
create policy tg_chunks_public_read on tg_chunks
  for select to anon, authenticated
  using (active = true);
```

Admin writes are service-role only.

## Ingestion script

Standalone script under `scripts/ingest_tg.ts`. Reads the JSONL, runs
the deterministic `decideIngest` + `decisionToRow` pipeline, upserts
in batches of 200, and deactivates older editions.

Run with:

```sh
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/ingest_tg.ts \
    --jsonl /Volumes/1tb-ssd/Hermes-Agent/projects/Pharma_KB_Unified/chunks/tg_chunks.jsonl \
    --edition 2026-Q3 \
    --dry-run   # remove to actually write
```

Service-role credentials are read from the environment and never
written to disk.

## Runtime retrieval

`fetchRelevantTgContext(supabaseUrl, supabaseAnonKey, query, opts)`
runs in the engine hot path when surfacing clinical context. It
returns at most 8 short excerpts, scoped by topic_area when relevant.
Result is empty when the corpus is not yet migrated or no chunk
matches — no error bubbles up to the pharmacist.

## What we deliberately do NOT do

- Force TG context into every recommendation. A TG match requires a
  relevant clinical concept AND a traceable source AND a meaningful
  section AND a confidence/match basis.
- Claim TG endorsement of any supplement. We only present TG text
  in the form of retrieval excerpts with provenance.
- Store or display full TG pages, chapters, or large excerpts.
