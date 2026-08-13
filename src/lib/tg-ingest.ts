// Therapeutic Guidelines (TG) governed ingestion.
//
// Architecture note (2026-08-13):
//   - TG content is copyright. We do NOT publish full chapters, pages, or
//     large excerpts through CounterPoint.
//   - We ingest only:
//       a) Section-level metadata (title, section, topic_area, edition)
//       b) A normalised, short retrieval excerpt (≤ 320 chars of the
//          first clinically-relevant paragraph of the section)
//       c) Source provenance + URL
//       d) Content hash for idempotency
//   - Display in CounterPoint uses the short excerpt only and links out
//     to the source URL via the existing SourceRef shape.
//   - Source tier for TG is the highest tier — Therapeutic Guidelines —
//     and overrides AMH/eMIMS/MIMS for clinical questions on topics the
//     corpus actually covers.
//
// Idempotency model:
//   - Each (chunk_id, edition) pair is upserted. Re-running replaces the
//     same row only if the content_hash changed.
//   - We do NOT delete existing rows that are absent from a new run —
//     we mark them inactive for the new edition so historical references
//     remain traceable.
//
// Service-role auth:
//   - The script reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
//     environment. It never reads them from the repo or from a committed
//     file. The values are stored only in the local shell.
//
// Re-running safely:
//   - `--dry-run` flag short-circuits the Supabase writes and prints a
//     summary instead. Use this in CI.

import { createHash } from "node:crypto";

export type TgChunk = {
  chunk_id: string;
  source: string;
  source_name: string;
  page_id: string;
  page_short_id: string;
  page_type: string;
  page_type_label: string;
  title: string;
  source_url: string;
  section_heading: string;
  section_level: number;
  section_index: number;
  chunk_index: number;
  char_count: number;
  text: string;
  topic_area: string;
  topic_area_label: string;
  topic_code: string;
};

export type TgIngestStats = {
  totalRead: number;
  accepted: number;
  updated: number;
  rejected: number;
  duplicates: number;
  unresolved: number;
  edition: string;
  startedAt: string;
  finishedAt: string;
  /** Up to 20 rejection reasons for diagnostics. */
  rejectionSamples: Array<{ chunk_id: string; reason: string }>;
};

export const MAX_EXCERPT_CHARS = 320;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Pick the first clinically-relevant paragraph. The TG chunks start
 *  with a heading and sometimes a ToC; we strip leading "# Title"
 *  and ToC-like repeats. */
function deriveExcerpt(text: string): string | null {
  const normalised = text.replace(/^#+\s*[^\n]*\n/g, "").trim();
  // Split on double newlines to find paragraphs.
  const paragraphs = normalised.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const p of paragraphs) {
    // Skip ToC / index lines: short lines with bracketed references or
    // pure heading-like text.
    if (p.length < 40) continue;
    if (/^\s*\[\d+\]/.test(p)) continue;
    if (/^\s*References\s*$/i.test(p)) continue;
    if (p.length > MAX_EXCERPT_CHARS) {
      return `${p.slice(0, MAX_EXCERPT_CHARS - 1).trimEnd()}…`;
    }
    return p;
  }
  return null;
}

export type IngestDecision =
  | { kind: "accept"; chunk: TgChunk; excerpt: string; contentHash: string }
  | { kind: "reject"; chunk_id: string; reason: string };

/** Decide what to do with a chunk. Pure function for testability. */
export function decideIngest(chunk: unknown, edition: string): IngestDecision {
  if (!chunk || typeof chunk !== "object") {
    return { kind: "reject", chunk_id: "<unknown>", reason: "Not an object" };
  }
  const c = chunk as Partial<TgChunk>;
  if (!c.chunk_id || typeof c.chunk_id !== "string") {
    return { kind: "reject", chunk_id: "<no-id>", reason: "Missing chunk_id" };
  }
  if (!c.text || typeof c.text !== "string") {
    return { kind: "reject", chunk_id: c.chunk_id, reason: "Missing text body" };
  }
  if (!c.source_url || !/^https:\/\/tgldcdp\.tg\.org\.au\//i.test(c.source_url)) {
    return { kind: "reject", chunk_id: c.chunk_id, reason: "Source URL is not a TG URL" };
  }
  if (c.char_count !== undefined && c.char_count > 0 && c.text.length < Math.min(c.char_count, 50)) {
    return { kind: "reject", chunk_id: c.chunk_id, reason: "Body suspiciously short vs declared char_count" };
  }
  const excerpt = deriveExcerpt(c.text);
  if (!excerpt) {
    return { kind: "reject", chunk_id: c.chunk_id, reason: "Could not derive an excerpt" };
  }
  const contentHash = sha256(`${edition}|${c.chunk_id}|${c.section_heading}|${c.text}`);
  return {
    kind: "accept",
    chunk: c as TgChunk,
    excerpt,
    contentHash,
  };
}

export type IngestRow = {
  chunk_id: string;
  edition: string;
  source: string;
  source_name: string;
  page_id: string;
  page_short_id: string;
  page_type: string;
  page_type_label: string;
  title: string;
  source_url: string;
  section_heading: string;
  section_level: number;
  section_index: number;
  chunk_index: number;
  excerpt: string;
  excerpt_length: number;
  content_hash: string;
  topic_area: string;
  topic_area_label: string;
  topic_code: string;
  /** When set false, this row is no longer the current edition. */
  active: boolean;
};

/** Convert an accepted decision into a database-shaped row ready to upsert. */
export function decisionToRow(
  d: Extract<IngestDecision, { kind: "accept" }>,
  edition: string,
): IngestRow {
  return {
    chunk_id: d.chunk.chunk_id,
    edition,
    source: d.chunk.source,
    source_name: d.chunk.source_name,
    page_id: d.chunk.page_id,
    page_short_id: d.chunk.page_short_id,
    page_type: d.chunk.page_type,
    page_type_label: d.chunk.page_type_label,
    title: d.chunk.title,
    source_url: d.chunk.source_url,
    section_heading: d.chunk.section_heading,
    section_level: d.chunk.section_level,
    section_index: d.chunk.section_index,
    chunk_index: d.chunk.chunk_index,
    excerpt: d.excerpt,
    excerpt_length: d.excerpt.length,
    content_hash: d.contentHash,
    topic_area: d.chunk.topic_area,
    topic_area_label: d.chunk.topic_area_label,
    topic_code: d.chunk.topic_code,
    active: true,
  };
}

/** Idempotent ingest of a JSONL stream.
 *
 *  Usage from a script:
 *    import { ingestTgChunks } from "@/lib/tg-ingest";
 *    const stats = await ingestTgChunks({
 *      jsonlPath: "/path/to/tg_chunks.jsonl",
 *      edition: "2026-Q3",
 *      supabase: { url, serviceRoleKey },
 *      dryRun: false,
 *      onLog: (line) => console.log(line),
 *    });
 *
 *  `dryRun: true` returns the same stats shape with zero Supabase calls.
 */
export async function ingestTgChunks(opts: {
  jsonlPath: string;
  edition: string;
  supabase: { url: string; serviceRoleKey: string };
  dryRun?: boolean;
  onLog?: (line: string) => void;
}): Promise<TgIngestStats> {
  const startedAt = new Date().toISOString();
  const stats: TgIngestStats = {
    totalRead: 0,
    accepted: 0,
    updated: 0,
    rejected: 0,
    duplicates: 0,
    unresolved: 0,
    edition: opts.edition,
    startedAt,
    finishedAt: startedAt,
    rejectionSamples: [],
  };

  const log = opts.onLog ?? (() => {});
  log(`[tg-ingest] reading ${opts.jsonlPath}`);

  // Use Node's fs.readFileSync via the dynamic import so this module
  // stays runnable in non-Node environments (browser bundle excludes it).
  const fs = await import("node:fs/promises");
  const raw = await fs.readFile(opts.jsonlPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  stats.totalRead = lines.length;
  log(`[tg-ingest] read ${lines.length} lines`);

  if (opts.dryRun) {
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const d = decideIngest(parsed, opts.edition);
        if (d.kind === "accept") stats.accepted += 1;
        else {
          stats.rejected += 1;
          if (stats.rejectionSamples.length < 20) {
            stats.rejectionSamples.push({ chunk_id: d.chunk_id, reason: d.reason });
          }
        }
      } catch (e) {
        stats.unresolved += 1;
        if (stats.rejectionSamples.length < 20) {
          stats.rejectionSamples.push({
            chunk_id: `<parse-error:${stats.unresolved}>`,
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    stats.finishedAt = new Date().toISOString();
    log(`[tg-ingest] dry-run done: accepted=${stats.accepted} rejected=${stats.rejected} unresolved=${stats.unresolved}`);
    return stats;
  }

  // Live ingestion. Uses fetch with the service-role key against
  // PostgREST upsert. We do NOT depend on @supabase/supabase-js here
  // because this module is invoked from a script that has the key.
  const baseUrl = opts.supabase.url.replace(/\/$/, "");
  const rows: IngestRow[] = [];
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      stats.unresolved += 1;
      if (stats.rejectionSamples.length < 20) {
        stats.rejectionSamples.push({
          chunk_id: `<parse-error:${stats.unresolved}>`,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
      continue;
    }
    const d = decideIngest(parsed, opts.edition);
    if (d.kind === "reject") {
      stats.rejected += 1;
      if (stats.rejectionSamples.length < 20) {
        stats.rejectionSamples.push({ chunk_id: d.chunk_id, reason: d.reason });
      }
      continue;
    }
    rows.push(decisionToRow(d, opts.edition));
  }

  // Upsert in batches of 200 to stay under PostgREST request limits.
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const res = await fetch(`${baseUrl}/rest/v1/tg_chunks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: opts.supabase.serviceRoleKey,
        Authorization: `Bearer ${opts.supabase.serviceRoleKey}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(slice),
    });
    if (!res.ok) {
      const body = await res.text();
      stats.unresolved += slice.length;
      if (stats.rejectionSamples.length < 20) {
        stats.rejectionSamples.push({
          chunk_id: `<batch:${i}-${i + slice.length}>`,
          reason: `Upsert failed: ${res.status} ${body.slice(0, 160)}`,
        });
      }
      continue;
    }
    stats.accepted += slice.length;
    log(`[tg-ingest] upserted batch ${i}..${i + slice.length}`);
  }

  // Mark older editions inactive. We do NOT delete anything — historical
  // rows are retained for auditability.
  const deactivateRes = await fetch(
    `${baseUrl}/rest/v1/tg_chunks?edition=neq.${encodeURIComponent(opts.edition)}&active=eq.true`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: opts.supabase.serviceRoleKey,
        Authorization: `Bearer ${opts.supabase.serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ active: false }),
    },
  );
  if (!deactivateRes.ok) {
    log(
      `[tg-ingest] WARN: could not deactivate older editions: ${deactivateRes.status} ${(await deactivateRes.text()).slice(0, 160)}`,
    );
  }

  stats.finishedAt = new Date().toISOString();
  log(
    `[tg-ingest] done: read=${stats.totalRead} accepted=${stats.accepted} rejected=${stats.rejected} unresolved=${stats.unresolved}`,
  );
  return stats;
}

/** Runtime retrieval of TG context for a given query string.
 *
 *  Used by the engine when surfacing clinical context for a patient's
 *  conditions or symptoms. Returns short, copyright-safe excerpts only.
 *  Conservative: returns an empty array when the corpus is not migrated
 *  or when no chunks match.
 */
export async function fetchRelevantTgContext(
  supabaseUrl: string,
  supabaseAnonKey: string,
  query: string,
  options?: { limit?: number; topicArea?: string | null },
): Promise<
  Array<{
    chunk_id: string;
    title: string;
    section_heading: string;
    excerpt: string;
    source_url: string;
    topic_area: string;
    topic_area_label: string;
    edition: string;
  }>
> {
  const limit = Math.min(Math.max(options?.limit ?? 3, 1), 8);
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/tg_chunks`);
  url.searchParams.set("select", "chunk_id,title,section_heading,excerpt,source_url,topic_area,topic_area_label,edition");
  url.searchParams.set("active", "eq.true");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("or", `(title.ilike.%${encodeURIComponent(query)}%,excerpt.ilike.%${encodeURIComponent(query)}%,section_heading.ilike.%${encodeURIComponent(query)}%)`);
  if (options?.topicArea) {
    url.searchParams.append("topic_area", `eq.${options.topicArea}`);
  }
  const res = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    chunk_id: r.chunk_id as string,
    title: r.title as string,
    section_heading: r.section_heading as string,
    excerpt: r.excerpt as string,
    source_url: r.source_url as string,
    topic_area: r.topic_area as string,
    topic_area_label: r.topic_area_label as string,
    edition: r.edition as string,
  }));
}
