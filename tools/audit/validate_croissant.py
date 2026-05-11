"""Lightweight Croissant 1.0 metadata validator for Project-Utopia.

Checks structural conformance (NOT a full JSON-LD validator):

* Top-level required fields exist.
* ``@context`` includes the Croissant 1.0 vocab IRI.
* ``recordSet`` has at least 1 entry, each with field definitions.
* ``distribution`` has at least 6 FileObject entries (repo + pypi + hash
  manifest + 4 prompts + scenario blueprints = 8 expected at release).
* Every ``cr:Field`` and ``cr:FileObject`` has a unique ``@id`` (Croissant 1.0
  hard requirement).

Run::

    python tools/audit/validate_croissant.py [path/to/croissant.json]

Defaults to ``metadata/croissant.json`` relative to the repo root. Prints a
single ``PASS`` or ``FAIL`` line and exits with the appropriate status code.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

CROISSANT_VOCAB_IRI = "http://mlcommons.org/croissant/"
CROISSANT_CONFORMS_TO = "http://mlcommons.org/croissant/1.0"

REQUIRED_TOP_LEVEL = (
    "@context",
    "@type",
    "name",
    "description",
    "url",
    "license",
    "version",
    "datePublished",
    "citeAs",
    "keywords",
    "creator",
    "distribution",
    "recordSet",
)


def _fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def _check_unique_ids(label: str, items: list) -> list[str]:
    seen: dict[str, int] = {}
    problems: list[str] = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            problems.append(f"{label}[{i}] is not an object")
            continue
        rid = item.get("@id")
        if not isinstance(rid, str) or not rid:
            problems.append(f"{label}[{i}] missing @id")
            continue
        if rid in seen:
            problems.append(f"{label} duplicate @id={rid!r} (first at index {seen[rid]})")
        else:
            seen[rid] = i
    return problems


def validate(path: Path) -> None:
    if not path.exists():
        _fail(f"file not found: {path}")
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        _fail(f"invalid JSON: {exc}")

    if not isinstance(doc, dict):
        _fail("top-level value must be a JSON object")

    missing = [f for f in REQUIRED_TOP_LEVEL if f not in doc]
    if missing:
        _fail(f"missing top-level fields: {missing}")

    ctx = doc["@context"]
    if not isinstance(ctx, dict):
        _fail("@context must be an object")
    # Look for the Croissant vocab IRI in any context value.
    ctx_values = {v for v in ctx.values() if isinstance(v, str)}
    if not any(CROISSANT_VOCAB_IRI in v for v in ctx_values):
        _fail(
            "@context must reference the Croissant 1.0 vocab IRI "
            f"({CROISSANT_VOCAB_IRI})"
        )

    conforms_to = doc.get("conformsTo")
    if conforms_to != CROISSANT_CONFORMS_TO:
        _fail(
            f"conformsTo must equal {CROISSANT_CONFORMS_TO!r}; got {conforms_to!r}"
        )

    if doc.get("@type") != "sc:Dataset":
        _fail(f"@type must be 'sc:Dataset'; got {doc.get('@type')!r}")

    distribution = doc["distribution"]
    if not isinstance(distribution, list) or len(distribution) < 6:
        _fail(
            "distribution must be an array with >= 6 FileObject entries "
            f"(got {len(distribution) if isinstance(distribution, list) else 'non-list'})"
        )
    dist_problems = _check_unique_ids("distribution", distribution)
    if dist_problems:
        _fail("; ".join(dist_problems))

    record_set = doc["recordSet"]
    if not isinstance(record_set, list) or len(record_set) < 1:
        _fail("recordSet must be an array with >= 1 entry")
    rs_problems = _check_unique_ids("recordSet", record_set)
    if rs_problems:
        _fail("; ".join(rs_problems))

    for rs in record_set:
        fields = rs.get("field")
        if not isinstance(fields, list) or not fields:
            _fail(f"recordSet @id={rs.get('@id')!r} must declare a non-empty 'field' array")
        f_problems = _check_unique_ids(f"recordSet[{rs.get('@id')!r}].field", fields)
        if f_problems:
            _fail("; ".join(f_problems))
        for fld in fields:
            if "dataType" not in fld:
                _fail(
                    f"field @id={fld.get('@id')!r} in recordSet "
                    f"@id={rs.get('@id')!r} missing dataType"
                )

    keywords = doc.get("keywords")
    if not isinstance(keywords, list) or not keywords:
        _fail("keywords must be a non-empty array")

    print(
        f"PASS: {path.name} "
        f"(distribution={len(distribution)}, "
        f"recordSet={len(record_set)}, "
        f"fields={sum(len(rs.get('field', [])) for rs in record_set)})"
    )


def main() -> None:
    if len(sys.argv) >= 2:
        target = Path(sys.argv[1])
    else:
        # Default: repo-root-relative metadata/croissant.json.
        repo_root = Path(__file__).resolve().parents[2]
        target = repo_root / "metadata" / "croissant.json"
    validate(target)


if __name__ == "__main__":
    main()
