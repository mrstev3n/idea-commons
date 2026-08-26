#!/usr/bin/env python3
"""Explicit live-only runner for the bounded source collection proof-of-concept."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from collector import CollectionError, USER_AGENT, diagnostics, fetch_bounded, normalize


ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "editorial" / "sources" / "catalogue.json"
OUTPUT_DIR = ROOT / ".local" / "source-collection-research"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the explicit, sequential Idea Commons live source probe.")
    parser.add_argument("--live", action="store_true", help="Required confirmation that network access is intended.")
    parser.add_argument("--output", default="latest-probe.json", help="Filename under .local/source-collection-research only.")
    args = parser.parse_args()
    if not args.live:
        parser.error("network is disabled by default; pass --live explicitly")
    if Path(args.output).name != args.output or not args.output.endswith(".json"):
        parser.error("--output must be one JSON filename without directories")

    catalogue = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    selected = [
        source for source in catalogue["sources"]
        if source["endpoint"]["testStatus"] in {"planned", "live_success", "live_error"}
        and source["endpoint"]["parser"] is not None
    ]
    started = datetime.now(timezone.utc)
    results = []

    for source in selected:
        endpoint = source["endpoint"]["url"]
        host = urlsplit(endpoint).hostname
        record = {
            "sourceId": source["id"], "endpoint": endpoint, "httpSuccess": False,
            "syntaxValid": False, "normalizationSuccess": False, "contentType": None,
            "responseBytes": 0, "finalUrl": None, "diagnostics": None, "items": [], "error": None,
        }
        try:
            response = fetch_bounded(endpoint, {host})
            record["httpSuccess"] = 200 <= response.status < 300
            record["httpStatus"] = response.status
            record["contentType"] = response.content_type
            record["responseBytes"] = len(response.body)
            record["finalUrl"] = response.final_url
            if not record["httpSuccess"]:
                raise CollectionError(f"http_{response.status}")
            items = normalize(source["id"], source["endpoint"]["parser"], response.body)
            record["syntaxValid"] = True
            record["normalizationSuccess"] = True
            record["items"] = items[:3]
            record["diagnostics"] = diagnostics(record["items"])
        except CollectionError as error:
            record["error"] = str(error)
        except Exception as error:  # Defensive boundary: never serialize remote bodies or stack traces.
            record["error"] = f"unexpected_{type(error).__name__.lower()}"
        results.append(record)

    finished = datetime.now(timezone.utc)
    all_item_keys = [
        item.get("url") or item.get("identifier")
        for record in results
        for item in record["items"]
        if item.get("url") or item.get("identifier")
    ]
    report = {
        "schemaVersion": "1.0.0",
        "mode": "explicit_live",
        "startedAt": started.isoformat().replace("+00:00", "Z"),
        "finishedAt": finished.isoformat().replace("+00:00", "Z"),
        "userAgent": USER_AGENT,
        "limits": {"sequential": True, "timeoutSeconds": 6, "maxResponseBytes": 786432, "maxItemsPerSource": 3},
        "summary": {
            "sourcesAttempted": len(results),
            "httpSuccesses": sum(record["httpSuccess"] for record in results),
            "syntaxValid": sum(record["syntaxValid"] for record in results),
            "normalized": sum(record["normalizationSuccess"] for record in results),
            "duplicates": sum((record["diagnostics"] or {}).get("duplicates", 0) for record in results),
            "globalDuplicates": len(all_item_keys) - len(set(all_item_keys)),
            "missingDates": sum((record["diagnostics"] or {}).get("missingDates", 0) for record in results),
            "errors": sum(record["error"] is not None for record in results),
        },
        "results": results,
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT_DIR / args.output
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(destination), **report["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
