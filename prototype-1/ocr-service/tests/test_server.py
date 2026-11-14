"""HTTP contract of server.py, with the stub engine (no Paddle), plus the Paddle protocol against a fake worker."""
import http.client
import json
import os
import time
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import urlencode

import helpers  # noqa: F401  (puts the service folder on sys.path)
from helpers import make_pdf
import server
from server import PaddleEngine, make_server, stub_words

PNG = b"\x89PNG\r\n\x1a\n" + b"synthetic test image, the stub ignores the content"

# Fake paddle worker: same stdin/stdout protocol as paddle_worker.py, without Paddle. It prints a non-@@ line
# (Paddle logs do this), answers stub words, errors on a body starting with FAIL, exits on EXIT.
# Warm-up test worker: prints "@@ready", then one "@@[]" per stdin line.
WARM_WORKER = 'import sys\nprint("@@ready", flush=True)\nfor _ in sys.stdin:\n    print("@@[]", flush=True)\n'

FAKE_WORKER = """
import json, sys
sys.path.insert(0, {service!r})
from server import stub_words
print("@@ready", flush=True)
print("some paddle log line", flush=True)
for line in sys.stdin:
    with open(line.strip(), "rb") as f:
        head = f.read(4)
    if head == b"EXIT":
        sys.exit(0)
    if head == b"HANG":
        import time
        time.sleep(600)
    if head == b"FAIL":
        print("@@" + json.dumps({{"error": "boom"}}), flush=True)
    else:
        print("@@" + json.dumps(stub_words(), ensure_ascii=False), flush=True)
"""


class ServerCase(unittest.TestCase):
    engine_name = "stub"

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="ocr-test-")
        self.saved = {k: os.environ.get(k) for k in ("OCR_ENGINE", "OCR_TMPDIR", "PADDLE_PYTHON")}
        os.environ["OCR_ENGINE"] = self.engine_name
        os.environ["OCR_TMPDIR"] = self.tmp
        self.upload_dir = Path(self.tmp) / "cedt-ocr-uploads"  # UPLOAD_DIR is read at import, so patch it
        patcher = mock.patch.object(server, "UPLOAD_DIR", self.upload_dir)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.httpd = make_server(port=0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.httpd.engine.close()
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(self.tmp, ignore_errors=True)

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            r = conn.getresponse()
            data = r.read()
        finally:
            conn.close()
        return r.status, json.loads(data) if data else None

    def post(self, body, ctype, **query):
        path = "/parse" + ("?" + urlencode(query) if query else "")
        return self.request("POST", path, body=body, headers={"Content-Type": ctype})

    def temp_files(self):
        return os.listdir(self.upload_dir)


class StubServerTest(ServerCase):
    def test_health(self):
        self.assertEqual(self.request("GET", "/health"),
                         (200, {"ok": True, "engine": "stub", "ready": True}))

    def test_undeletable_temp_file_does_not_change_the_response(self):
        with mock.patch.object(server.os, "remove", side_effect=PermissionError("in use")):
            with self.assertLogs("ocr", level="ERROR") as cm:
                status, body = self.post(PNG, "image/png", term="1/2569", student_id="6800000021")
        self.assertEqual(status, 200)
        self.assertEqual(body["kind"], "screenshot")
        self.assertEqual(body["fields"]["amount"]["value"], "21,000.00")
        joined = "\n".join(cm.output)
        self.assertIn("temp file not deleted", joined)
        self.assertNotIn(str(self.upload_dir), joined)  # no path in the log

    def test_stray_file_in_upload_dir_is_swept_by_make_server(self):
        stray = self.upload_dir / "left-by-a-crash.pdf"
        stray.write_bytes(b"left behind by an earlier run")
        second = make_server(port=0)
        self.addCleanup(second.server_close)
        self.assertFalse(stray.exists())
        self.assertTrue(self.upload_dir.is_dir())

    def test_unknown_path_is_404(self):
        self.assertEqual(self.request("GET", "/nope")[0], 404)
        self.assertEqual(self.request("POST", "/nope", body=b"", headers={"Content-Type": "application/pdf"})[0], 404)

    def test_pdf_with_term_and_student_id(self):
        status, body = self.post(make_pdf(), "application/pdf", term="1/2569", student_id="6800000021")
        self.assertEqual(status, 200)
        self.assertEqual(body["kind"], "pdf")
        self.assertEqual(body["fields"]["semester"]["value"], "1/2569")
        self.assertEqual(body["fields"]["amount"]["value"], "21,000.00")
        self.assertEqual(len(body["fields"]["amount"]["box"]), 4)  # boxes are kept for highlighting
        checks = {c["name"]: c["state"] for c in body["checks"]}
        self.assertEqual(checks["Current semester"], "ok")
        self.assertEqual(checks["Belongs to this student"], "ok")

    def test_pdf_defaults_term_to_current(self):
        status, body = self.post(make_pdf(), "application/pdf")
        self.assertEqual(status, 200)
        names = [c["name"] for c in body["checks"]]
        self.assertIn("Current semester", names)  # term from current_term(), so the check is always present
        self.assertNotIn("Belongs to this student", names)  # no student_id given

    def test_empty_pdf_is_200_with_missing_fields(self):
        status, body = self.post(make_pdf(lines=[]), "application/pdf")
        self.assertEqual(status, 200)
        self.assertEqual(body["kind"], "pdf")
        self.assertNotIn("amount", body["fields"])
        missing = [c for c in body["checks"] if c["name"] == "All key fields read"][0]
        self.assertEqual(missing["state"], "fail")

    def test_not_a_pdf_is_200_with_no_fields(self):
        status, body = self.post(b"this is not a pdf", "application/pdf")
        self.assertEqual(status, 200)
        self.assertEqual(body["fields"], {})
        self.assertEqual(self.temp_files(), [])

    def test_image_uses_stub_words(self):
        status, body = self.post(PNG, "image/png", term="1/2569", student_id="6800000021")
        self.assertEqual(status, 200)
        self.assertEqual(body["kind"], "screenshot")
        self.assertEqual(body["fields"]["amount"]["value"], "21,000.00")
        self.assertEqual(body["fields"]["student_id"]["value"], "680000…")
        checks = {c["name"]: c["state"] for c in body["checks"]}
        self.assertEqual(checks["Payment completed"], "ok")
        self.assertEqual(checks["Belongs to this student"], "warn")

    def test_jpeg_is_accepted(self):
        status, body = self.post(PNG, "image/jpeg")
        self.assertEqual((status, body["kind"]), (200, "screenshot"))

    def test_content_type_with_parameters_is_accepted(self):
        status, _ = self.post(make_pdf(), "application/pdf; charset=binary")
        self.assertEqual(status, 200)

    def test_unknown_type_is_415(self):
        status, body = self.post(b"hello", "text/plain")
        self.assertEqual(status, 415)
        self.assertIn("error", body)

    def test_too_large_is_413_without_sending_the_body(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        try:
            conn.putrequest("POST", "/parse")
            conn.putheader("Content-Type", "application/pdf")
            conn.putheader("Content-Length", str(server.MAX_BODY + 1))
            conn.endheaders()
            r = conn.getresponse()
            status = r.status
            r.read()
        finally:
            conn.close()
        self.assertEqual(status, 413)

    def test_exactly_max_size_is_not_refused_for_size(self):
        # Size check only: a body of MAX_BODY bytes that is not a PDF still gets a 200 (no fields).
        status, _ = self.post(b"\0" * server.MAX_BODY, "application/pdf")
        self.assertEqual(status, 200)

    def test_missing_content_length_is_411(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        try:
            conn.putrequest("POST", "/parse")
            conn.putheader("Content-Type", "application/pdf")
            conn.endheaders()
            status = conn.getresponse().status
        finally:
            conn.close()
        self.assertEqual(status, 411)

    def test_temp_files_are_deleted(self):
        self.post(make_pdf(), "application/pdf")
        self.post(make_pdf(lines=[]), "application/pdf")
        self.post(b"not a pdf", "application/pdf")
        self.post(PNG, "image/png")
        self.assertEqual(self.temp_files(), [])

    def test_log_line_has_no_values(self):
        with self.assertLogs("ocr", level="INFO") as cm:
            self.post(PNG, "image/png", term="1/2569", student_id="6800000021")
        joined = "\n".join(cm.output)
        self.assertIn("POST /parse 200", joined)
        self.assertNotIn("6800000021", joined)
        self.assertNotIn("student_id", joined)
        self.assertNotIn("1234567890123", joined)


class PaddleServerTest(ServerCase):
    """Paddle path without Paddle: a fake worker script stands in for paddle_worker.py."""

    def setUp(self):
        super().setUp()
        worker_dir = tempfile.mkdtemp(prefix="ocr-fake-worker-")  # not OCR_TMPDIR, which the tests check
        self.addCleanup(shutil.rmtree, worker_dir, ignore_errors=True)
        worker = Path(worker_dir) / "fake_worker.py"
        worker.write_text(FAKE_WORKER.format(service=str(server.HERE)), encoding="utf-8")
        self.httpd.engine.close()
        self.httpd.engine = PaddleEngine(sys.executable, worker=worker, timeout=2)

    def test_hung_worker_is_killed_and_restarted(self):
        self.assertEqual(self.post(PNG, "image/png")[0], 200)
        t = time.monotonic()
        self.assertEqual(self.post(b"HANG", "image/png")[0], 503)  # killed after the 2 s timeout
        self.assertLess(time.monotonic() - t, 30)
        self.assertEqual(self.post(PNG, "image/png")[0], 200)  # fresh worker
        self.assertEqual(self.temp_files(), [])

    def test_worker_protocol_and_restart(self):
        self.assertEqual(self.request("GET", "/health")[1]["engine"], "paddle")
        status, body = self.post(PNG, "image/png")
        self.assertEqual(status, 200)  # "@@ready" and the log line are handled; words come back
        self.assertEqual(body["fields"]["amount"]["value"], "21,000.00")

        self.assertEqual(self.post(b"FAIL", "image/png"),  # worker reports an error, stays alive
                         (422, {"error": "could not read this image"}))
        self.assertEqual(self.post(PNG, "image/png")[0], 200)

        self.assertEqual(self.post(b"EXIT", "image/png")[0], 503)  # worker dies mid-request
        self.assertEqual(self.post(PNG, "image/png")[0], 200)  # restarted on the next request
        self.assertEqual(self.temp_files(), [])

    def test_missing_interpreter_is_503_but_pdf_still_works(self):
        self.httpd.engine.close()
        self.httpd.engine = PaddleEngine(str(Path(self.tmp) / "no-such-python.exe"))
        status, body = self.post(PNG, "image/png")
        self.assertEqual(status, 503)
        self.assertEqual(body, {"error": "OCR engine unavailable"})
        status, body = self.post(make_pdf(), "application/pdf")
        self.assertEqual(status, 200)
        self.assertEqual(body["fields"]["semester"]["value"], "1/2569")
        self.assertEqual(self.temp_files(), [])


class PaddleWarmTest(unittest.TestCase):
    """warm() starts the worker before any request; a failed start is logged and swallowed (the next request retries)."""

    def setUp(self):
        worker_dir = tempfile.mkdtemp(prefix="ocr-warm-worker-")  # not OCR_TMPDIR
        self.addCleanup(shutil.rmtree, worker_dir, ignore_errors=True)
        self.worker = Path(worker_dir) / "warm_worker.py"
        self.worker.write_text(WARM_WORKER, encoding="utf-8")

    def test_warm_starts_worker_before_the_first_request(self):
        engine = PaddleEngine(sys.executable, worker=self.worker, timeout=10)
        self.addCleanup(engine.close)
        self.assertFalse(engine.ready)
        engine.warm()
        self.assertTrue(engine.ready)
        self.assertIsNone(engine.proc.poll())  # the worker is running
        self.assertEqual(engine.words(str(self.worker)), [])
        self.assertTrue(engine.ready)

    def test_warm_failure_is_logged_not_raised(self):
        missing = self.worker.parent / "no-such-python.exe"
        engine = PaddleEngine(str(missing), worker=self.worker, timeout=10)
        with self.assertLogs("ocr", level="WARNING"):
            engine.warm()  # must not raise
        self.assertFalse(engine.ready)


if __name__ == "__main__":
    unittest.main()
