#!/usr/bin/env python3
"""Offline-only import contract for manually supplied conversation snapshots.

The CLI accepts only JSON files placed under the ignored local research import
directory. It performs no browser or network access and never accepts profile data.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
IMPORT_DIR = ROOT / ".local" / "source-collection-research" / "imports"
OUTPUT_DIR = ROOT / ".local" / "source-collection-research"
ALLOWED_METHODS = {"manual_browser_export", "authorized_platform_export", "synthetic_fixture"}
ALLOWED_KINDS = {"topic", "question", "answer", "comment", "post"}
MAX_ITEMS = 40
MAX_TEXT_CHARS = 1000


class SnapshotError(ValueError):
    """Safe validation error for an offline snapshot."""


def _clean(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    if not text:
        raise SnapshotError("empty_text")
    if len(text) > limit:
        raise SnapshotError("value_too_long")
    return text


def normalize_snapshot(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != "1.0.0":
        raise SnapshotError("unsupported_schema")
    if payload.get("rightsBasis") != "temporary_analysis":
        raise SnapshotError("temporary_analysis_required")
    if payload.get("containsProfiles") is not False:
        raise SnapshotError("profiles_not_allowed")
    if payload.get("captureMethod") not in ALLOWED_METHODS:
        raise SnapshotError("unsupported_capture_method")
    items = payload.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= MAX_ITEMS:
        raise SnapshotError("invalid_item_count")

    identifiers: set[str] = set()
    normalized = []
    for raw in items:
        if not isinstance(raw, dict) or set(raw) != {"id", "kind", "text", "parentId", "locator"}:
            raise SnapshotError("invalid_item_shape")
        identifier = _clean(raw["id"], 120)
        if identifier in identifiers:
            raise SnapshotError("duplicate_item_id")
        identifiers.add(identifier)
        if raw["kind"] not in ALLOWED_KINDS:
            raise SnapshotError("invalid_item_kind")
        parent_id = raw["parentId"]
        if parent_id is not None and parent_id not in identifiers:
            raise SnapshotError("parent_must_precede_child")
        normalized.append({
            "id": identifier,
            "kind": raw["kind"],
            "statement": _clean(raw["text"], MAX_TEXT_CHARS),
            "parentId": parent_id,
            "locator": _clean(raw["locator"], 240),
            "claimClass": "user_reported_signal",
        })

    return {
        "schemaVersion": "1.0.0",
        "sourceId": _clean(payload.get("sourceId"), 120),
        "sourceUrl": _clean(payload.get("sourceUrl"), 2048),
        "capturedAt": _clean(payload.get("capturedAt"), 80),
        "captureMethod": payload["captureMethod"],
        "rightsBasis": "temporary_analysis",
        "synthetic": payload.get("synthetic") is True,
        "profileDataRetained": False,
        "items": normalized,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize an offline conversation snapshot under the local research directory only.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="latest-snapshot-import.json")
    parser.add_argument("--acknowledge-temporary-analysis", action="store_true")
    args = parser.parse_args()
    if not args.acknowledge_temporary_analysis:
        parser.error("--acknowledge-temporary-analysis is required")
    source = Path(args.input).resolve()
    imports = IMPORT_DIR.resolve()
    if source.parent != imports or source.suffix != ".json":
        parser.error("--input must be one JSON file directly under .local/source-collection-research/imports")
    if Path(args.output).name != args.output or not args.output.endswith(".json"):
        parser.error("--output must be one JSON filename without directories")

    try:
        normalized = normalize_snapshot(json.loads(source.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, SnapshotError) as error:
        parser.error(str(error))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT_DIR / args.output
    destination.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(destination), "items": len(normalized["items"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
