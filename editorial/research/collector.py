"""Bounded metadata collector for the local Idea Commons research proof-of-concept.

This module has no automatic network entry point. Tests import only its parsers and
normalizers. The separate probe_sources.py script requires an explicit --live flag.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


MAX_ITEMS = 3
MAX_EXCERPT_CHARS = 280
MAX_RESPONSE_BYTES = 768 * 1024
TIMEOUT_SECONDS = 6
USER_AGENT = "IdeaCommonsSourceProbe/0.1 (+https://github.com/mrstev3n/idea-commons; bounded-local-research)"


class CollectionError(RuntimeError):
    """Normalized, non-sensitive collection error."""


@dataclass(frozen=True)
class FetchResult:
    status: int
    content_type: str
    body: bytes
    final_url: str


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _fetch_once(url: str, allowed_hosts: set[str]) -> FetchResult:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
        raise CollectionError("endpoint_not_allowlisted")

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9",
        },
        method="GET",
    )
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.getcode()
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            body = response.read(MAX_RESPONSE_BYTES + 1)
            if len(body) > MAX_RESPONSE_BYTES:
                raise CollectionError("response_too_large")
            return FetchResult(status=status, content_type=content_type, body=body, final_url=response.geturl())
    except urllib.error.HTTPError as error:
        if 300 <= error.code < 400:
            location = error.headers.get("Location")
            if not location:
                raise CollectionError(f"http_{error.code}_without_location") from error
            redirected = urllib.parse.urljoin(url, location)
            redirected_parts = urllib.parse.urlsplit(redirected)
            if redirected_parts.scheme != "https" or redirected_parts.hostname not in allowed_hosts:
                raise CollectionError("redirect_not_allowlisted") from error
            return FetchResult(status=error.code, content_type="redirect", body=b"", final_url=redirected)
        raise CollectionError(f"http_{error.code}") from error
    except urllib.error.URLError as error:
        reason = type(error.reason).__name__.lower()
        raise CollectionError(f"network_{reason}") from error


def fetch_bounded(url: str, allowed_hosts: set[str], max_redirects: int = 2) -> FetchResult:
    current = url
    for redirect_count in range(max_redirects + 1):
        result = _fetch_once(current, allowed_hosts)
        if result.content_type != "redirect":
            return result
        if redirect_count == max_redirects:
            raise CollectionError("too_many_redirects")
        current = result.final_url
    raise CollectionError("too_many_redirects")


def _clean(value: Any, limit: int | None = None) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        value = "; ".join(str(part) for part in value if part is not None)
    text = re.sub(r"\s+", " ", html.unescape(str(value))).strip()
    if not text:
        return None
    if limit is not None and len(text) > limit:
        return text[: limit - 1].rstrip() + "…"
    return text


def _clean_excerpt(value: Any) -> str | None:
    if value is None:
        return None
    without_markup = re.sub(r"<[^>]+>", " ", str(value))
    return _clean(without_markup, MAX_EXCERPT_CHARS)


def _iso_date(value: Any) -> str | None:
    text = _clean(value)
    if not text:
        return None
    if re.fullmatch(r"\d{4}", text):
        return text
    if re.fullmatch(r"\d{4}-\d{2}", text):
        return text
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.isoformat()
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        pass
    for pattern in ("%a, %d %b %Y %H:%M:%S %z", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(text, pattern)
            if parsed.tzinfo:
                return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            return parsed.date().isoformat()
        except ValueError:
            continue
    return None


def canonicalize_url(value: Any) -> str | None:
    text = _clean(value)
    if not text:
        return None
    parsed = urllib.parse.urlsplit(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    filtered = [(key, item) for key, item in query if not key.lower().startswith("utm_")]
    return urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or "/", urllib.parse.urlencode(filtered), ""))


def _identifier(source_id: str, title: str | None, url: str | None, supplied: Any = None) -> str:
    explicit = _clean(supplied)
    if explicit:
        return explicit
    digest = hashlib.sha256(f"{source_id}\n{url or ''}\n{title or ''}".encode("utf-8")).hexdigest()[:20]
    return f"{source_id}:{digest}"


def item(source_id: str, *, title: Any, url: Any = None, date: Any = None, author: Any = None,
         summary: Any = None, categories: Any = None, identifier: Any = None) -> dict[str, Any]:
    clean_title = _clean(title, 240)
    clean_url = canonicalize_url(url)
    clean_categories = categories if isinstance(categories, list) else ([] if categories is None else [categories])
    return {
        "sourceId": source_id,
        "identifier": _identifier(source_id, clean_title, clean_url, identifier),
        "title": clean_title,
        "url": clean_url,
        "date": _iso_date(date),
        "author": _clean(author, 180),
        "summary": _clean_excerpt(summary),
        "categories": [category for value in clean_categories if (category := _clean(value, 80))],
    }


def _require_json(body: bytes) -> Any:
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CollectionError("invalid_json") from error


def _require_xml(body: bytes) -> ET.Element:
    head = body[:2048].upper()
    if b"<!DOCTYPE" in head or b"<!ENTITY" in head:
        raise CollectionError("xml_dtd_or_entity_rejected")
    try:
        return ET.fromstring(body)
    except ET.ParseError as error:
        raise CollectionError("invalid_xml") from error


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(element: ET.Element, names: set[str]) -> str | None:
    for child in element.iter():
        if child is element:
            continue
        if _local(child.tag) in names:
            value = _clean(child.text)
            if value:
                return value
    return None


def normalize_xml_feed(source_id: str, body: bytes) -> list[dict[str, Any]]:
    root = _require_xml(body)
    entries = [node for node in root.iter() if _local(node.tag) in {"item", "entry"}]
    normalized = []
    for entry in entries[:MAX_ITEMS]:
        link = None
        for node in entry.iter():
            if _local(node.tag) == "link":
                link = node.attrib.get("href") or node.text
                if link:
                    break
        categories = [node.attrib.get("term") or node.text for node in entry.iter() if _local(node.tag) == "category"]
        normalized.append(item(
            source_id,
            title=_child_text(entry, {"title"}),
            url=link,
            date=_child_text(entry, {"pubdate", "published", "updated", "date"}),
            author=_child_text(entry, {"author", "creator", "name"}),
            summary=_child_text(entry, {"description", "summary"}),
            categories=categories,
            identifier=_child_text(entry, {"guid", "id", "identifier"}),
        ))
    return normalized


def normalize_bnf_oai(source_id: str, body: bytes) -> list[dict[str, Any]]:
    root = _require_xml(body)
    title = _child_text(root, {"title"})
    identifiers = [node.text for node in root.iter() if _local(node.tag) == "identifier" and node.text]
    canonical = next((value for value in identifiers if value.startswith("https://gallica.bnf.fr/ark:/")), None)
    creators = [node.text for node in root.iter() if _local(node.tag) in {"creator", "contributor"} and node.text]
    subjects = [node.text for node in root.iter() if _local(node.tag) in {"subject", "type"} and node.text]
    return [item(source_id, title=title, url=canonical, author=creators, categories=subjects,
                 identifier=canonical or (identifiers[0] if identifiers else None))]


def normalize_json(source_id: str, parser: str, body: bytes) -> list[dict[str, Any]]:
    data = _require_json(body)
    if parser == "world_bank":
        rows = data[1] if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list) else []
        return [item(source_id, title=" — ".join(filter(None, [row.get('indicator', {}).get('value'), row.get('country', {}).get('value')])),
                     date=row.get("date"), summary=row.get("value"),
                     identifier=f"{row.get('countryiso3code')}:{row.get('indicator', {}).get('id')}:{row.get('date')}") for row in rows[:MAX_ITEMS]]
    if parser == "who_odata":
        rows = data.get("value", []) if isinstance(data, dict) else []
        return [item(source_id, title=row.get("IndicatorName"), identifier=row.get("IndicatorCode")) for row in rows[:MAX_ITEMS]]
    if parser == "crossref":
        rows = data.get("message", {}).get("items", []) if isinstance(data, dict) else []
        normalized = []
        for row in rows[:MAX_ITEMS]:
            authors = [" ".join(filter(None, [author.get("given"), author.get("family")])) for author in row.get("author", [])]
            date_parts = row.get("published", {}).get("date-parts", [[]])
            parts = date_parts[0] if date_parts else []
            date_value = "-".join(str(part) if index == 0 else f"{int(part):02d}" for index, part in enumerate(parts))
            normalized.append(item(source_id, title=row.get("title"), url=row.get("URL"), date=date_value,
                                   author=authors, identifier=row.get("DOI")))
        return normalized
    if parser == "europe_pmc":
        rows = data.get("resultList", {}).get("result", []) if isinstance(data, dict) else []
        return [item(source_id, title=row.get("title"), date=row.get("firstPublicationDate") or row.get("pubYear"),
                     author=row.get("authorString"), identifier=f"{row.get('source')}:{row.get('id')}",
                     categories=row.get("pubType")) for row in rows[:MAX_ITEMS]]
    if parser == "reliefweb":
        rows = data.get("data", []) if isinstance(data, dict) else []
        return [item(source_id, title=row.get("fields", {}).get("title"), url=row.get("href"),
                     date=row.get("fields", {}).get("date", {}).get("created"),
                     categories=[country.get("name") for country in row.get("fields", {}).get("country", [])],
                     identifier=row.get("id")) for row in rows[:MAX_ITEMS]]
    if parser == "eonet":
        rows = data.get("events", []) if isinstance(data, dict) else []
        normalized = []
        for row in rows[:MAX_ITEMS]:
            geometries = row.get("geometry", [])
            date_value = geometries[-1].get("date") if geometries else row.get("closed")
            normalized.append(item(source_id, title=row.get("title"), url=row.get("link"), date=date_value,
                                   summary=row.get("description"), categories=[value.get("title") for value in row.get("categories", [])],
                                   identifier=row.get("id")))
        return normalized
    if parser == "usgs_geojson":
        rows = data.get("features", []) if isinstance(data, dict) else []
        return [item(source_id, title=row.get("properties", {}).get("title"), url=row.get("properties", {}).get("url"),
                     date=datetime.fromtimestamp(row.get("properties", {}).get("time") / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z") if row.get("properties", {}).get("time") else None,
                     categories=[row.get("properties", {}).get("type")], identifier=row.get("id")) for row in rows[:MAX_ITEMS]]
    raise CollectionError("unknown_parser")


def normalize(source_id: str, parser: str, body: bytes) -> list[dict[str, Any]]:
    if parser in {"rss", "atom"}:
        return normalize_xml_feed(source_id, body)
    if parser == "bnf_oai":
        return normalize_bnf_oai(source_id, body)
    return normalize_json(source_id, parser, body)


def diagnostics(items: list[dict[str, Any]]) -> dict[str, int]:
    keys = [value.get("url") or value.get("identifier") for value in items]
    duplicates = len(keys) - len(set(keys))
    return {
        "normalizedItems": len(items),
        "duplicates": duplicates,
        "missingDates": sum(value.get("date") is None for value in items),
        "missingTitles": sum(value.get("title") is None for value in items),
    }
