#!/usr/bin/env python3
"""
Split tg_chunks.jsonl into processed shards ready for Lovable Storage upload.

Each shard contains IngestRow-shaped JSON objects (one per line) with:
  - chunk_id, edition, source, source_name, page_id, page_short_id,
  - page_type, page_type_label, title, source_url, section_heading,
  - section_level, section_index, chunk_index, excerpt, excerpt_length,
  - content_hash, topic_area, topic_area_label, topic_code, active

Full text bodies are NOT included in shards — only the derived excerpt.
This keeps shards copyright-safe and small.

Mirrors decideIngest logic from src/lib/tg-ingest.ts exactly.
"""

import json
import hashlib
import math
import os
import re

MAX_EXCERPT_CHARS = 320
EDITION = "2026-Q3"
JSONL_PATH = "/Volumes/1tb-ssd/Hermes-Agent/projects/Pharma_KB_Unified/chunks/tg_chunks.jsonl"
OUTPUT_DIR = "/Volumes/1tb-ssd/OpenClaw-Workspace/openclaw/herbs-of-gold-intelligence/data/tg_shards"
SHARD_SIZE = 1000  # rows per shard file


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def derive_excerpt(text: str) -> str | None:
    normalised = re.sub(r'^#+\s*[^\n]*\n', '', text).strip()
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


def decide_ingest(chunk: dict, edition: str):
    if not chunk.get("chunk_id") or not isinstance(chunk["chunk_id"], str):
        return ("reject", "<unknown>", "Missing chunk_id")
    chunk_id = chunk["chunk_id"]
    if not chunk.get("text") or not isinstance(chunk["text"], str):
        return ("reject", chunk_id, "Missing text body")
    source_url = chunk.get("source_url", "")
    if not source_url or not source_url.startswith("https://tgldcdp.tg.org.au/"):
        return ("reject", chunk_id, "Source URL is not a TG URL")
    char_count = chunk.get("char_count")
    if char_count is not None and isinstance(char_count, (int, float)) and char_count > 0:
        if len(chunk["text"]) < min(char_count, 50):
            return ("reject", chunk_id, "Body suspiciously short vs declared char_count")
    excerpt = derive_excerpt(chunk["text"])
    if not excerpt:
        return ("reject", chunk_id, "Could not derive an excerpt")
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
    return ("accept", row)


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
        for line in f:
            line = line.strip()
            if not line:
                continue
            total_read += 1
            try:
                chunk = json.loads(line)
            except json.JSONDecodeError as e:
                unresolved += 1
                if len(rejection_samples) < 20:
                    rejection_samples.append({"chunk_id": f"<parse:{unresolved}>", "reason": str(e)})
                continue
            result = decide_ingest(chunk, EDITION)
            if result[0] == "accept":
                all_rows.append(result[1])
                accepted += 1
            else:
                rejected += 1
                if len(rejection_samples) < 20:
                    rejection_samples.append({"chunk_id": result[1], "reason": result[2]})

    print(f"Total read: {total_read}")
    print(f"Accepted: {accepted}")
    print(f"Rejected: {rejected}")
    print(f"Unresolved: {unresolved}")

    # Write shards
    num_shards = math.ceil(len(all_rows) / SHARD_SIZE)
    print(f"\nWriting {num_shards} shard files ({SHARD_SIZE} rows each)...")
    for i in range(num_shards):
        start = i * SHARD_SIZE
        shard_rows = all_rows[start:start + SHARD_SIZE]
        shard_num = i + 1
        fname = f"tg_shard_{shard_num:02d}.jsonl"
        fpath = os.path.join(OUTPUT_DIR, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            for row in shard_rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        size_kb = os.path.getsize(fpath) / 1024
        print(f"  {fname}: {len(shard_rows)} rows, {size_kb:.0f} KB")

    # Write manifest
    manifest = {
        "edition": EDITION,
        "total_read": total_read,
        "accepted": accepted,
        "rejected": rejected,
        "unresolved": unresolved,
        "shard_size": SHARD_SIZE,
        "num_shards": num_shards,
        "rejection_samples": rejection_samples,
    }
    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    total_size = sum(os.path.getsize(os.path.join(OUTPUT_DIR, f)) for f in os.listdir(OUTPUT_DIR))
    print(f"\n{num_shards} shards in {OUTPUT_DIR}/")
    print(f"Total size: {total_size / 1024 / 1024:.1f} MB")
    print(f"Manifest: {manifest_path}")
    print(f"\nExpected: totalRead={total_read} accepted={accepted} rejected={rejected} unresolved={unresolved}")


if __name__ == "__main__":
    main()