"""Phase 3 — product image audit and asset extraction.

Extracts embedded images from the corpus DOCX and XLSX, content-hashes them,
maps them to canonical products, and writes:

  data/derived/images/<sha256>.<ext>     unique image payloads (gitignored)
  data/reports/image_manifest.json       per-image provenance + product match
  data/reports/image_audit.json          coverage: products with/without images

Matching strategy (strongest identity first):
  1. DOCX: image position relative to Heading-1 product sections in
     word/document.xml (an image inside a product's section is evidence).
  2. XLSX: image anchor row vs. the product-name column of Table 1.
  3. Never folder proximity — both archives are single-bag containers.
"""

from __future__ import annotations

import io
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image

from . import corpus
from .analyse import normalise_name

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
XDR_NS = "{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}"

LARGE_IMAGE_BYTES = 20_000


def _match_heading_product(text: str, products: dict[str, str]) -> str | None:
    """DOCX H1 paragraphs concatenate page furniture + pack size + product
    name (e.g. '60 / 120 capsules60 / 120 capsulesAcetyl L-Carnitine').
    The product name is the SUFFIX — longest suffix match wins."""
    norm = normalise_name(text)
    best: str | None = None
    best_len = 0
    for pname, pid in products.items():
        if norm.endswith(pname) and len(pname) > best_len:
            best, best_len = pid, len(pname)
    return best


def _docx_product_image_map(products: dict[str, str]) -> list[dict]:
    """Walk document.xml; assign each embedded image to the current H1 product."""
    path = corpus.SOURCE_FILES["docx"]
    out: list[dict] = []
    with zipfile.ZipFile(path) as z:
        rels_xml = z.read("word/_rels/document.xml.rels")
        rels = {}
        for rel in ET.fromstring(rels_xml):
            rid = rel.get("Id")
            target = rel.get("Target", "")
            if rid and target.startswith("media/"):
                rels[rid] = "word/" + target

        doc = ET.fromstring(z.read("word/document.xml"))
        body = doc.find(f"{W_NS}body")
        current_product: str | None = None
        order = 0
        for para in body.iter(f"{W_NS}p"):
            style = para.find(f"{W_NS}pPr/{W_NS}pStyle")
            if style is not None and style.get(f"{W_NS}val") == "Heading1":
                text = "".join(t.text or "" for t in para.iter(f"{W_NS}t")).strip()
                current_product = _match_heading_product(text, products)
            for blip in para.iter(f"{A_NS}blip"):
                rid = blip.get(f"{R_NS}embed")
                if not rid or rid not in rels:
                    continue
                order += 1
                out.append(
                    {
                        "archive": "docx",
                        "member": rels[rid],
                        "product_id": current_product,
                        "match_method": "docx_heading_section",
                        "embed_order": order,
                    }
                )
    return out


def _xlsx_product_image_map(products: dict[str, str]) -> list[dict]:
    """Map xlsx images to products via anchor cell vs nearest product name
    above in the SAME column (the sheet uses multi-column layouts, so plain
    row proximity is misleading)."""
    path = corpus.SOURCE_FILES["xlsx"]
    out: list[dict] = []
    with zipfile.ZipFile(path) as z:
        # sheet1 cell values → product cells (col, row)
        sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8", errors="replace")
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            ss = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in ss:
                shared.append("".join(t.text or "" for t in si.iter()))
        product_cells: list[tuple[str, int, str]] = []  # (col, row, product_id)
        for m in re.finditer(
            r'<c r="([A-Z]+)(\d+)"[^>]*(?:t="s")?[^>]*>\s*<v>([^<]+)</v>', sheet
        ):
            col, row, val = m.group(1), int(m.group(2)), m.group(3)
            text = shared[int(val)] if val.isdigit() and int(val) < len(shared) else val
            pid = products.get(normalise_name(str(text)))
            if pid:
                product_cells.append((col, row, pid))

        # drawings: xl/drawings/drawing1.xml anchors → rels → media
        drawings = [n for n in z.namelist() if re.match(r"xl/drawings/drawing\d+\.xml$", n)]
        for drawing in drawings:
            rels_name = drawing.replace("drawings/", "drawings/_rels/") + ".rels"
            rels = {}
            if rels_name in z.namelist():
                for rel in ET.fromstring(z.read(rels_name)):
                    rid, target = rel.get("Id"), rel.get("Target", "")
                    if rid and "media/" in target:
                        member = "xl/" + target.lstrip("../")
                        rels[rid] = member
            root = ET.fromstring(z.read(drawing))
            for anchor in root:
                row_el = anchor.find(f"{XDR_NS}from/{XDR_NS}row")
                col_el = anchor.find(f"{XDR_NS}from/{XDR_NS}col")
                pic = anchor.find(f"{XDR_NS}pic")
                if row_el is None or col_el is None or pic is None:
                    continue
                blip = pic.find(f".//{A_NS}blip")
                if blip is None:
                    continue
                rid = blip.get(f"{R_NS}embed")
                if not rid or rid not in rels:
                    continue
                row = int(row_el.text or 0) + 1  # 0-based → 1-based
                col_idx = int(col_el.text or 0)
                # convert column index to letters for comparison
                letters, n = "", col_idx
                while True:
                    letters = chr(ord("A") + n % 26) + letters
                    n = n // 26 - 1
                    if n < 0:
                        break
                pid = None
                best_row = -1
                for pcol, prow, ppid in product_cells:
                    if pcol == letters and prow <= row and prow > best_row:
                        pid, best_row = ppid, prow
                if pid is None:  # fallback: nearest above in any column
                    for pcol, prow, ppid in product_cells:
                        if prow <= row and prow > best_row:
                            pid, best_row = ppid, prow
                out.append(
                    {
                        "archive": "xlsx",
                        "member": rels[rid],
                        "product_id": pid,
                        "match_method": "xlsx_anchor_cell",
                        "anchor_row": row,
                        "anchor_col": letters,
                    }
                )
    return out


def extract() -> dict:
    products_json = corpus.load_json(corpus.KB_PRODUCTS_JSON)
    products = {normalise_name(p["product_name"]): p["product_id"] for p in products_json}
    name_by_id = {p["product_id"]: p["product_name"] for p in products_json}

    placements = _docx_product_image_map(products) + _xlsx_product_image_map(products)

    images_dir = corpus.DERIVED_DIR / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, dict] = {}
    for pl in placements:
        archive_path = corpus.SOURCE_FILES[pl["archive"]]
        with zipfile.ZipFile(archive_path) as z:
            data = z.read(pl["member"])
        digest = corpus.sha256_bytes(data)
        entry = manifest.setdefault(
            digest,
            {
                "sha256": digest,
                "bytes": len(data),
                "ext": Path(pl["member"]).suffix.lower().lstrip("."),
                "width": None,
                "height": None,
                "occurrences": [],
                "product_votes": {},
                "role": "unclassified",
            },
        )
        entry["occurrences"].append(
            {k: v for k, v in pl.items() if k in ("archive", "member", "match_method")}
        )
        if pl["product_id"]:
            votes = entry["product_votes"]
            votes[pl["product_id"]] = votes.get(pl["product_id"], 0) + 1

    # dimensions + role + canonical product (majority vote)
    for digest, entry in manifest.items():
        payload = None
        for occ in entry["occurrences"]:
            archive_path = corpus.SOURCE_FILES[occ["archive"]]
            with zipfile.ZipFile(archive_path) as z:
                payload = z.read(occ["member"])
            break
        try:
            with Image.open(io.BytesIO(payload)) as im:
                entry["width"], entry["height"] = im.size
        except Exception:
            pass
        entry["role"] = "unclassified"
        if entry["bytes"] > LARGE_IMAGE_BYTES:
            w, h = entry["width"] or 0, entry["height"] or 0
            # Pack shots are portrait bottle renders (~0.66 aspect). Landscape
            # large images inside product sections are study charts /
            # infographics — evidence graphics, not display images.
            entry["role"] = (
                "product_packshot" if h > w else "content_graphic"
            )
        else:
            entry["role"] = "boilerplate"
        if entry["product_votes"]:
            best = max(entry["product_votes"].items(), key=lambda kv: kv[1])
            total = sum(entry["product_votes"].values())
            entry["product_id"] = best[0]
            entry["product_name"] = name_by_id.get(best[0])
            entry["match_confidence"] = round(best[1] / total, 3) if total else 0
        else:
            entry["product_id"] = None
            entry["product_name"] = None
            entry["match_confidence"] = 0
        if entry["role"] == "product_packshot":
            out = images_dir / f"{digest}.{entry['ext']}"
            if not out.exists():
                out.write_bytes(payload)
            entry["derived_path"] = str(out.relative_to(corpus.REPO_ROOT))

    # per-product rollup (pack shots only; content graphics stay as evidence)
    by_product: dict[str, list[str]] = {}
    for digest, e in manifest.items():
        if e["role"] == "product_packshot" and e["product_id"]:
            by_product.setdefault(e["product_id"], []).append(digest)

    audit = {
        "unique_images_total": len(manifest),
        "unique_packshots": sum(1 for e in manifest.values() if e["role"] == "product_packshot"),
        "content_graphics": sum(1 for e in manifest.values() if e["role"] == "content_graphic"),
        "boilerplate_images": sum(1 for e in manifest.values() if e["role"] == "boilerplate"),
        "products_with_image": sorted(by_product),
        "products_without_image": sorted(
            set(name_by_id) - set(by_product), key=lambda x: int(x.split("-")[1])
        ),
        "images_without_product_match": sum(
            1
            for e in manifest.values()
            if e["role"] == "product_packshot" and not e["product_id"]
        ),
        "low_confidence_matches": [
            {"sha256": d, "product_id": e["product_id"], "confidence": e["match_confidence"]}
            for d, e in manifest.items()
            if e["role"] == "product_packshot" and e["product_id"] and e["match_confidence"] < 0.75
        ],
    }

    # choose primary image per product: largest matched packshot
    primaries = {}
    for pid, digests in by_product.items():
        primaries[pid] = max(digests, key=lambda d: manifest[d]["bytes"])
    audit["primary_image_by_product"] = primaries

    corpus.write_report("image_manifest.json", manifest)
    corpus.write_report("image_audit.json", audit)
    return audit


if __name__ == "__main__":
    result = extract()
    print(
        f"unique={result['unique_images_total']} packshots={result['unique_packshots']} "
        f"products_with_image={len(result['products_with_image'])} "
        f"without={len(result['products_without_image'])} "
        f"orphans={result['images_without_product_match']}",
        file=sys.stderr,
    )
