import copy
import concurrent.futures
import json
import plistlib
import sqlite3
import ssl
import tempfile
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch
from trackapp.protocol import InvalidBatch, parse_batch
from trackapp.server import App
from trackapp.store import Store


def point(timestamp="2026-10-06T09:00:00Z", device="iPhone", lon=114.16, lat=22.28):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"timestamp": timestamp, "device_id": device,
                           "horizontal_accuracy": 8, "motion": ["walking"]}}


def batch(*points, **extra):
    return json.dumps({"locations": list(points), **extra}).encode()


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "track.sqlite3")

    def tearDown(self):
        self.tmp.cleanup()

    def test_retry_rebatch_and_reopen_keep_one_point(self):
        feature = point()
        feature["properties"]["locations_in_payload"] = 200
        self.assertEqual(self.store.ingest(batch(feature)), 1)
        feature["properties"]["locations_in_payload"] = 50
        self.assertEqual(self.store.ingest(batch(feature)), 0)
        reopened = Store(self.store.path)
        self.assertEqual(reopened.overview()["count"], 1)
        with reopened.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM batches").fetchone()[0], 2)
            self.assertEqual(json.loads(db.execute("SELECT raw FROM events").fetchone()[0])["properties"]["locations_in_payload"], 200)

    def test_invalid_mixed_batch_saves_nothing(self):
        bad = point(lon=181)
        with self.assertRaises(InvalidBatch):
            self.store.ingest(batch(point(), bad))
        self.assertEqual(self.store.overview()["count"], 0)
        self.assertEqual(self.store.overview()["batches"], 0)

    def test_database_failure_mid_batch_rolls_back_everything(self):
        with self.store.connect() as db:
            db.execute("""CREATE TRIGGER fail_insert BEFORE INSERT ON events
                WHEN NEW.lon > 114.2 BEGIN SELECT RAISE(ABORT, 'write failed'); END""")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.ingest(batch(point(), point(lon=114.21)))
        self.assertEqual(self.store.overview()["count"], 0)
        self.assertEqual(self.store.overview()["batches"], 0)

    def test_hong_kong_dates_and_late_upload(self):
        self.store.ingest(batch(point("2026-10-05T16:05:00Z"), point("2026-10-05T15:55:00Z")))
        overview = self.store.overview()
        self.assertEqual([day["day"] for day in overview["days"]], ["2026-10-06", "2026-10-05"])
        self.assertEqual(len(self.store.points(day="2026-10-05")["points"]), 1)

    def test_device_filter_snapshot_pagination(self):
        self.store.ingest(batch(point(device="A"), point(device="B"), point("2026-10-06T09:01:00Z", "A")))
        snapshot = self.store.overview()["max_id"]
        first = self.store.points(device="A", through=snapshot, limit=1)
        self.assertTrue(first["more"])
        self.store.ingest(batch(point("2026-10-06T09:02:00Z", "A")))
        second = self.store.points(device="A", through=snapshot, after=first["after"], limit=1)
        self.assertFalse(second["more"])
        self.assertEqual(first["points"][0]["device"], "A")
        self.assertNotEqual(first["points"][0]["id"], second["points"][0]["id"])

    def test_parallel_retries_are_idempotent(self):
        payload = batch(point())
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            added = list(pool.map(self.store.ingest, [payload]*16))
        self.assertEqual(sum(added), 1)
        self.assertEqual(self.store.overview()["count"], 1)

    def test_null_geometry_metadata_and_optional_telemetry_are_preserved(self):
        metadata = {"type":"Feature", "geometry":None, "properties":{"action":"paused"}}
        payload = batch(point(), metadata, current=point(), trip={"mode":"walk", "distance":20})
        self.store.ingest(payload)
        self.assertEqual(self.store.overview()["count"], 1)
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM events").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT raw FROM batches").fetchone()[0], payload)

    def test_backup_is_consistent_and_notes_survive(self):
        self.store.ingest(batch(point()))
        self.store.note("2026-10-06", '<script>"hello"</script>')
        destination = Path(self.tmp.name) / "backup.sqlite3"
        self.store.backup(destination)
        backup = Store(destination)
        self.assertEqual(backup.overview()["notes"]["2026-10-06"], '<script>"hello"</script>')
        self.assertEqual(backup.overview()["count"], 1)
        with backup.connect() as db:
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")

    def test_strict_timestamp_and_non_finite_validation(self):
        for feature in (point("2026-10-06T09:00:00"), point(lon=True)):
            with self.assertRaises(InvalidBatch): parse_batch(batch(feature))
        with self.assertRaises(InvalidBatch): parse_batch(b'{"locations": [], "number":NaN}')


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.app = App(cls.tmp.name, "127.0.0.1", 0, 0, 0).start()
        cls.ssl = ssl.create_default_context(cafile=str(Path(cls.tmp.name) / "ca.pem"))
        cls.ingest = f"https://127.0.0.1:{cls.app.ingest_port}/api/overland"
        cls.trust = f"http://127.0.0.1:{cls.app.trust_port}"

    @classmethod
    def tearDownClass(cls):
        cls.app.close()
        cls.tmp.cleanup()

    def request(self, url, data=None, headers=None):
        request = urllib.request.Request(url, data=data, headers=headers or {})
        try:
            response = urllib.request.urlopen(request, context=self.ssl, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.read(), dict(response.headers)

    def auth(self):
        return {"Authorization":"Bearer "+self.app.tls["config"]["token"], "Content-Type":"application/json"}

    def test_https_upload_authenticated_and_acknowledged_after_save(self):
        code, _, _ = self.request(self.ingest, batch(point()), {"Content-Type":"application/json"})
        self.assertEqual(code, 401)
        code, body, _ = self.request(self.ingest, batch(point()), self.auth())
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body), {"result":"ok"})
        self.assertGreaterEqual(self.app.store.overview()["count"], 1)

    def test_failed_storage_never_acknowledges(self):
        with patch.object(self.app.store, "ingest", side_effect=sqlite3.OperationalError("disk full")):
            code, body, _ = self.request(self.ingest, batch(point()), self.auth())
        self.assertEqual(code, 503)
        self.assertNotIn("result", json.loads(body))

    def test_malformed_upload_returns_error_without_ack(self):
        code, body, _ = self.request(self.ingest, b'{"locations":[{}]}', self.auth())
        self.assertEqual(code, 400)
        self.assertNotIn("result", json.loads(body))

    def test_certificate_listener_exposes_only_public_profile(self):
        code, body, _ = self.request(self.trust+"/track.mobileconfig")
        self.assertEqual(code, 200)
        profile = plistlib.loads(body)
        self.assertEqual(len(profile["PayloadContent"]), 1)
        self.assertEqual(profile["PayloadContent"][0]["PayloadType"], "com.apple.security.root")
        self.assertNotIn(self.app.tls["config"]["token"].encode(), body)
        for path in ("/api/setup", "/api/points", "/ca.key", "/../config.json"):
            self.assertEqual(self.request(self.trust+path)[0], 404)
        self.assertEqual(self.request(f"https://127.0.0.1:{self.app.ingest_port}/api/setup")[0], 404)

    def test_management_blocks_rebinding_cross_origin_and_csrf(self):
        self.assertEqual(self.request(self.app.url+"/api/setup", headers={"Host":"evil.example"})[0], 403)
        self.assertEqual(self.request(self.app.url+"/api/overview", headers={"Origin":"https://evil.example"})[0], 403)
        body=json.dumps({"day":"2026-10-06", "text":"hello"}).encode()
        self.assertEqual(self.request(self.app.url+"/api/note", body)[0], 403)
        self.assertEqual(self.request(self.app.url+"/api/note", body, {"X-Track-CSRF":self.app.csrf})[0], 200)

    def test_no_cache_traversal_and_sample_is_never_saved(self):
        before=self.app.store.overview()["count"]
        code, body, headers=self.request(self.app.url+"/api/sample")
        self.assertEqual(code, 200)
        self.assertGreater(len(json.loads(body)["points"]), 10)
        self.assertEqual(self.app.store.overview()["count"], before)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(self.request(self.app.url+"/../../track.py")[0], 404)


if __name__ == "__main__":
    unittest.main()
