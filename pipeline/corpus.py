"""Shared corpus access for the Herbs of Gold analysis/ingestion pipeline.

The original scraped source material lives at docs/herbsofgold_scraped/
(gitignored, preserved unchanged). This module only READS it. All derived
artefacts are written under data/ (reports committed, bulky derived files
gitignored).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CORPUS_ROOT = REPO_ROOT / "docs" / "herbsofgold_scraped"
KB_ROOT = CORPUS_ROOT / "HerbsOfGold_KnowledgeBase"
DATA_ROOT = REPO_ROOT / "data"
REPORTS_DIR = DATA_ROOT / "reports"
DERIVED_DIR = DATA_ROOT / "derived"

# Directories that are scraper artefacts, never corpus evidence.
EXCLUDE_DIRS = {".venv", "chrome_profile", "downloads", "__pycache__"}
EXCLUDE_FILES = {"cookies.txt", ".DS_Store"}

SOURCE_FILES = {
    "pdf": CORPUS_ROOT / "herbsofgold_technical_manual.pdf",
    "docx": CORPUS_ROOT / "herbsofgold_technical_manual.docx",
    "xlsx": CORPUS_ROOT / "herbsofgold_technical_manual.xlsx",
    "markdown": CORPUS_ROOT / "markdown" / "herbsofgold_technical_manual.md",
    "kb_zip": CORPUS_ROOT / "HerbsOfGold_KnowledgeBase.zip",
}

KB_PRODUCTS_JSON = KB_ROOT / "output" / "herbs_of_gold_products.json"
KB_CHUNKS_JSONL = KB_ROOT / "output" / "herbs_of_gold_product_chunks.jsonl"
KB_ISSUES_JSON = KB_ROOT / "intermediate" / "extraction_issues_raw.json"
KB_DOCX_NAMES = KB_ROOT / "intermediate" / "docx_product_names.json"
KB_DOCX_SECTIONS = KB_ROOT / "intermediate" / "docx_sections.json"
KB_EXCEL_TOC = KB_ROOT / "intermediate" / "excel_product_pages.json"
KB_PDF_PAGE_INDEX = KB_ROOT / "intermediate" / "pdf_page_index.json"
KB_VALIDATION_XLSX = KB_ROOT / "output" / "validation_report.xlsx"
KB_SAFETY_RULES_DRAFT = KB_ROOT / "intermediate" / "safety_rules_draft.json"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def write_report(name: str, payload) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out = REPORTS_DIR / name
    with out.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False, default=str)
        fh.write("\n")
    return out


def inventory_sources() -> list[dict]:
    """Walk the corpus tree, hash every real source file. Read-only."""
    rows: list[dict] = []
    for path in sorted(CORPUS_ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(CORPUS_ROOT)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        if path.name in EXCLUDE_FILES or path.name.startswith("._") or path.name.startswith("~$"):
            continue
        rows.append(
            {
                "path": str(rel),
                "size_bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "format": path.suffix.lower().lstrip("."),
            }
        )
    return rows
