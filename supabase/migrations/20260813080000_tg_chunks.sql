-- Therapeutic Guidelines (TG) governed-chunks table.
--
-- Stores short, copyright-safe excerpts and provenance for the TG
-- clinical corpus. Full chunk bodies are NOT retained — only the
-- derived excerpt (≤ 320 chars), section metadata, source URL, and
-- a content hash for idempotency.
--
-- See docs/TG_INGESTION.md for the architecture decision record.

create table if not exists public.tg_chunks (
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
  section_level         int not null default 0,
  section_index         int not null default 0,
  chunk_index           int not null default 1,
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

create index if not exists tg_chunks_active_idx on public.tg_chunks (active);
create index if not exists tg_chunks_topic_idx on public.tg_chunks (topic_area);
create index if not exists tg_chunks_edition_idx on public.tg_chunks (edition);
create index if not exists tg_chunks_title_trgm
  on public.tg_chunks using gin (title gin_trgm_ops);
create index if not exists tg_chunks_excerpt_trgm
  on public.tg_chunks using gin (excerpt gin_trgm_ops);
create index if not exists tg_chunks_section_trgm
  on public.tg_chunks using gin (section_heading gin_trgm_ops);

alter table public.tg_chunks enable row level security;

drop policy if exists tg_chunks_public_read on public.tg_chunks;
create policy tg_chunks_public_read on public.tg_chunks
  for select to anon, authenticated
  using (active = true);

-- No insert/update/delete policy for anon/authenticated — writes are
-- service-role only, performed by the offline ingest script.

-- pg_trgm is required for the gin indexes above. The catalogue
-- migration set this up earlier; we leave a defensive guard here.
create extension if not exists pg_trgm;
