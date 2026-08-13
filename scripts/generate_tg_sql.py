#!/usr/bin/env python3
"""
Generate batched SQL upsert files from tg_chunks.jsonl for the Lovable SQL editor.

Mirrors the decideIngest logic from src/lib/tg-ingest.ts:
  - Reject chunks missing chunk_id, text, or valid TG source_url
  - Derive excerpt (first clinically-relevant paragraph, <= 320 chars)
  - SHA-256 content hash: edition|chunk_id|section_heading|text
  - Same rejection rules

Outputs:
  - /Volumes/1tb-ssd/.../tg_sql_batches/tg_chunks_batch_001.sql ... etc
  - Each file is a self-contained upsert using INSERT ... ON CONFLICT
  - Print summary stats matching the TS dry-run
"""

import json
import hashlib
import math
import os
import sys
from pathlib import Path

MAX_EXCERPT_CHARS = 320
BATCH_SIZE = 500  # rows per SQL file
EDITION = "2026-Q3"
JSONL_PATH = "/Volumes/1tb-ssd/Hermes-Agent/projects/Pharma_KB_Unified/chunks/tg_chunks.jsonl"
OUTPUT_DIR = "/Volumes/1tb-ssd/OpenClaw-Workspace/openclaw/herbs-of-gold-intelligence/tg_sql_batches"


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def derive_excerpt(text: str) -> str | None:
    """Mirror of deriveExcerpt in tg-ingest.ts"""
    # Strip leading "# Title" lines
    import re
    normalised = re.sub(r'^#+\s*[^\n]*\n', '', text).strip()
    # Split on double newlines for paragraphs
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', normalised) if p.strip()]
    for p in paragraphs:
        if len(p) < 40:
            continue
        if re.match(r'^\s*\[\d+\]', p):
            continue
        if p.lower().strip() == 'references':
            continue
        if len(p) > MAX_EXCERPT_CHARS:
            return p[:MAX_EXCERPT_CHARS - 1].rstrip() + '\u2026'
        return p
    return None


def decide_ingest(chunk: dict, edition: str) -> dict:
    """Returns {'accept': row_dict} or {'reject': reason}"""
    if not chunk.get("chunk_id") or not isinstance(chunk["chunk_id"], str):
        return {"reject": "Missing chunk_id", "chunk_id": "<unknown>"}
    
    chunk_id = chunk["chunk_id"]
    
    if not chunk.get("text") or not isinstance(chunk["text"], str):
        return {"reject": "Missing text body", "chunk_id": chunk_id}
    
    source_url = chunk.get("source_url", "")
    if not source_url or not source_url.startswith("https://tgldcdp.tg.org.au/"):
        return {"reject": "Source URL is not a TG URL", "chunk_id": chunk_id}
    
    char_count = chunk.get("char_count")
    if char_count is not None and isinstance(char_count, (int, float)) and char_count > 0:
        if len(chunk["text"]) < min(char_count, 50):
            return {"reject": "Body suspiciously short vs declared char_count", "chunk_id": chunk_id}
    
    excerpt = derive_excerpt(chunk["text"])
    if not excerpt:
        return {"reject": "Could not derive an excerpt", "chunk_id": chunk_id}
    
    content_hash = sha256(f"{edition}|{chunk_id}|{chunk.get('section_heading', '')}|{chunk['text']}")
    
    row = {
        "chunk_id": chunk_id,
        "edition": edition,
        "source": chunk.get("source", ""),
        "source_name": chunk.get("source_name", ""),
        "page_id": chunk.get("page_id", ""),
        "page_short_id": chunk.get("page_short_id", ""),
        "page_type": chunk.get("page_type"),
        "page_type_label": chunk.get("page_type_label"),
        "title": chunk.get("title", ""),
        "source_url": source_url,
        "section_heading": chunk.get("section_heading"),
        "section_level": int(chunk.get("section_level", 0)),
        "section_index": int(chunk.get("section_index", 0)),
        "chunk_index": int(chunk.get("chunk_index", 1)),
        "excerpt": excerpt,
        "excerpt_length": len(excerpt),
        "content_hash": content_hash,
        "topic_area": chunk.get("topic_area"),
        "topic_area_label": chunk.get("topic_area_label"),
        "topic_code": chunk.get("topic_code"),
        "active": True,
    }
    return {"accept": row}


def sql_escape(val) -> str:
    """Escape a Python value for SQL literal."""
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val)
    # Escape single quotes
    s = s.replace("'", "''")
    return f"'{s}'"


def generate_batch_sql(rows: list, batch_num: int) -> str:
    """Generate a single SQL upsert batch."""
    lines = []
    lines.append(f"-- TG chunks batch {batch_num:03d} ({len(rows)} rows)")
    lines.append(f"-- Edition: {EDITION}")
    lines.append("-- Upsert: ON CONFLICT (chunk_id) DO UPDATE")
    lines.append("")
    lines.append("INSERT INTO public.tg_chunks (")
    lines.append("  chunk_id, edition, source, source_name, page_id, page_short_id,")
    lines.append("  page_type, page_type_label, title, source_url, section_heading,")
    lines.append("  section_level, section_index, chunk_index, excerpt, excerpt_length,")
    lines.append("  content_hash, topic_area, topic_area_label, topic_code, active")
    lines.append(") VALUES")
    
    value_lines = []
    for r in rows:
        cols = [
            r["chunk_id"], r["edition"], r["source"], r["source_name"],
            r["page_id"], r["page_short_id"], r["page_type"], r["page_type_label"],
            r["title"], r["source_url"], r["section_heading"],
            r["section_level"], r["section_index"], r["chunk_index"],
            r["excerpt"], r["excerpt_length"], r["content_hash"],
            r["topic_area"], r["topic_area_label"], r["topic_code"], r["active"],
        ]
        vals = ", ".join(sql_escape(c) for c in cols)
        value_lines.append(f"  ({vals})")
    
    lines.append(",\n".join(value_lines))
    lines.append("ON CONFLICT (chunk_id) DO UPDATE SET")
    lines.append("  edition = EXCLUDED.edition,")
    lines.append("  source = EXCLUDED.source,")
    lines.append("  source_name = EXCLUDED.source_name,")
    lines.append("  page_id = EXCLUDED.page_id,")
    lines.append("  page_short_id = EXCLUDED.page_short_id,")
    lines.append("  page_type = EXCLUDED.page_type,")
    lines.append("  page_type_label = EXCLUDED.page_type_label,")
    lines.append("  title = EXCLUDED.title,")
    lines.append("  source_url = EXCLUDED.source_url,")
    lines.append("  section_heading = EXCLUDED.section_heading,")
    lines.append("  section_level = EXCLUDED.section_level,")
    lines.append("  section_index = EXCLUDED.section_index,")
    lines.append("  chunk_index = EXCLUDED.chunk_index,")
    lines.append("  excerpt = EXCLUDED.excerpt,")
    lines.append("  excerpt_length = EXCLUDED.excerpt_length,")
    lines.append("  content_hash = EXCLUDED.content_hash,")
    lines.append("  topic_area = EXCLUDED.topic_area,")
    lines.append("  topic_area_label = EXCLUDED.topic_area_label,")
    lines.append("  topic_code = EXCLUDED.topic_code,")
    lines.append("  active = EXCLUDED.active,")
    lines.append("  updated_at = now();")
    lines.append("")
    return "\n".join(lines)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    total_read = 0
    accepted = 0
    rejected = 0
    unresolved = 0
    rejection_samples = []
    all_rows = []
    
    print(f"Reading {JSONL_PATH}...")
    with open(JSONL_PATH, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            total_read += 1
            try:
                chunk = json.loads(line)
            except json.JSONDecodeError as e:
                unresolved += 1
                if len(rejection_samples) < 20:
                    rejection_samples.append({"chunk_id": f"<parse-error:{unresolved}>", "reason": str(e)})
                continue
            
            result = decide_ingest(chunk, EDITION)
            if "accept" in result:
                all_rows.append(result["accept"])
                accepted += 1
            else:
                rejected += 1
                if len(rejection_samples) < 20:
                    rejection_samples.append({"chunk_id": result["chunk_id"], "reason": result["reject"]})
    
    print(f"Total read: {total_read}")
    print(f"Accepted: {accepted}")
    print(f"Rejected: {rejected}")
    print(f"Unresolved: {unresolved}")
    print(f"Rejection samples: {len(rejection_samples)}")
    
    # Write batch files
    num_batches = math.ceil(len(all_rows) / BATCH_SIZE)
    print(f"\nGenerating {num_batches} SQL batch files (BATCH_SIZE={BATCH_SIZE})...")
    
    for i in range(num_batches):
        start = i * BATCH_SIZE
        end = start + BATCH_SIZE
        batch_rows = all_rows[start:end]
        batch_num = i + 1
        sql = generate_batch_sql(batch_rows, batch_num)
        filepath = os.path.join(OUTPUT_DIR, f"tg_chunks_batch_{batch_num:03d}.sql")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(sql)
        size_kb = os.path.getsize(filepath) / 1024
        print(f"  batch_{batch_num:03d}.sql: {len(batch_rows)} rows, {size_kb:.0f} KB")
    
    # Write a manifest
    manifest = {
        "edition": EDITION,
        "total_read": total_read,
        "accepted": accepted,
        "rejected": rejected,
        "unresolved": unresolved,
        "batch_size": BATCH_SIZE,
        "num_batches": num_batches,
        "output_dir": OUTPUT_DIR,
        "rejection_samples": rejection_samples,
    }
    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    
    print(f"\nManifest: {manifest_path}")
    print(f"Output dir: {OUTPUT_DIR}")
    print(f"\nExpected stats: totalRead={total_read} accepted={accepted} rejected={rejected} unresolved={unresolved}")
    
    # Also write a verification query
    verify_sql = """-- TG chunks verification queries
-- Run after all batches are applied

-- Total row count
SELECT count(*) AS total_rows FROM public.tg_chunks;

-- Count by edition
SELECT edition, count(*) AS cnt
FROM public.tg_chunks
GROUP BY edition
ORDER BY edition;

-- Count by active status
SELECT active, count(*) AS cnt
FROM public.tg_chunks
GROUP BY active;

-- Top 20 topic areas by chunk count
SELECT topic_area, topic_area_label, count(*) AS cnt
FROM public.tg_chunks
WHERE active = true
GROUP BY topic_area, topic_area_label
ORDER BY cnt DESC
LIMIT 20;

-- Check for duplicates (same chunk_id appearing more than once)
SELECT chunk_id, count(*) AS dup_count
FROM public.tg_chunks
GROUP BY chunk_id
HAVING count(*) > 1
LIMIT 10;

-- RLS check
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'tg_chunks';

-- Sample 5 rows for provenance check
SELECT chunk_id, title, source_name, source_url, excerpt_length, edition
FROM public.tg_chunks
WHERE active = true
ORDER BY random()
LIMIT 5;
"""
    verify_path = os.path.join(OUTPUT_DIR, "verify.sql")
    with open(verify_path, "w", encoding="utf-8") as f:
        f.write(verify_sql)
    print(f"Verification SQL: {verify_path}")


if __name__ == "__main__":
    main()