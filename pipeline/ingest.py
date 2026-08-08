"""Phase 5 — reproducible, idempotent catalogue ingestion.

Reads the analysed corpus (products JSON + image manifest + reports) and
publishes the governed catalogue to Supabase. NEVER touches the corpus.

Modes:
  python -m pipeline.ingest --dry-run     audit only; no database writes
  python -m pipeline.ingest --apply       write via PostgREST (needs key)
  python -m pipeline.ingest --apply --force   reprocess even if unchanged

Auth: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment
(service key stays server-side; never committed). Dry-run needs neither.

Idempotency: all writes are upserts on natural keys (hog_code, sha256,
unique constraints from the Phase 4 migration). Source hashes are compared
against the last successful run; unchanged corpora are skipped unless
--force is given.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error

from . import corpus


# ---------------------------------------------------------------- REST ---

class Rest:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key

    def _req(self, method: str, path: str, body=None, prefer: str | None = None):
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"{self.url}/rest/v1/{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = res.read().decode()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:400]}")

    def upsert(self, table: str, rows: list[dict], on_conflict: str):
        if not rows:
            return
        return self._req(
            "POST",
            f"{table}?on_conflict={on_conflict}",
            body=rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )

    def insert(self, table: str, rows: list[dict]):
        if not rows:
            return
        return self._req("POST", table, body=rows, prefer="return=minimal")

    def select(self, path: str):
        return self._req("GET", path)

    def upload_image(self, digest: str, ext: str, payload: bytes):
        req = urllib.request.Request(
            f"{self.url}/storage/v1/object/product-images/{digest}.{ext}",
            data=payload,
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "image/png" if ext == "png" else "image/jpeg",
                "x-upsert": "true",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.status


# ------------------------------------------------------------- staging ---

def stage_catalogue() -> dict:
    """Build all table row sets from corpus outputs. Pure — no I/O beyond
    reading the corpus and derived reports."""
    products = corpus.load_json(corpus.KB_PRODUCTS_JSON)
    csv_conf = _csv_confidence()
    image_manifest = corpus.load_json(corpus.REPORTS_DIR / "image_manifest.json")
    image_audit = corpus.load_json(corpus.REPORTS_DIR / "image_audit.json")
    primaries = image_audit.get("primary_image_by_product", {})
    issues = corpus.load_json(corpus.KB_ISSUES_JSON)

    # ingredients registry (dedupe by normalised name)
    ing_registry: dict[str, dict] = {}
    prod_rows, variant_rows, pi_rows, ind_rows, dir_rows, warn_rows, int_rows = [], [], [], [], [], [], []
    keyword_rows, claim_rows, issue_rows = [], [], []
    source_document_rows = _source_document_rows()
    source_section_rows, citation_rows = [], []
    source_ref_by_hog: dict[str, dict] = {}

    for p in products:
        hog = p["product_id"]
        source_ref = (p.get("source_references") or [{}])[0]
        source_ref_by_hog[hog] = source_ref
        if source_ref.get("source_file"):
            source_section_rows.append(
                {
                    "document_path": source_ref.get("source_file"),
                    "hog_code": hog,
                    "heading": source_ref.get("source_section"),
                    "page": source_ref.get("source_page"),
                    "text": _dedupe_lines(source_ref.get("extracted_text") or "") or None,
                }
            )

        prod_rows.append(
            {
                "hog_code": hog,
                "brand": p.get("brand") or "Herbs of Gold",
                "name": p["product_name"],
                "name_normalised": p.get("product_name_normalised")
                or p["product_name"].lower(),
                "dosage_form": (p.get("dosage_form") or "").strip() or None,
                "status": "current",
                "austl": (p.get("austl") or "").strip() or None,
                "extraction_confidence": csv_conf.get(hog),
                "source_page": source_ref.get("source_page"),
                "review_status": "needs_review"
                if (p.get("review") or {}).get("review_status") != "Reviewed"
                else "approved",
            }
        )

        for pack_size in _pack_variants(p.get("pack_size") or ""):
            variant_rows.append(
                {"hog_code": hog, "pack_size": pack_size, "status": "current"}
            )

        clinical_tags = p.get("clinical_tags") or {}
        for field, keyword_type in (
            ("clinical_use_tags", "clinical_use_tag"),
            ("avoid_if_tags", "avoid_if_tag"),
            ("medicine_interaction_flags", "medicine_interaction_flag"),
            ("counselling_flags", "counselling_flag"),
        ):
            for keyword in clinical_tags.get(field, []):
                keyword = str(keyword).strip()
                if keyword:
                    keyword_rows.append(
                        {
                            "hog_code": hog,
                            "keyword": keyword,
                            "keyword_type": keyword_type,
                            "provenance": "source_corpus",
                            "approved": True,
                        }
                    )

        d = p.get("directions") or {}
        dir_rows.append(
            {
                "hog_code": hog,
                "adult_dose": (d.get("adult_dose") or "").strip() or None,
                "child_dose": (d.get("child_dose") or "").strip() or None,
                "raw_text": (d.get("raw_text") or "").strip() or None,
            }
        )

        for ing in p.get("ingredients", []):
            name = (ing.get("ingredient_name") or "").strip()
            if not name:
                continue
            norm = name.lower()
            ing_registry.setdefault(norm, {"canonical_name": name, "name_normalised": norm})
            pi_rows.append(
                {
                    "hog_code": hog,
                    "ingredient_norm": norm,
                    "content_key": _ck(
                        hog, norm, str(ing.get("strength") or ""), ing.get("ingredient_form") or ""
                    ),
                    "ingredient_form": (ing.get("ingredient_form") or "").strip() or None,
                    "strength": str(ing.get("strength") or "").strip() or None,
                    "strength_unit": (ing.get("strength_unit") or "").strip() or None,
                    "equivalent_amount": str(ing.get("equivalent_amount") or "").strip() or None,
                    "equivalent_unit": (ing.get("equivalent_unit") or "").strip() or None,
                    "equivalent_name": (ing.get("equivalent_name") or "").strip() or None,
                    "source_page": ing.get("source_page"),
                    "extraction_confidence": ing.get("extraction_confidence"),
                }
            )
            claim_rows.append(
                _claim(hog, "ingredient_fact", name, ing, ing.get("source_page"),
                       ing.get("extraction_confidence"))
            )

        for ind in p.get("indications", []):
            text = _dedupe_lines((ind.get("text") or "").strip())
            if not text:
                continue
            ind_rows.append(
                {
                    "hog_code": hog,
                    "text": text,
                    "content_key": _ck(text),
                    "indication_type": ind.get("type") or "source_label_claim",
                    "clinical_use_tag": (ind.get("clinical_use_tag") or "").strip() or None,
                    "source_page": ind.get("source_page"),
                }
            )
            claim_rows.append(
                _claim(hog, "manufacturer_indication", text, ind, ind.get("source_page"), None)
            )

        for c in p.get("cautions", []):
            text = _dedupe_lines((c.get("text") or "").strip())
            if not text:
                continue
            tags = [t.strip() for t in (c.get("avoid_if_tag") or "").split(",") if t.strip()]
            warn_rows.append(
                {
                    "hog_code": hog,
                    "text": text,
                    "content_key": _ck(text),
                    "warning_type": c.get("type") or "caution",
                    "severity": c.get("severity"),
                    "avoid_if_tags": tags,
                    "source_page": c.get("source_page"),
                }
            )
            claim_rows.append(
                _claim(hog, "safety_warning", text, c, c.get("source_page"), None)
            )

        for x in p.get("interactions", []):
            text = _dedupe_lines((x.get("interaction_text") or "").strip())
            if not text:
                continue
            flags = [
                f.strip()
                for f in (x.get("medicine_interaction_flag") or "").split(",")
                if f.strip()
            ]
            int_rows.append(
                {
                    "hog_code": hog,
                    "content_key": _ck(text),
                    "ingredient_name": (x.get("ingredient_name") or "").strip() or None,
                    "interacting_medicine_or_class": (
                        x.get("interacting_medicine_or_class") or ""
                    ).strip()
                    or None,
                    "interaction_text": text,
                    "action": x.get("action"),
                    "severity": x.get("severity"),
                    "flags": flags,
                    "source_page": x.get("source_page"),
                }
            )
            claim_rows.append(_claim(hog, "interaction", text, x, x.get("source_page"), None))

        if (d.get("raw_text") or "").strip():
            claim_rows.append(
                _claim(hog, "directions", d["raw_text"].strip(), d,
                       (p.get("source_references") or [{}])[0].get("source_page"), None)
            )

    # images
    img_rows = []
    for digest, e in image_manifest.items():
        if e["role"] != "product_packshot" or not e.get("product_id"):
            continue  # content graphics + orphans stay out of the catalogue display set
        hog = e["product_id"]
        img_rows.append(
            {
                "hog_code": hog,
                "sha256": digest,
                "derived_path": e.get("derived_path"),
                "mime_type": "image/png" if e["ext"] == "png" else "image/jpeg",
                "width": e.get("width"),
                "height": e.get("height"),
                "bytes": e.get("bytes"),
                "role": e["role"],
                "is_primary": primaries.get(hog) == digest,
                "match_method": (e.get("occurrences") or [{}])[0].get("match_method"),
                "match_confidence": e.get("match_confidence"),
                "original_source": e.get("occurrences") or [],
                "alt_text": f"{e.get('product_name') or hog} pack shot"
                if e.get("product_id")
                else "Image unavailable",
            }
        )

    # data quality issues from the prior pipeline's log
    for i in issues:
        issue_rows.append(
            {
                "hog_code": i.get("ProductID"),
                "issue_type": i.get("IssueType") or "unknown",
                "description": i.get("IssueDescription"),
                "severity": (i.get("Severity") or "").lower() or None,
                "source_file": i.get("SourceFile"),
                "source_page": i.get("SourcePage"),
                "status": "open",
            }
        )

    # The source clinical_tags arrays occasionally repeat a tag (notably
    # renal_impairment_caution). Natural-key identity is type+keyword, so
    # collapse repeats while preserving first-seen order.
    keyword_rows = list(
        {
            (r["hog_code"], r["keyword_type"], r["keyword"]): r
            for r in keyword_rows
        }.values()
    )

    # Per-claim citations back to the corpus. claim_citations is the table
    # the References explorer and product cards use for page-level evidence.
    for claim in claim_rows:
        ref = source_ref_by_hog.get(claim["hog_code"], {})
        document_path = ref.get("source_file")
        if not document_path:
            continue
        citation_rows.append(
            {
                "claim_hog_code": claim["hog_code"],
                "claim_type": claim["claim_type"],
                "claim_content_key": claim["content_key"],
                "document_path": document_path,
                "page": claim.get("source_page") or ref.get("source_page"),
                "section_heading": ref.get("source_section"),
                "excerpt": claim["text"][:500],
                "source_format": document_path.rsplit(".", 1)[-1].lower(),
            }
        )

    return {
        "catalogue_products": prod_rows,
        "product_variants": variant_rows,
        "ingredients": list(ing_registry.values()),
        "product_ingredients": pi_rows,
        "product_directions": dir_rows,
        "product_indications": ind_rows,
        "product_warnings": warn_rows,
        "product_interaction_flags": int_rows,
        "product_keywords": keyword_rows,
        "product_images": img_rows,
        "source_documents": source_document_rows,
        "source_sections": source_section_rows,
        "source_claims": claim_rows,
        "claim_citations": citation_rows,
        "data_quality_issues": issue_rows,
    }


def _source_document_rows() -> list[dict]:
    """Register the small set of real source documents (not pipeline
    intermediates). Paths are corpus-relative and hashed for idempotency."""
    roles = {
        "pdf": "source_of_truth",
        "docx": "cross_check",
        "xlsx": "cross_check",
        "markdown": "readability_cross_check",
        "kb_zip": "archive_duplicate",
    }
    titles = {
        "pdf": "Herbs of Gold Technical Manual (PDF)",
        "docx": "Herbs of Gold Technical Manual (DOCX)",
        "xlsx": "Herbs of Gold Technical Manual (XLSX)",
        "markdown": "Herbs of Gold Technical Manual (Markdown)",
        "kb_zip": "Prior Herbs of Gold KnowledgeBase archive",
    }
    rows = []
    for key, path in corpus.SOURCE_FILES.items():
        if not path.exists():
            continue
        rows.append(
            {
                "title": titles[key],
                "format": key,
                "corpus_path": str(path.relative_to(corpus.CORPUS_ROOT)),
                "sha256": corpus.sha256_file(path),
                "page_count": 206 if key == "pdf" else None,
                "role": roles[key],
            }
        )
    return rows


def stage_ontology() -> dict:
    """Phase 6: stage the curated clinical/search ontology from committed
    seed data (data/ontology/). The canonical label is itself a searchable
    term, so it is staged as a synonym row with provenance 'canonical_label'.
    Auto-proposed synonyms (none in the seed) would stage with
    approved=False; everything curated here is approved."""
    seed = corpus.load_json(corpus.ONTOLOGY_JSON)
    concept_rows, synonym_rows = [], []
    for concept in seed.get("concepts", []):
        concept_rows.append(
            {
                "concept_type": concept["concept_type"],
                "canonical_label": concept["canonical_label"],
                "clinical_use_tags": concept.get("clinical_use_tags") or [],
            }
        )
        synonym_rows.append(
            {
                "concept_type": concept["concept_type"],
                "canonical_label": concept["canonical_label"],
                "term": concept["canonical_label"],
                "synonym_type": "curated_search",
                "approved": True,
                "provenance": "canonical_label",
            }
        )
        for syn in concept.get("synonyms", []):
            term = str(syn.get("term") or "").strip()
            if not term or term == concept["canonical_label"]:
                continue
            synonym_rows.append(
                {
                    "concept_type": concept["concept_type"],
                    "canonical_label": concept["canonical_label"],
                    "term": term,
                    "synonym_type": syn.get("synonym_type") or "curated_search",
                    "approved": bool(syn.get("approved", True)),
                    "provenance": syn.get("provenance") or "curated",
                }
            )
    return {
        "ontology_concepts": concept_rows,
        "ontology_synonyms": synonym_rows,
    }


def _pack_variants(raw: str) -> list[str]:
    """Split source pack-size strings such as "60 / 120 capsules" into
    variant rows without inventing data. Ambiguous strings stay verbatim."""
    raw = " ".join(str(raw).split())
    if not raw:
        return []
    parts = [p.strip() for p in raw.replace(",", " / ").split("/") if p.strip()]
    if len(parts) == 1:
        return [raw]
    import re

    unit = re.sub(r"^[\d.\s/]+", "", raw).strip()
    out = []
    for part in parts:
        has_letters = bool(re.search(r"[a-zA-Z]", part))
        starts_numeric = bool(re.match(r"^\d", part))
        if starts_numeric and unit and not has_letters:
            out.append(f"{part} {unit}")
        else:
            out.append(part)
    return list(dict.fromkeys(out))


def _ck(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def _claim(hog, ctype, text, structured, page, conf):
    return {
        "hog_code": hog,
        "claim_type": ctype,
        "content_key": _ck(hog, ctype, text),
        "text": text[:2000],
        "structured": structured,
        "extraction_confidence": conf if conf in ("High", "Medium", "Low") else None,
        "explicit_or_inferred": "explicit",
        "review_status": "extracted",
        "source_page": page,
    }


def _dedupe_lines(text: str) -> str:
    """Corpus extraction duplicated blocks across page breaks; collapse
    exact duplicate lines."""
    seen, out = set(), []
    for line in text.splitlines():
        key = line.strip()
        if key and key not in seen:
            seen.add(key)
            out.append(line)
    return "\n".join(out).strip()


def _csv_confidence() -> dict[str, str]:
    import csv as _csv

    path = corpus.KB_ROOT / "output" / "herbs_of_gold_products.csv"
    out = {}
    if path.exists():
        with path.open(encoding="utf-8") as fh:
            for row in _csv.DictReader(fh):
                out[row["ProductID"]] = row.get("ExtractionConfidence") or None
    return out


# ---------------------------------------------------------------- main ---

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if not args.dry_run and not args.apply:
        ap.error("choose --dry-run or --apply")

    started = time.time()
    inventory = corpus.inventory_sources()
    staged = {**stage_catalogue(), **stage_ontology()}
    stats = {k: len(v) for k, v in staged.items()}
    stats["source_files"] = len(inventory)

    print("=== ingestion staging ===")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")

    # validation: required fields + natural-key uniqueness (upsert safety)
    failures = []
    for r in staged["catalogue_products"]:
        if not r["hog_code"] or not r["name"]:
            failures.append(f"product missing identity: {r}")

    def duplicate_keys(rows: list[dict], key_fn, label: str) -> None:
        seen, dupes = set(), set()
        for row in rows:
            key = key_fn(row)
            if key in seen:
                dupes.add(key)
            seen.add(key)
        for key in sorted(dupes):
            failures.append(f"duplicate {label}: {key}")

    duplicate_keys(
        staged["product_keywords"],
        lambda r: (r["hog_code"], r["keyword_type"], r["keyword"]),
        "product keyword key",
    )
    duplicate_keys(
        staged["product_variants"],
        lambda r: (r["hog_code"], r["pack_size"]),
        "product variant key",
    )
    duplicate_keys(
        staged["claim_citations"],
        lambda r: (
            r["claim_hog_code"], r["claim_type"], r["claim_content_key"],
            r["document_path"], r["page"], r["section_heading"],
        ),
        "claim citation key",
    )
    duplicate_keys(
        staged["ontology_concepts"],
        lambda r: (r["concept_type"], r["canonical_label"]),
        "ontology concept key",
    )
    duplicate_keys(
        staged["ontology_synonyms"],
        lambda r: (r["concept_type"], r["canonical_label"], r["term"].lower()),
        "ontology synonym key",
    )
    if failures:
        print("VALIDATION FAILED:", *failures, sep="\n  ")
        return 1

    if args.dry_run:
        out = corpus.REPORTS_DIR / "ingestion_dry_run.json"
        corpus.write_report("ingestion_dry_run.json", {"stats": stats, "source_hashes": {
            r["path"]: r["sha256"] for r in inventory
        }})
        print(f"dry-run audit written to {out}")
        return 0

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply",
              file=sys.stderr)
        return 2
    rest = Rest(url, key)

    # skip unchanged corpus unless --force
    hashes = {r["path"]: r["sha256"] for r in inventory}
    if not args.force:
        last = rest.select(
            "ingestion_runs?status=eq.complete&order=finished_at.desc&limit=1&select=source_hashes"
        )
        if last and last[0].get("source_hashes") == hashes:
            print("corpus unchanged since last successful run — skipping (use --force)")
            return 0

    run = rest.insert("ingestion_runs", [{"dry_run": False, "source_hashes": hashes, "stats": stats}])

    try:
        # provenance documents first: sections/citations reference their UUIDs
        rest.upsert("source_documents", staged["source_documents"], "corpus_path")
        docs = rest.select("source_documents?select=document_id,corpus_path")
        did = {d["corpus_path"]: d["document_id"] for d in docs}
        rest.upsert(
            "source_sections",
            [
                {**{k: v for k, v in r.items() if k != "document_path"},
                 "document_id": did[r["document_path"]]}
                for r in staged["source_sections"]
            ],
            "document_id,hog_code,heading,page",
        )

        # Phase 6 ontology: concepts then synonyms (FK on concept_id).
        # Independent of the catalogue identity map.
        rest.upsert(
            "ontology_concepts",
            staged["ontology_concepts"],
            "concept_type,canonical_label",
        )
        concepts = rest.select("ontology_concepts?select=concept_id,concept_type,canonical_label")
        ont_id = {
            (c["concept_type"], c["canonical_label"]): c["concept_id"] for c in concepts
        }
        rest.upsert(
            "ontology_synonyms",
            [
                {
                    "concept_id": ont_id[(r["concept_type"], r["canonical_label"])],
                    "term": r["term"],
                    "synonym_type": r["synonym_type"],
                    "approved": r["approved"],
                    "provenance": r["provenance"],
                }
                for r in staged["ontology_synonyms"]
            ],
            "concept_id,term",
        )

        # identity map: hog_code -> uuid
        rest.upsert("catalogue_products", staged["catalogue_products"], "hog_code")
        prods = rest.select("catalogue_products?select=product_id,hog_code")
        pid = {p["hog_code"]: p["product_id"] for p in prods}

        rest.upsert(
            "product_variants",
            [{**{k: v for k, v in r.items() if k != "hog_code"}, "product_id": pid[r["hog_code"]]}
             for r in staged["product_variants"]],
            "product_id,pack_size",
        )
        rest.upsert(
            "product_keywords",
            [{**{k: v for k, v in r.items() if k != "hog_code"}, "product_id": pid[r["hog_code"]]}
             for r in staged["product_keywords"]],
            "product_id,keyword_type,keyword",
        )

        rest.upsert("ingredients", staged["ingredients"], "canonical_name")
        ings = rest.select("ingredients?select=ingredient_id,name_normalised")
        iid = {i["name_normalised"]: i["ingredient_id"] for i in ings}

        rest.upsert(
            "product_ingredients",
            [
                {**{k: v for k, v in r.items() if k not in ("hog_code", "ingredient_norm")},
                 "product_id": pid[r["hog_code"]], "ingredient_id": iid[r["ingredient_norm"]]}
                for r in staged["product_ingredients"]
            ],
            "product_id,content_key",
        )
        rest.upsert(
            "product_directions",
            [{"product_id": pid[r["hog_code"]], **{k: v for k, v in r.items() if k != "hog_code"}}
             for r in staged["product_directions"]],
            "product_id",
        )
        for table in ("product_indications", "product_warnings", "product_interaction_flags"):
            rest.upsert(
                table,
                [{**{k: v for k, v in r.items() if k != "hog_code"}, "product_id": pid[r["hog_code"]]}
                 for r in staged[table]],
                "product_id,content_key",
            )

        # images: upload payload to storage, then upsert rows
        image_rows = []
        for r in staged["product_images"]:
            derived = r.pop("derived_path", None)
            storage_path = None
            if derived:
                fp = corpus.REPO_ROOT / derived
                if fp.exists():
                    ext = fp.suffix.lstrip(".")
                    rest.upload_image(r["sha256"], ext, fp.read_bytes())
                    storage_path = f"product-images/{r['sha256']}.{ext}"
            image_rows.append(
                {**{k: v for k, v in r.items() if k != "hog_code"},
                 "product_id": pid.get(r["hog_code"]), "storage_path": storage_path}
            )
        rest.upsert("product_images", image_rows, "sha256")

        # claims + citations + quality issues
        rest.upsert(
            "source_claims",
            [{k: v for k, v in r.items() if k != "source_page"} for r in staged["source_claims"]],
            "hog_code,claim_type,content_key",
        )
        claims = rest.select("source_claims?select=claim_id,hog_code,claim_type,content_key")
        cid = {
            (c["hog_code"], c["claim_type"], c["content_key"]): c["claim_id"]
            for c in claims
        }
        rest.upsert(
            "claim_citations",
            [
                {
                    "claim_id": cid[(r["claim_hog_code"], r["claim_type"], r["claim_content_key"])],
                    "document_id": did[r["document_path"]],
                    "page": r["page"],
                    "section_heading": r["section_heading"],
                    "excerpt": r["excerpt"],
                    "source_format": r["source_format"],
                }
                for r in staged["claim_citations"]
            ],
            "claim_id,document_id,page,section_heading",
        )
        rest.upsert(
            "data_quality_issues",
            staged["data_quality_issues"],
            "hog_code,issue_type,description",
        )

        rest._req(
            "PATCH",
            "ingestion_runs?order=started_at.desc&limit=1",
            body={"status": "complete", "finished_at": "now()", "stats": stats},
            prefer="return=minimal",
        )
    except Exception as e:
        rest._req(
            "PATCH",
            "ingestion_runs?order=started_at.desc&limit=1",
            body={"status": "error", "finished_at": "now()", "last_error": str(e)[:500]},
            prefer="return=minimal",
        )
        raise

    print(f"ingestion complete in {time.time()-started:.1f}s: {stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
