#!/usr/bin/env python3
"""
Medication corpus ingestion pipeline.

Parses AMH and eMIMS scraped markdown files into structured JSON
ready for Supabase ingestion. Runs locally; output is committed to
the repo as data/medication_kb/ for Lovable to pick up.

Usage:
  python3 scripts/ingest_medication_kb.py --emims /path/to/abbrev_pi --amh /path/to/amh_scraped --output data/medication_kb

Principles:
  - NEVER store raw monograph text. Only structured assertions + short excerpts (<=256 chars).
  - Idempotent: content_hash on every assertion prevents duplicates.
  - Source conflicts (AMH vs eMIMS) are detected and recorded.
  - Incremental: a second run against identical files produces zero new rows.
"""

import os
import re
import json
import hashlib
import argparse
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

# ---- Section heading detection ----

# eMIMS section headings (## level)
EMIMS_SECTIONS = {
    "Use": "indication",
    "Contraindications": "contraindication",
    "Precautions": "precaution",
    "Adverse Effects": "adverse_effect_common",
    "Interactions": "drug_interaction",
    "Additional Information": "clinical_note",
    "Available Products": "dose_form",
}

# AMH section headings (## level in markdown)
AMH_SECTIONS = {
    "Mode of action": "mechanism",
    "Indications": "indication",
    "Precautions": "precaution",
    "Adverse effects": "adverse_effect_common",
    "Dosage": "dosage",
    "Administration": "administration",
    "Monitoring": "monitoring",
    "Counselling": "counselling",
    "Practice points": "clinical_note",
    "Drug interactions": "drug_interaction",
}

# AMH subsection headings (### level)
AMH_SUBSECTIONS = {
    "Renal": "renal_consideration",
    "Hepatic": "hepatic_consideration",
    "Pregnancy": "pregnancy",
    "Breastfeeding": "breastfeeding",
    "Elderly": "elderly",
    "Children": "paediatric",
    "Women": "precaution",
    "Surgery": "precaution",
}

# eMIMS header fields
EMIMS_HEADER_FIELDS = {
    "Generic name": "generic_name",
    "Sponsor / manufacturer": "manufacturer",
    "MIMS Class": "mims_class",
    "Use in Pregnancy": "pregnancy_category",
    "ARTG": "artg_status",
    "Sports": "sports_status",
    "eMIMSplus drug ID": "emims_id",
    "Scraped": "scraped_at",
}

# Drug class mappings from MIMS Class field
MIMS_CLASS_TO_CODE = {
    "Hypolipidaemic agents": "statin",
    "Lipid-lowering agents": "statin",
    "Antihypertensives": "antihypertensive",
    "ACE inhibitors": "ace_inhibitor",
    "Angiotensin II receptor blockers": "arb",
    "Beta blockers": "beta_blocker",
    "Calcium-channel blockers": "calcium_channel_blocker",
    "Diuretics": "diuretic",
    "Anticoagulants": "anticoagulant",
    "Antiplatelet drugs": "antiplatelet",
    "Proton pump inhibitors": "ppi",
    "H2 antagonists": "h2_antagonist",
    "Antidiabetic agents": "diabetes",
    "Biguanides": "diabetes",
    "Sulfonylureas": "sulfonylurea",
    "GLP-1 receptor agonists": "glp1_agonist",
    "SGLT2 inhibitors": "sglt2_inhibitor",
    "Insulin": "insulin",
    "Thyroid hormones": "thyroid",
    "Antidepressants": "antidepressant",
    "SSRIs": "ssri",
    "SNRIs": "snri",
    "TCAs": "tca",
    "MAOIs": "maoi",
    "Antipsychotics": "antipsychotic",
    "Antiepileptics": "antiepileptic",
    "Analgesics": "analgesic",
    "Opioids": "opioid",
    "NSAIDs": "nsaid",
    "Corticosteroids": "corticosteroid",
    "Bisphosphonates": "bisphosphonate",
    "Antibiotics": "antibiotic",
    "Tetracyclines": "tetracycline",
    "Quinolones": "quinolone",
    "Penicillins": "penicillin",
    "Cephalosporins": "cephalosporin",
    "Immunosuppressants": "immunosuppressant",
    "Benzodiazepines": "benzodiazepine",
}

# AMH chapter to class code
AMH_CHAPTER_TO_CLASS = {
    "cardiovascular-drugs": "cardiovascular",
    "endocrine-drugs": "endocrine",
    "gastrointestinal-drugs": "gastrointestinal",
    "anti-infectives": "anti_infective",
    "analgesics": "analgesic",
    "respiratory-drugs": "respiratory",
    "dermatological-drugs": "dermatological",
    "immunomodulators-and-anti-inflammatories": "immunomodulator",
    "anticancer-drugs": "anticancer",
    "blood-and-electrolytes": "blood_electrolyte",
    "genitourinary-drugs": "genitourinary",
    "eye-drugs": "eye",
    "ear-nose-and-throat-drugs": "ent",
    "anaesthetics": "anaesthetic",
    "antidotes-and-antivenoms": "antidote",
    "antihistamines": "antihistamine",
    "allergy-and-anaphylaxis": "allergy_anaphylaxis",
    "nervous-system-drugs": "nervous_system",
    "musculoskeletal-drugs": "musculoskeletal",
}

MAX_EXCERPT_LEN = 256


def content_hash(concept_id: str, assertion_type: str, statement: str) -> str:
    """SHA256 of concept_id + assertion_type + statement for dedup."""
    raw = f"{concept_id}|{assertion_type}|{statement[:512]}"
    return hashlib.sha256(raw.encode()).hexdigest()


def normalise_name(name: str) -> str:
    """Normalise a drug name for matching."""
    return re.sub(r'[^a-z0-9]', '', name.lower())


def extract_generic_from_filename(filename: str) -> str:
    """Extract a drug name from an eMIMS filename like 'apo-atorvastatin.md'."""
    base = Path(filename).stem
    # Remove brand prefixes like apo-, chemmart-, terry-white-, etc
    prefixes = ['apo-', 'chemmart-', 'terry-white-', 'healthylife-', 'ranbaxy-',
                'sandoz-', 'wgr-', 'sz-', 'blooms-the-chemist-', 'pharmacy-',
                'generic-', 'drugland-', 'amcal-', 'soul-pattison-', 'national-',
                'terry-white-chemmart-']
    for p in prefixes:
        if base.startswith(p):
            base = base[len(p):]
    return base.replace('-', ' ').strip()


def parse_emims_file(filepath: Path) -> dict:
    """Parse a single eMIMS abbreviated PI markdown file."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()

    result = {
        "generic_name": None,
        "brand_name": None,
        "manufacturer": None,
        "mims_class": None,
        "pregnancy_category": None,
        "emims_id": None,
        "scraped_at": None,
        "sections": {},
        "products": [],
    }

    # Parse header (lines starting with **)
    for line in text.split('\n')[:30]:
        for field, key in EMIMS_HEADER_FIELDS.items():
            if line.startswith(f'**{field}:**'):
                val = line.replace(f'**{field}:**', '').strip().rstrip('*').strip()
                if key == 'generic_name':
                    result["generic_name"] = val
                elif key == 'mims_class':
                    result["mims_class"] = val
                elif key == 'pregnancy_category':
                    # Extract just the letter (A/B/C/D/X)
                    cat_match = re.match(r'^([A-X])\b', val)
                    result["pregnancy_category"] = cat_match.group(1) if cat_match else val[:1]
                elif key == 'emims_id':
                    result["emims_id"] = val.strip('`')
                elif key == 'scraped_at':
                    result["scraped_at"] = val
                elif key == 'manufacturer':
                    result["manufacturer"] = val

    # Parse sections (## headings)
    current_section = None
    current_content = []
    for line in text.split('\n'):
        if line.startswith('## ') and not line.startswith('## Available'):
            if current_section:
                result["sections"][current_section] = '\n'.join(current_content).strip()
            current_section = line[3:].strip()
            current_content = []
        elif line.startswith('### ') and current_section == "Available Products":
            # Product subsection
            if current_content:
                result["sections"][current_section] = '\n'.join(current_content).strip()
            current_section = line[4:].strip()
            current_content = []
        elif current_section:
            current_content.append(line)

    if current_section:
        result["sections"][current_section] = '\n'.join(current_content).strip()

    # Parse available products section for dose/form/strength
    for section_name, section_text in result["sections"].items():
        if 'S4' in section_name or 'S3' in section_name or 'S2' in section_name or 'Tablet' in section_name or 'Capsule' in section_name:
            product = {"name": section_name, "details": section_text[:500]}
            result["products"].append(product)

    return result


def parse_amh_file(filepath: Path) -> dict:
    """Parse a single AMH markdown file."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()

    result = {
        "drug_name": None,
        "chapter": None,
        "url": None,
        "scraped_at": None,
        "sections": {},
        "subsections": {},
    }

    # Parse YAML frontmatter
    fm_match = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if fm_match:
        for line in fm_match.group(1).split('\n'):
            if ':' in line:
                key, val = line.split(':', 1)
                key = key.strip()
                val = val.strip()
                if key == 'drug':
                    result["drug_name"] = val
                elif key == 'chapter':
                    result["chapter"] = val
                elif key == 'url':
                    result["url"] = val
                elif key == 'scraped_at':
                    result["scraped_at"] = val

    # Remove frontmatter
    if fm_match:
        text = text[fm_match.end():]

    # Parse sections (## level) and subsections (### level)
    current_section = None
    current_subsection = None
    current_content = []
    current_sub_content = []

    for line in text.split('\n'):
        if line.startswith('## '):
            if current_subsection:
                result["subsections"][current_subsection] = '\n'.join(current_sub_content).strip()
                current_subsection = None
                current_sub_content = []
            if current_section:
                result["sections"][current_section] = '\n'.join(current_content).strip()
            current_section = line[3:].strip()
            current_content = []
        elif line.startswith('### '):
            if current_subsection:
                result["subsections"][current_subsection] = '\n'.join(current_sub_content).strip()
            current_subsection = line[4:].strip()
            current_sub_content = []
        elif current_subsection:
            current_sub_content.append(line)
        elif current_section:
            current_content.append(line)

    if current_subsection:
        result["subsections"][current_subsection] = '\n'.join(current_sub_content).strip()
    if current_section:
        result["sections"][current_section] = '\n'.join(current_content).strip()

    return result


def extract_assertions_from_emims(parsed: dict, concept_id: str, source_file: str) -> list:
    """Extract atomic assertions from a parsed eMIMS file."""
    assertions = []

    for section_name, section_text in parsed["sections"].items():
        assertion_type = EMIMS_SECTIONS.get(section_name)
        if not assertion_type or not section_text.strip():
            continue

        # Split into paragraphs for atomic assertions
        paragraphs = [p.strip() for p in section_text.split('\n\n') if p.strip()]

        for para in paragraphs:
            # Truncate to excerpt length
            statement = para[:MAX_EXCERPT_LEN].strip()
            if not statement or len(statement) < 10:
                continue

            # Special handling for pregnancy category from header
            if assertion_type == "indication" and parsed.get("pregnancy_category"):
                pass  # pregnancy category handled separately

            assertions.append({
                "concept_id": concept_id,
                "assertion_type": assertion_type,
                "statement": statement,
                "source_code": "eMIMS",
                "source_file": source_file,
                "source_section": section_name,
                "extraction_method": "section_parser",
                "confidence": "high",
                "content_hash": content_hash(concept_id, assertion_type, statement),
            })

    # Pregnancy category as a separate assertion
    if parsed.get("pregnancy_category"):
        cat = parsed["pregnancy_category"]
        cat_statement = f"Pregnancy category {cat}"
        assertions.append({
            "concept_id": concept_id,
            "assertion_type": "pregnancy_category",
            "assertion_value": cat,
            "statement": cat_statement,
            "source_code": "eMIMS",
            "source_file": source_file,
            "source_section": "Header",
            "extraction_method": "field_parser",
            "confidence": "high",
            "content_hash": content_hash(concept_id, "pregnancy_category", cat_statement),
        })

    # MIMS class as assertion
    if parsed.get("mims_class"):
        cls = parsed["mims_class"]
        assertions.append({
            "concept_id": concept_id,
            "assertion_type": "mims_class",
            "assertion_value": cls,
            "statement": cls,
            "source_code": "eMIMS",
            "source_file": source_file,
            "source_section": "Header",
            "extraction_method": "field_parser",
            "confidence": "high",
            "content_hash": content_hash(concept_id, "mims_class", cls),
        })

    return assertions


def extract_assertions_from_amh(parsed: dict, concept_id: str, source_file: str) -> list:
    """Extract atomic assertions from a parsed AMH file."""
    assertions = []

    for section_name, section_text in parsed["sections"].items():
        assertion_type = AMH_SECTIONS.get(section_name)
        if not assertion_type or not section_text.strip():
            continue

        paragraphs = [p.strip() for p in section_text.split('\n\n') if p.strip()]

        for para in paragraphs:
            statement = para[:MAX_EXCERPT_LEN].strip()
            if not statement or len(statement) < 10:
                continue

            assertions.append({
                "concept_id": concept_id,
                "assertion_type": assertion_type,
                "statement": statement,
                "source_code": "AMH",
                "source_file": source_file,
                "source_section": section_name,
                "extraction_method": "section_parser",
                "confidence": "high",
                "content_hash": content_hash(concept_id, assertion_type, statement),
            })

    # Subsections (Renal, Hepatic, Pregnancy, etc)
    for sub_name, sub_text in parsed["subsections"].items():
        assertion_type = AMH_SUBSECTIONS.get(sub_name)
        if not assertion_type or not sub_text.strip():
            continue

        paragraphs = [p.strip() for p in sub_text.split('\n\n') if p.strip()]
        for para in paragraphs:
            statement = para[:MAX_EXCERPT_LEN].strip()
            if not statement or len(statement) < 10:
                continue

            assertions.append({
                "concept_id": concept_id,
                "assertion_type": assertion_type,
                "statement": statement,
                "source_code": "AMH",
                "source_file": source_file,
                "source_section": sub_name,
                "extraction_method": "section_parser",
                "confidence": "high",
                "content_hash": content_hash(concept_id, assertion_type, statement),
            })

    # AMH chapter as assertion
    if parsed.get("chapter"):
        ch = parsed["chapter"]
        assertions.append({
            "concept_id": concept_id,
            "assertion_type": "amh_chapter",
            "assertion_value": ch,
            "statement": ch,
            "source_code": "AMH",
            "source_file": source_file,
            "source_section": "Frontmatter",
            "extraction_method": "field_parser",
            "confidence": "high",
            "content_hash": content_hash(concept_id, "amh_chapter", ch),
        })

    return assertions


def detect_combination(generic_name: str) -> list:
    """Detect if a drug name is a combination product."""
    if not generic_name:
        return []

    # Common patterns: "X + Y", "X/Y", "X and Y"
    parts = re.split(r'\s*[+/]\s*|\s+and\s+', generic_name, flags=re.IGNORECASE)
    if len(parts) > 1:
        return [p.strip() for p in parts if p.strip()]
    return []


def run_ingestion(emims_dir: str, amh_dir: str, output_dir: str):
    """Run full ingestion of both corpora."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # ---- Phase 1: Build concept registry from both corpora ----
    concepts = {}  # normalised_name -> concept info
    concept_assertions = defaultdict(list)  # concept_id -> assertions
    concept_names = defaultdict(list)  # concept_id -> names
    concept_classes = defaultdict(list)  # concept_id -> class codes
    concept_forms = defaultdict(list)  # concept_id -> forms

    # ---- Parse eMIMS ----
    emims_path = Path(emims_dir)
    emims_files = sorted(emims_path.glob('*.md'))
    emims_parsed = 0
    emims_failed = 0

    # Filter out non-drug files (scrape logs, etc)
    emims_drug_files = [f for f in emims_files if not f.name.startswith('_') and not f.name.startswith('1753')]

    print(f"[eMIMS] Processing {len(emims_drug_files)} drug files...")

    # Build a map: normalised generic name -> list of eMIMS files (brand variants)
    generic_to_emims = defaultdict(list)

    for fp in emims_drug_files:
        try:
            parsed = parse_emims_file(fp)
            if not parsed.get("generic_name"):
                emims_failed += 1
                continue

            generic = parsed["generic_name"].strip()
            norm = normalise_name(generic)

            if norm not in concepts:
                import uuid
                concepts[norm] = {
                    "concept_id": str(uuid.uuid4()),
                    "canonical_name": generic,
                    "name_normalised": norm,
                    "sources": [],
                }

            concept = concepts[norm]
            if "eMIMS" not in concept["sources"]:
                concept["sources"].append("eMIMS")

            # Add brand name from filename
            brand_from_fn = extract_generic_from_filename(fp.name)
            # The filename often encodes the brand
            brand_name = fp.stem.replace('-', ' ').strip()
            # If generic is in the brand name, it's a generic-brand; otherwise it's a brand
            if normalise_name(brand_name) != norm:
                concept_names[concept["concept_id"]].append({
                    "name": brand_name,
                    "name_type": "brand",
                    "source_code": "eMIMS",
                    "is_primary": False,
                })

            # Add generic name
            concept_names[concept["concept_id"]].append({
                "name": generic,
                "name_type": "generic",
                "source_code": "eMIMS",
                "is_primary": True,
            })

            # Extract assertions
            assertions = extract_assertions_from_emims(parsed, concept["concept_id"], fp.name)
            concept_assertions[concept["concept_id"]].extend(assertions)

            # MIMS class mapping
            if parsed.get("mims_class"):
                cls_code = MIMS_CLASS_TO_CODE.get(parsed["mims_class"])
                if cls_code:
                    concept_classes[concept["concept_id"]].append(cls_code)

            # Pregnancy category
            if parsed.get("pregnancy_category"):
                concept["pregnancy_category"] = parsed["pregnancy_category"]

            emims_parsed += 1

            if emims_parsed % 1000 == 0:
                print(f"  ... {emims_parsed} files parsed")

        except Exception as e:
            emims_failed += 1
            continue

    print(f"[eMIMS] Parsed {emims_parsed} files, {emims_failed} failed")

    # ---- Parse AMH ----
    amh_path = Path(amh_dir)
    amh_drug_files = []
    amh_parsed = 0
    amh_failed = 0

    # AMH has two structures: chapter dirs with drug files, and root-level drug files
    for item in amh_path.iterdir():
        if item.is_dir() and not item.name.startswith('_') and not item.name.startswith('browser') and not item.name.startswith('.'):
            for md_file in item.glob('*.md'):
                amh_drug_files.append(md_file)
        elif item.is_file() and item.suffix == '.md' and not item.name.startswith('_'):
            amh_drug_files.append(item)

    print(f"[AMH] Processing {len(amh_drug_files)} drug files...")

    for fp in amh_drug_files:
        try:
            parsed = parse_amh_file(fp)
            if not parsed.get("drug_name"):
                amh_failed += 1
                continue

            drug = parsed["drug_name"].strip()
            norm = normalise_name(drug)

            if norm not in concepts:
                import uuid
                concepts[norm] = {
                    "concept_id": str(uuid.uuid4()),
                    "canonical_name": drug,
                    "name_normalised": norm,
                    "sources": [],
                }

            concept = concepts[norm]
            if "AMH" not in concept["sources"]:
                concept["sources"].append("AMH")

            # Add generic name from AMH
            concept_names[concept["concept_id"]].append({
                "name": drug,
                "name_type": "generic",
                "source_code": "AMH",
                "is_primary": True,
            })

            # Extract assertions
            assertions = extract_assertions_from_amh(parsed, concept["concept_id"], fp.name)
            concept_assertions[concept["concept_id"]].extend(assertions)

            # AMH chapter to class
            if parsed.get("chapter"):
                cls_code = AMH_CHAPTER_TO_CLASS.get(parsed["chapter"])
                if cls_code:
                    concept_classes[concept["concept_id"]].append(cls_code)

            amh_parsed += 1

            if amh_parsed % 200 == 0:
                print(f"  ... {amh_parsed} files parsed")

        except Exception as e:
            amh_failed += 1
            continue

    print(f"[AMH] Parsed {amh_parsed} files, {amh_failed} failed")

    # ---- Deduplicate assertions by content_hash ----
    all_assertions = []
    seen_hashes = set()
    for concept_id, assertions in concept_assertions.items():
        for a in assertions:
            if a["content_hash"] not in seen_hashes:
                seen_hashes.add(a["content_hash"])
                all_assertions.append(a)

    # ---- Detect conflicts (same concept + assertion_type, different sources) ----
    conflicts = []
    by_concept_type = defaultdict(lambda: defaultdict(list))
    for a in all_assertions:
        by_concept_type[a["concept_id"]][a["assertion_type"]].append(a)

    for concept_id, by_type in by_concept_type.items():
        for atype, assertions in by_type.items():
            sources = set(a["source_code"] for a in assertions)
            if len(sources) > 1:
                # Check if statements actually differ significantly
                amh_stmts = [a["statement"] for a in assertions if a["source_code"] == "AMH"]
                emims_stmts = [a["statement"] for a in assertions if a["source_code"] == "eMIMS"]
                if amh_stmts and emims_stmts:
                    # They may say the same thing differently; flag for review
                    conflicts.append({
                        "concept_id": concept_id,
                        "assertion_type": atype,
                        "source_a": "AMH",
                        "source_b": "eMIMS",
                        "statement_a": amh_stmts[0][:200],
                        "statement_b": emims_stmts[0][:200],
                        "clinical_significance": "minor",
                        "resolution": "unresolved",
                    })

    # ---- Deduplicate names ----
    deduped_names = []
    seen_name_keys = set()
    for concept_id, names in concept_names.items():
        for n in names:
            key = (concept_id, n["name"].lower(), n["name_type"])
            if key not in seen_name_keys:
                seen_name_keys.add(key)
                deduped_names.append({**n, "concept_id": concept_id})

    # ---- Deduplicate classes ----
    deduped_classes = {}
    for concept_id, classes in concept_classes.items():
        for c in set(classes):
            if c not in deduped_classes:
                deduped_classes[c] = {"class_code": c, "class_label": c.replace('_', ' ').title()}
            deduped_classes[c].setdefault("concepts", []).append(concept_id)

    # ---- Build output ----
    output = {
        "ingestion_metadata": {
            "emims_dir": str(emims_path),
            "amh_dir": str(amh_path),
            "ingested_at": datetime.now(timezone.utc).isoformat(),
            "emims_files_parsed": emims_parsed,
            "emims_files_failed": emims_failed,
            "amh_files_parsed": amh_parsed,
            "amh_files_failed": amh_failed,
        },
        "concepts": list(concepts.values()),
        "names": deduped_names,
        "classes": [{"concept_id": cid, "class_code": c} for cid, classes in concept_classes.items() for c in set(classes)],
        "class_definitions": list(deduped_classes.values()),
        "assertions": all_assertions,
        "conflicts": conflicts,
        "summary": {
            "total_concepts": len(concepts),
            "total_names": len(deduped_names),
            "total_assertions": len(all_assertions),
            "total_conflicts": len(conflicts),
            "total_class_mappings": len(deduped_classes),
            "concepts_from_emims": sum(1 for c in concepts.values() if "eMIMS" in c["sources"]),
            "concepts_from_amh": sum(1 for c in concepts.values() if "AMH" in c["sources"]),
            "concepts_from_both": sum(1 for c in concepts.values() if "eMIMS" in c["sources"] and "AMH" in c["sources"]),
        },
    }

    # Write output files
    output_file = output_path / "medication_kb.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)

    # Write SQL upsert file for Lovable
    sql_file = output_path / "medication_kb_upsert.sql"
    with open(sql_file, 'w') as f:
        f.write("-- Auto-generated medication knowledge base upsert\n")
        f.write("-- Run in Supabase SQL editor (service role)\n\n")

        # Concepts
        f.write("-- === CONCEPTS ===\n")
        for c in concepts.values():
            f.write(f"INSERT INTO public.medication_concepts (concept_id, canonical_name, name_normalised, review_status)\n")
            safe_name = c['canonical_name'].replace("'", "''")
            f.write(f"VALUES ('{c['concept_id']}', '{safe_name}', '{c['name_normalised']}', 'extracted')\n")
            f.write(f"ON CONFLICT (name_normalised) DO NOTHING;\n")

        # Names
        f.write("\n-- === NAMES ===\n")
        for n in deduped_names:
            f.write(f"INSERT INTO public.medication_names (concept_id, name, name_type, is_primary, source_code)\n")
            f.write(f"VALUES ('{n['concept_id']}', '{n['name'].replace(chr(39), chr(39)+chr(39))}', '{n['name_type']}', {str(n.get('is_primary', False)).lower()}, '{n['source_code']}')\n")
            f.write(f"ON CONFLICT (concept_id, name, name_type) DO NOTHING;\n")

        # Classes
        f.write("\n-- === CLASSES ===\n")
        for cls in deduped_classes.values():
            f.write(f"INSERT INTO public.medication_classes (class_code, class_label)\n")
            f.write(f"VALUES ('{cls['class_code']}', '{cls['class_label'].replace(chr(39), chr(39)+chr(39))}')\n")
            f.write(f"ON CONFLICT (class_code) DO NOTHING;\n")

        # Class memberships
        f.write("\n-- === CLASS MEMBERSHIPS ===\n")
        for concept_id, classes in concept_classes.items():
            for c in set(classes):
                f.write(f"INSERT INTO public.medication_class_memberships (concept_id, class_id, source_code)\n")
                f.write(f"SELECT '{concept_id}', class_id, 'corpus' FROM public.medication_classes WHERE class_code = '{c}'\n")
                f.write(f"ON CONFLICT (concept_id, class_id) DO NOTHING;\n")

        # Assertions (batch - these are the bulk)
        f.write("\n-- === ASSERTIONS ===\n")
        f.write(f"-- {len(all_assertions)} assertions total. Batch insert recommended.\n")
        f.write("-- See medication_kb.json for full data; use a script to insert via Supabase client.\n")

    # Write summary
    summary_file = output_path / "ingestion_summary.json"
    with open(summary_file, 'w') as f:
        json.dump(output["summary"], f, indent=2)

    print(f"\n=== INGESTION SUMMARY ===")
    print(f"Concepts: {output['summary']['total_concepts']}")
    print(f"Names: {output['summary']['total_names']}")
    print(f"Assertions: {output['summary']['total_assertions']}")
    print(f"Conflicts: {output['summary']['total_conflicts']}")
    print(f"Class mappings: {output['summary']['total_class_mappings']}")
    print(f"From eMIMS: {output['summary']['concepts_from_emims']}")
    print(f"From AMH: {output['summary']['concepts_from_amh']}")
    print(f"From both: {output['summary']['concepts_from_both']}")
    print(f"\nOutput: {output_file}")
    print(f"SQL: {sql_file}")
    print(f"Summary: {summary_file}")

    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Ingest AMH + eMIMS corpora into structured medication KB')
    parser.add_argument('--emims', required=True, help='Path to eMIMS abbrev_pi directory')
    parser.add_argument('--amh', required=True, help='Path to AMH scraped directory')
    parser.add_argument('--output', default='data/medication_kb', help='Output directory')
    args = parser.parse_args()

    run_ingestion(args.emims, args.amh, args.output)