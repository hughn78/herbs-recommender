// Tests for the Therapeutic Guidelines ingestion pipeline.
//
// Focus areas:
//   - decideIngest rejects structural / ToC / non-TG-URL chunks
//   - decisionToRow produces a row with the right shape
//   - Excerpt truncation respects the 320-char ceiling
//   - Idempotency: same input twice produces the same content_hash

import { describe, expect, it } from "vitest";
import {
  MAX_EXCERPT_CHARS,
  decideIngest,
  decisionToRow,
  type IngestDecision,
  type TgChunk,
} from "./tg-ingest";

function makeChunk(overrides: Partial<TgChunk> = {}): TgChunk {
  return {
    chunk_id: "TG-antibiotic-bartonella-body-001",
    source: "TG",
    source_name: "Therapeutic Guidelines (Antibiotic)",
    page_id: "antibiotic-bartonella",
    page_short_id: "antibiotic-bartonella",
    page_type: "therapeutic_topic",
    page_type_label: "Therapeutic guideline topic",
    title: "Bartonella infections",
    source_url: "https://tgldcdp.tg.org.au/antibiotic/bartonella",
    section_heading: "Bartonella henselae infections",
    section_level: 1,
    section_index: 1,
    chunk_index: 1,
    char_count: 1000,
    text:
      "# Bartonella infections\n\n" +
      "The primary Bartonella species that causes human disease in Australia is B. henselae. " +
      "Patients typically present with regional lymphadenopathy after a scratch or bite from " +
      "an infected cat. Most cases are self-limiting and do not require antimicrobial therapy. " +
      "For patients with unresolved lymphadenopathy, azithromycin 500 mg orally on day 1 then " +
      "250 mg daily for 4 days is recommended.\n\nReferences",
    topic_area: "antibiotic",
    topic_area_label: "Antibiotic",
    topic_code: "",
    ...overrides,
  };
}

function asAccepted(d: IngestDecision): Extract<IngestDecision, { kind: "accept" }> {
  expect(d.kind).toBe("accept");
  return d as Extract<IngestDecision, { kind: "accept" }>;
}

function asRejected(d: IngestDecision): Extract<IngestDecision, { kind: "reject" }> {
  expect(d.kind).toBe("reject");
  return d as Extract<IngestDecision, { kind: "reject" }>;
}

describe("tg-ingest decideIngest", () => {
  it("accepts a clinically-rich chunk with a TG URL", () => {
    const d = decideIngest(makeChunk(), "2026-Q3");
    const acc = asAccepted(d);
    expect(acc.chunk.chunk_id).toBe("TG-antibiotic-bartonella-body-001");
    expect(acc.excerpt).toContain("Bartonella species");
    expect(acc.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
    expect(acc.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects chunks whose source_url is not a TG URL", () => {
    const d = decideIngest(
      makeChunk({ source_url: "https://example.com/page" }),
      "2026-Q3",
    );
    const rej = asRejected(d);
    expect(rej.reason).toMatch(/TG URL/);
  });

  it("rejects ToC / structural chunks with no clinical paragraph", () => {
    const d = decideIngest(
      makeChunk({
        text:
          "# Perianal Disorders\n\n" +
          "Perianal disorders\n\nOverview of perianal disorders\n\nHaemorrhoids\n\n" +
          "Anal fissure\n\nPublished August 2022",
      }),
      "2026-Q3",
    );
    expect(d.kind).toBe("reject");
  });

  it("rejects chunks missing a chunk_id", () => {
    const d = decideIngest({ ...makeChunk(), chunk_id: "" }, "2026-Q3");
    expect(d.kind).toBe("reject");
  });

  it("rejects chunks missing body text", () => {
    const d = decideIngest(makeChunk({ text: "" }), "2026-Q3");
    expect(d.kind).toBe("reject");
  });

  it("rejects chunks whose body is suspiciously short vs declared char_count", () => {
    const d = decideIngest(makeChunk({ char_count: 5000, text: "too short" }), "2026-Q3");
    expect(d.kind).toBe("reject");
  });

  it("truncates very long excerpts to MAX_EXCERPT_CHARS", () => {
    const long = "word ".repeat(400).trim();
    const d = decideIngest(makeChunk({ text: long }), "2026-Q3");
    const acc = asAccepted(d);
    expect(acc.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
    expect(acc.excerpt.endsWith("…")).toBe(true);
  });
});

describe("tg-ingest decisionToRow", () => {
  it("produces a row matching the database schema", () => {
    const d = decideIngest(makeChunk(), "2026-Q3");
    const acc = asAccepted(d);
    const row = decisionToRow(acc, "2026-Q3");
    expect(row.chunk_id).toBe("TG-antibiotic-bartonella-body-001");
    expect(row.edition).toBe("2026-Q3");
    expect(row.active).toBe(true);
    expect(row.excerpt_length).toBe(row.excerpt.length);
    expect(row.content_hash).toBe(acc.contentHash);
    expect(row.topic_area).toBe("antibiotic");
  });
});

describe("tg-ingest idempotency", () => {
  it("produces the same content_hash for the same input across editions", () => {
    const d1 = decideIngest(makeChunk(), "2026-Q3");
    const d2 = decideIngest(makeChunk(), "2026-Q3");
    const d3 = decideIngest(makeChunk(), "2026-Q4");
    expect(asAccepted(d1).contentHash).toBe(asAccepted(d2).contentHash);
    // Different edition -> different content_hash (we hash edition in)
    expect(asAccepted(d1).contentHash).not.toBe(asAccepted(d3).contentHash);
  });
});

describe("tg-ingest robustness", () => {
  it("rejects non-object input", () => {
    const d = decideIngest("not a chunk", "2026-Q3");
    expect(d.kind).toBe("reject");
  });

  it("rejects null input", () => {
    const d = decideIngest(null, "2026-Q3");
    expect(d.kind).toBe("reject");
  });
});
