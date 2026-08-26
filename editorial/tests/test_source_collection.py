"""Deterministic, offline contract tests for the source-collection proof-of-concept."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / "editorial" / "research"
FIXTURES = RESEARCH / "fixtures"

SPEC = importlib.util.spec_from_file_location("source_collector", RESEARCH / "collector.py")
collector = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = collector
SPEC.loader.exec_module(collector)

SNAPSHOT_SPEC = importlib.util.spec_from_file_location("snapshot_import", RESEARCH / "snapshot_import.py")
snapshot_import = importlib.util.module_from_spec(SNAPSHOT_SPEC)
assert SNAPSHOT_SPEC.loader is not None
sys.modules[SNAPSHOT_SPEC.name] = snapshot_import
SNAPSHOT_SPEC.loader.exec_module(snapshot_import)


class CatalogueContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalogue = json.loads((ROOT / "editorial" / "sources" / "catalogue.json").read_text(encoding="utf-8"))

    def test_catalogue_is_extensible_and_unique(self) -> None:
        sources = self.catalogue["sources"]
        self.assertGreaterEqual(len(sources), 15)
        self.assertEqual(len({source["id"] for source in sources}), len(sources))

    def test_live_selection_is_bounded_and_explicit(self) -> None:
        active = [source for source in self.catalogue["sources"] if source["endpoint"]["testStatus"] in {"planned", "live_success", "live_error"}]
        self.assertGreaterEqual(len(active), 5)
        self.assertLessEqual(len(active), 10)
        for source in active:
            self.assertTrue(source["endpoint"]["url"].startswith("https://"))
            self.assertIsNotNone(source["endpoint"]["parser"])
        self.assertEqual(self.catalogue["collectorPolicy"]["networkMode"], "explicit_live_only")
        self.assertFalse(self.catalogue["collectorPolicy"]["retainFullText"])

    def test_unknown_rights_never_become_permissions(self) -> None:
        for source in self.catalogue["sources"]:
            for field in source["rights"].values():
                if field["status"] in {"not_found", "not_checked"}:
                    self.assertIsNone(field["value"])

    def test_each_source_has_evidence_and_a_revisable_recommendation(self) -> None:
        allowed = {"m1_candidate", "observation", "not_selected_for_current_probe", "insufficient_information"}
        for source in self.catalogue["sources"]:
            self.assertTrue(source["consultedUrls"])
            self.assertIn(source["qualificationRecommendation"], allowed)
            self.assertTrue(source["access"]["observation"])

    def test_user_discovery_leads_are_extensible_and_linked(self) -> None:
        leads = json.loads((ROOT / "editorial" / "sources" / "discovery-leads.json").read_text(encoding="utf-8"))
        entries = leads["entries"]
        self.assertGreaterEqual(len(entries), 40)
        self.assertEqual(len({entry["id"] for entry in entries}), len(entries))
        catalogue_ids = {source["id"] for source in self.catalogue["sources"]}
        for entry in entries:
            if entry["qualification"] == "qualified_catalogue":
                self.assertIn(entry["catalogueId"], catalogue_ids)
        reddit = [entry for entry in entries if entry["id"].startswith("reddit-")]
        self.assertGreaterEqual(len(reddit), 20)
        self.assertTrue(all(entry["priority"] == "user_priority" for entry in reddit))

    def test_user_requested_source_extension_is_qualified(self) -> None:
        required = {"yelp-places", "google-news", "yahoo-finance", "axios-media", "reuters-media", "guardian-open-platform"}
        catalogue_ids = {source["id"] for source in self.catalogue["sources"]}
        self.assertTrue(required.issubset(catalogue_ids))
        leads = json.loads((ROOT / "editorial" / "sources" / "discovery-leads.json").read_text(encoding="utf-8"))
        linked = {entry["catalogueId"] for entry in leads["entries"] if entry["qualification"] == "qualified_catalogue"}
        self.assertTrue(required.issubset(linked))


class SourceToIdeaCaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.document = json.loads((ROOT / "editorial" / "sources" / "source-to-idea-cases.json").read_text(encoding="utf-8"))

    @staticmethod
    def resolve_pointer(document: object, pointer: str) -> object:
        current = document
        for raw_part in pointer.lstrip("/").split("/"):
            part = raw_part.replace("~1", "/").replace("~0", "~")
            current = current[int(part)] if isinstance(current, list) else current[part]
        return current

    def test_case_count_scores_and_claim_types(self) -> None:
        cases = self.document["cases"]
        self.assertGreaterEqual(len(cases), 6)
        self.assertLessEqual(len(cases), 10)
        all_types = set()
        for case in cases:
            review = case["editorialReview"]
            self.assertEqual(review["total"], sum(review[key] for key in ("evidenceStrength", "userNeedSignal", "novelty", "feasibility", "responsibility")))
            self.assertEqual(case["publicationState"], "human_review_required")
            all_types.update(claim["type"] for claim in case["claims"])
        self.assertTrue({"fact", "source_observation", "hypothesis", "estimate", "recommendation", "validation_question"}.issubset(all_types))
        provenance = self.document["provenanceDisplayContract"]
        self.assertTrue(provenance["showOriginBeforeInterpretation"])
        self.assertTrue(provenance["marketClaimsRequireIndependentCitations"])
        self.assertEqual(provenance["derivedSectionLabel"], "Analyse et hypothèses Idea Commons")

    def test_every_evidence_pointer_resolves_and_claims_are_traceable(self) -> None:
        for case in self.document["cases"]:
            evidence_ids = {entry["id"] for entry in case["evidence"]}
            self.assertEqual(len(evidence_ids), len(case["evidence"]))
            for entry in case["evidence"]:
                fixture = json.loads((ROOT / entry["fixtureFile"]).read_text(encoding="utf-8"))
                resolved = self.resolve_pointer(fixture, entry["fixturePointer"])
                self.assertEqual(entry["collectedIdentifier"], resolved.get("identifier") or resolved.get("id"))
            for claim in case["claims"]:
                self.assertTrue(set(claim["citationIds"]).issubset(evidence_ids))
                if claim["type"] in {"fact", "source_observation", "estimate"}:
                    self.assertTrue(claim["citationIds"])
            for angle in case["interpretationAngles"]:
                self.assertEqual(angle["type"], "hypothesis")
            self.assertEqual(case["problemOrOpportunity"]["type"], "hypothesis")


class NormalizationTests(unittest.TestCase):
    def fixture(self, name: str) -> bytes:
        return (FIXTURES / name).read_bytes()

    def test_rss_limit_canonicalization_and_diagnostics(self) -> None:
        items = collector.normalize("synthetic-rss", "rss", self.fixture("rss.xml"))
        self.assertEqual(len(items), 3)
        self.assertNotIn("utm_", items[0]["url"])
        self.assertNotIn("<p>", items[0]["summary"])
        self.assertLessEqual(len(items[0]["summary"]), collector.MAX_EXCERPT_CHARS)
        self.assertEqual(collector.diagnostics(items), {
            "normalizedItems": 3, "duplicates": 1, "missingDates": 1, "missingTitles": 0,
        })

    def test_atom_preserves_partial_date_and_nested_author(self) -> None:
        items = collector.normalize("synthetic-atom", "atom", self.fixture("atom.xml"))
        self.assertEqual(items[0]["date"], "2026-08")
        self.assertEqual(items[0]["author"], "Ada Exemple")
        self.assertEqual(items[0]["summary"], "Résumé synthétique.")

    def test_json_normalizers_preserve_source_precision(self) -> None:
        wb = collector.normalize("synthetic-wb", "world_bank", self.fixture("world-bank.json"))
        crossref = collector.normalize("synthetic-crossref", "crossref", self.fixture("crossref.json"))
        self.assertEqual(wb[0]["date"], "2025")
        self.assertEqual(wb[0]["summary"], "42")
        self.assertEqual(crossref[0]["date"], "2026-08-04")
        self.assertEqual(crossref[1]["date"], "2025")
        self.assertEqual(crossref[0]["author"], "Awa Exemple")

    def test_bnf_notice_only(self) -> None:
        items = collector.normalize("synthetic-bnf", "bnf_oai", self.fixture("bnf-oai.xml"))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "Notice culturelle synthétique")
        self.assertTrue(items[0]["url"].startswith("https://gallica.bnf.fr/ark:/"))
        self.assertIsNone(items[0]["summary"])

    def test_invalid_or_unsafe_payloads_are_rejected(self) -> None:
        with self.assertRaisesRegex(collector.CollectionError, "invalid_json"):
            collector.normalize("bad", "crossref", b"not-json")
        with self.assertRaisesRegex(collector.CollectionError, "invalid_xml"):
            collector.normalize("bad", "rss", b"<rss>")
        with self.assertRaisesRegex(collector.CollectionError, "xml_dtd_or_entity_rejected"):
            collector.normalize("bad", "rss", b'<!DOCTYPE x [<!ENTITY y "z">]><rss/>')

    def test_live_probe_is_disabled_by_default(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(RESEARCH / "probe_sources.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("network is disabled by default", completed.stderr)

    def test_conversation_snapshot_is_offline_minimized_and_non_factual(self) -> None:
        payload = json.loads((FIXTURES / "conversation-snapshot.json").read_text(encoding="utf-8"))
        normalized = snapshot_import.normalize_snapshot(payload)
        self.assertTrue(normalized["synthetic"])
        self.assertFalse(normalized["profileDataRetained"])
        self.assertTrue(all(item["claimClass"] == "user_reported_signal" for item in normalized["items"]))
        self.assertNotIn("author", json.dumps(normalized))

    def test_social_post_snapshot_uses_the_same_offline_contract(self) -> None:
        payload = json.loads((FIXTURES / "social-post-snapshot.json").read_text(encoding="utf-8"))
        normalized = snapshot_import.normalize_snapshot(payload)
        self.assertTrue(normalized["synthetic"])
        self.assertEqual([item["kind"] for item in normalized["items"]], ["post", "comment"])
        self.assertTrue(all(item["claimClass"] == "user_reported_signal" for item in normalized["items"]))

    def test_conversation_snapshot_rejects_profiles_and_duplicate_ids(self) -> None:
        payload = json.loads((FIXTURES / "conversation-snapshot.json").read_text(encoding="utf-8"))
        payload["containsProfiles"] = True
        with self.assertRaisesRegex(snapshot_import.SnapshotError, "profiles_not_allowed"):
            snapshot_import.normalize_snapshot(payload)
        payload["containsProfiles"] = False
        payload["items"][1]["id"] = payload["items"][0]["id"]
        with self.assertRaisesRegex(snapshot_import.SnapshotError, "duplicate_item_id"):
            snapshot_import.normalize_snapshot(payload)


if __name__ == "__main__":
    unittest.main()
